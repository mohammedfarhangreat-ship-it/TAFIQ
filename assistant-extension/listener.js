// Always-on listener: continuous speech recognition with a wake word, then hands the
// command to the service worker and speaks the reply.

import { attachLog } from './log.js';
import { getSettings } from './settings.js';

const AWAKE_MS = 8000; // how long to wait for a command after the wake word
const FOLLOW_UP_MS = 7000; // after a reply, listen this long for a follow-up without the wake word
const STOP_WORDS = /^(stop|cancel|never ?mind|shut up|quiet|that's all|thank you|thanks)[.!]*$/i;

const $ = (id) => document.getElementById(id);
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

let settings;
let recognition;
let wakePattern;
let running = false;
let paused = false;
let busy = false;
let awakeUntil = 0;
let restartDelay = 250;

function setState(state, text) {
  document.body.dataset.state = state;
  $('status').textContent = text;
}

function showListeningState() {
  if (paused) setState('paused', 'Listening paused.');
  else if (Date.now() < awakeUntil) setState('awake', "I'm listening…");
  else setState('idle', `Say “${firstWakeWord()}” to start.`);
}

function firstWakeWord() {
  return (settings.wakeWords.split(',')[0] || 'hey tafiq').trim();
}

function buildWakePattern() {
  const words = settings.wakeWords
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[\\s,]+'));
  wakePattern = new RegExp(`\\b(?:${words.join('|')})\\b[\\s,.!?]*`, 'i');
}

function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
    osc.onended = () => ctx.close();
  } catch {}
}

function wake() {
  chrome.tts.stop();
  if (Date.now() >= awakeUntil) beep();
  awakeUntil = Date.now() + AWAKE_MS;
  paused = false;
  showListeningState();
  startRecognition();
  setTimeout(() => !busy && showListeningState(), AWAKE_MS + 100);
}

function startRecognition() {
  if (running || paused || busy) return;
  recognition.lang = settings.language;
  try {
    recognition.start();
    running = true;
  } catch {
    // already started
  }
}

function stopRecognition() {
  if (running) recognition.abort();
  running = false;
}

function speak(text) {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    // Safety net in case the TTS engine never reports the end.
    const timer = setTimeout(done, 15000 + text.length * 120);
    chrome.tts.speak(text, {
      lang: settings.language,
      onEvent: (e) => {
        if (['end', 'interrupted', 'cancelled', 'error'].includes(e.type)) done();
      },
    });
  });
}

async function sendCommand(text) {
  busy = true;
  awakeUntil = 0;
  stopRecognition();
  $('heard').textContent = `“${text}”`;
  setState('thinking', 'Thinking…');
  let reply;
  try {
    ({ reply } = await chrome.runtime.sendMessage({ type: 'ask', text, source: 'voice' }));
  } catch (err) {
    reply = 'Sorry, something went wrong.';
  }
  setState('speaking', 'Speaking…');
  await speak(reply);
  busy = false;
  awakeUntil = Date.now() + FOLLOW_UP_MS;
  showListeningState();
  startRecognition();
  setTimeout(() => !busy && showListeningState(), FOLLOW_UP_MS + 100);
}

function handleFinal(raw) {
  const text = raw.trim();
  if (!text) return;
  const match = text.match(wakePattern);
  const wasAwake = Date.now() < awakeUntil;

  let command = null;
  if (match) {
    command = text.slice(match.index + match[0].length).trim();
    if (!command) {
      wake();
      return;
    }
  } else if (wasAwake) {
    command = text;
  }
  if (!command) return; // ordinary conversation in the room; ignore

  if (STOP_WORDS.test(command)) {
    chrome.tts.stop();
    awakeUntil = 0;
    showListeningState();
    return;
  }
  sendCommand(command);
}

function setupRecognition() {
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    restartDelay = 250;
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) handleFinal(result[0].transcript);
      else interim += result[0].transcript;
    }
    if (busy) return;
    $('heard').textContent = interim;
    // React to the wake word as soon as it's heard, before the sentence ends.
    if (interim && wakePattern.test(interim) && Date.now() >= awakeUntil) {
      beep();
      awakeUntil = Date.now() + AWAKE_MS;
      showListeningState();
    }
  };

  recognition.onerror = (event) => {
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      paused = true;
      setState('error', 'Microphone blocked.');
      $('error').textContent =
        'Tafiq needs microphone access. Click the icon at the right of the address bar (or open Chrome settings → Privacy → Site settings → Microphone), allow it for this extension, then reload this tab.';
    } else if (event.error === 'network') {
      restartDelay = Math.min(restartDelay * 2, 30000); // offline: back off
    }
    // "no-speech" and "aborted" are normal; onend restarts.
  };

  recognition.onend = () => {
    running = false;
    if (!paused && !busy) setTimeout(startRecognition, restartDelay);
  };
}

async function requestMicrophone() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    setState('error', 'Microphone blocked.');
    $('error').textContent =
      'Please allow microphone access for Tafiq (click “Allow” on the prompt, or the camera/mic icon in the address bar), then reload this tab.';
    return false;
  }
}

async function main() {
  settings = await getSettings();
  buildWakePattern();
  attachLog($('log'));

  $('talk').onclick = wake;
  $('stop').onclick = () => chrome.tts.stop();
  $('pause').onclick = () => {
    paused = !paused;
    $('pause').textContent = paused ? 'Resume listening' : 'Pause listening';
    if (paused) stopRecognition();
    else startRecognition();
    showListeningState();
  };
  $('settings').onclick = () => chrome.runtime.openOptionsPage();

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'wake') wake();
  });
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local' || !changes.settings) return;
    settings = await getSettings();
    buildWakePattern();
    if (!busy) showListeningState();
  });

  if (!SpeechRecognition) {
    setState('error', 'Speech recognition is not available in this browser.');
    return;
  }
  if (!(await requestMicrophone())) return;

  setupRecognition();
  showListeningState();
  startRecognition();
  if (location.hash === '#wake') {
    history.replaceState(null, '', location.pathname);
    wake();
  }
}

main();
