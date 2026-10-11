// The assistant brain: a Claude Messages API tool-use loop, called with raw fetch
// (an unbundled extension service worker cannot load the npm SDK).

import { findApp, launchApp } from './apps.js';
import { getSettings } from './settings.js';
import { TOOL_DEFINITIONS, getMemories, runTool } from './tools.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const MAX_STEPS = 10;
const CONVERSATION_IDLE_MS = 15 * 60 * 1000; // start fresh after 15 quiet minutes
const MAX_HISTORY_CHARS = 1_500_000;

async function buildSystemPrompt(settings) {
  const memories = await getMemories();
  const name = settings.userName ? `The user's name is ${settings.userName}.` : '';
  const memoryBlock = memories.length
    ? `\nThings the user asked you to remember:\n${memories.map((m) => `- ${m}`).join('\n')}`
    : '';
  return `You are Tafiq, a personal voice assistant running as a Chrome extension on the user's ChromeOS laptop. ${name}
Most messages are transcribed from speech, so expect small transcription mistakes and interpret them sensibly.
Your replies are read aloud by text-to-speech: answer in one to three short, natural sentences, with no markdown, lists, emoji, or URLs unless the user asks for detail.
Act, don't ask: when the user asks you to open, play, search, switch, close or set something, call the tool straight away, then confirm briefly ("Opening YouTube.").
To play a song or video, open a YouTube search URL (https://www.youtube.com/results?search_query=...). For directions, open a Google Maps URL.
Before closing tabs the user didn't clearly identify, check list_tabs. Never close tabs or forget memories unless asked.
You cannot control volume, brightness, Wi-Fi or install software; say so briefly if asked.
Use web search for current facts like weather, news, scores and prices.${memoryBlock}`;
}

function buildTools(settings) {
  const tools = TOOL_DEFINITIONS.map((tool) => ({ ...tool, strict: true }));
  if (settings.webSearch) tools.push({ type: 'web_search_20260209', name: 'web_search', max_uses: 3 });
  return tools;
}

async function loadConversation() {
  const { conversation } = await chrome.storage.session.get('conversation');
  if (!conversation || Date.now() - conversation.updatedAt > CONVERSATION_IDLE_MS) return [];
  if (JSON.stringify(conversation.messages).length > MAX_HISTORY_CHARS) return [];
  return conversation.messages;
}

async function saveConversation(messages) {
  await chrome.storage.session.set({ conversation: { messages, updatedAt: Date.now() } });
}

export async function resetConversation() {
  await chrome.storage.session.remove('conversation');
}

async function callClaude(settings, system, messages) {
  // Server-side fallback re-runs a safety-declined request on another model; only the
  // Opus/Fable 5.x and Sonnet 5.5 families accept it.
  const supportsFallback = /^claude-(opus-5|fable-5|sonnet-5-5)/.test(settings.model);
  const body = {
    model: settings.model,
    max_tokens: 16000,
    system,
    tools: buildTools(settings),
    messages,
    output_config: { effort: settings.effort },
  };
  const headers = {
    'content-type': 'application/json',
    'x-api-key': settings.apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
  if (supportsFallback) {
    body.fallbacks = 'default';
    headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
  }
  const res = await fetch(API_URL, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json()).error?.message || '';
    } catch {}
    if (res.status === 401) throw new Error('My API key was rejected. Please check it in the settings.');
    if (res.status === 429) throw new Error("I'm being rate limited. Please try again in a moment.");
    if (res.status >= 500) throw new Error('The AI service is having trouble right now. Please try again.');
    throw new Error(`Request failed (${res.status}). ${detail}`);
  }
  return res.json();
}

const textOf = (content) =>
  content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join(' ')
    .trim();

// Instant handling of "open X" for known apps, without waiting for the AI.
async function tryQuickCommand(text, settings) {
  const match = text.match(/^\s*(?:please\s+)?(?:open|launch|start)\s+(.+?)[.!?]*\s*$/i);
  if (!match) return null;
  const app = await findApp(match[1], settings, { exact: true });
  if (!app) return null;
  await launchApp(app, settings);
  return `Opening ${app.name}.`;
}

// Runs one user request to completion. onEvent receives progress updates for the UI.
export async function ask(text, onEvent = () => {}) {
  const settings = await getSettings();

  const quick = await tryQuickCommand(text, settings);
  if (quick) return quick;

  if (!settings.apiKey) {
    return 'I can open apps, but to answer questions I need a Claude API key. Please add one in my settings.';
  }

  const system = await buildSystemPrompt(settings);
  const messages = await loadConversation();
  const now = new Date().toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' });
  messages.push({ role: 'user', content: `[${now}] ${text}` });

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await callClaude(settings, system, messages);

    if (response.stop_reason === 'refusal') {
      messages.pop(); // drop the declined request; earlier history stays untouched
      await saveConversation(messages);
      return "Sorry, I can't help with that one.";
    }

    // Append the full content (thinking, server tool blocks, etc.) unchanged.
    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'pause_turn') continue; // server web search wants another round

    if (response.stop_reason === 'tool_use') {
      const calls = response.content.filter((block) => block.type === 'tool_use');
      calls.forEach((call) => onEvent({ kind: 'tool', name: call.name, input: call.input }));
      const results = await Promise.all(calls.map((call) => runTool(call, settings)));
      messages.push({ role: 'user', content: results });
      continue;
    }

    await saveConversation(messages);
    return textOf(response.content) || 'Done.';
  }

  await resetConversation(); // history ends mid tool-loop; start clean next time
  return 'That took too many steps, so I stopped. Could you try asking in a simpler way?';
}
