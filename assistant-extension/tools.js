// Tools Claude can call. Each tool has a JSON-schema definition and a local implementation
// that runs inside the extension using Chrome APIs.

import { findApp, getCatalog, launchApp } from './apps.js';

const strictObject = (properties, required = Object.keys(properties)) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

export const TOOL_DEFINITIONS = [
  {
    name: 'open_app',
    description:
      'Open an app on the ChromeOS device by name (e.g. "YouTube", "Gmail", "Files", "Settings", "Calculator"). ' +
      'Returns an error with the list of known apps if the name is not found; in that case try open_url with the app\'s website.',
    input_schema: strictObject({ name: { type: 'string', description: 'App name as the user said it.' } }),
  },
  {
    name: 'list_apps',
    description: 'List every app name that open_app knows about.',
    input_schema: strictObject({}),
  },
  {
    name: 'open_url',
    description:
      'Open a web address in a new tab. Use this for websites, YouTube/Google searches (build the search URL), ' +
      'maps directions, etc. Allowed schemes: https, http, chrome, mailto.',
    input_schema: strictObject({
      url: { type: 'string' },
      new_window: { type: 'boolean', description: 'Open in a separate window instead of a tab.' },
    }),
  },
  {
    name: 'search_in_browser',
    description: "Show search results in a new tab using the user's default search engine.",
    input_schema: strictObject({ query: { type: 'string' } }),
  },
  {
    name: 'list_tabs',
    description: 'List open browser tabs (id, title, url, whether active).',
    input_schema: strictObject({}),
  },
  {
    name: 'switch_to_tab',
    description: 'Bring a tab (from list_tabs) to the front.',
    input_schema: strictObject({ tab_id: { type: 'integer' } }),
  },
  {
    name: 'close_tabs',
    description: 'Close one or more tabs by id (from list_tabs).',
    input_schema: strictObject({ tab_ids: { type: 'array', items: { type: 'integer' } } }),
  },
  {
    name: 'read_page',
    description:
      'Read the visible text of a tab so you can summarize or answer questions about it. ' +
      'Omit-equivalent: pass tab_id 0 to read the currently active tab.',
    input_schema: strictObject({ tab_id: { type: 'integer' } }),
  },
  {
    name: 'set_reminder',
    description:
      'Set a timer or reminder. The user gets a notification and hears it spoken aloud. ' +
      'Give delay_seconds for timers ("in 10 minutes" = 600). Minimum 30 seconds.',
    input_schema: strictObject({
      delay_seconds: { type: 'integer' },
      message: { type: 'string', description: 'What to say when it fires, e.g. "Tea is ready".' },
    }),
  },
  {
    name: 'list_reminders',
    description: 'List pending timers and reminders.',
    input_schema: strictObject({}),
  },
  {
    name: 'cancel_reminder',
    description: 'Cancel a pending reminder by id (from list_reminders).',
    input_schema: strictObject({ id: { type: 'string' } }),
  },
  {
    name: 'remember',
    description:
      'Save a long-term fact about the user (preferences, names, routines) so you remember it in future conversations. ' +
      'Only save things the user wants remembered.',
    input_schema: strictObject({ fact: { type: 'string' } }),
  },
  {
    name: 'forget',
    description: 'Delete saved facts that contain the given text.',
    input_schema: strictObject({ text: { type: 'string' } }),
  },
];

const ALLOWED_URL = /^(https?:|chrome:|mailto:)/i;

async function getReminders() {
  return (await chrome.storage.local.get('reminders')).reminders || {};
}

export async function getMemories() {
  return (await chrome.storage.local.get('memories')).memories || [];
}

const IMPLEMENTATIONS = {
  async open_app({ name }, settings) {
    const app = await findApp(name, settings);
    if (!app) {
      const names = (await getCatalog(settings)).map((a) => a.name);
      throw new Error(`No app called "${name}". Known apps: ${names.join(', ')}`);
    }
    await launchApp(app, settings);
    return `Opened ${app.name}.`;
  },

  async list_apps(_input, settings) {
    return (await getCatalog(settings)).map((a) => a.name).join(', ');
  },

  async open_url({ url, new_window }) {
    if (!ALLOWED_URL.test(url)) throw new Error('Only https, http, chrome and mailto URLs are allowed.');
    if (new_window) await chrome.windows.create({ url, focused: true });
    else await chrome.tabs.create({ url, active: true });
    return `Opened ${url}`;
  },

  async search_in_browser({ query }) {
    await chrome.search.query({ text: query, disposition: 'NEW_TAB' });
    return `Searching for "${query}".`;
  },

  async list_tabs() {
    const tabs = await chrome.tabs.query({});
    const own = chrome.runtime.getURL('');
    return tabs
      .filter((t) => !(t.url || '').startsWith(own))
      .slice(0, 60)
      .map((t) => ({ id: t.id, title: t.title, url: t.url, active: t.active, window_id: t.windowId }));
  },

  async switch_to_tab({ tab_id }) {
    const tab = await chrome.tabs.update(tab_id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
    return `Switched to "${tab.title}".`;
  },

  async close_tabs({ tab_ids }) {
    await chrome.tabs.remove(tab_ids);
    return `Closed ${tab_ids.length} tab(s).`;
  },

  async read_page({ tab_id }) {
    let tabId = tab_id;
    if (!tabId) {
      const own = chrome.runtime.getURL('');
      const [tab] = (await chrome.tabs.query({ active: true, lastFocusedWindow: true })).filter(
        (t) => !(t.url || '').startsWith(own),
      );
      if (!tab) throw new Error('No active web page found.');
      tabId = tab.id;
    }
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({ title: document.title, url: location.href, text: document.body.innerText.slice(0, 30000) }),
    });
    return result.result;
  },

  async set_reminder({ delay_seconds, message }) {
    const seconds = Math.max(30, delay_seconds);
    const id = `r${Date.now().toString(36)}`;
    const when = Date.now() + seconds * 1000;
    const reminders = await getReminders();
    reminders[id] = { message, when };
    await chrome.storage.local.set({ reminders });
    await chrome.alarms.create(`reminder:${id}`, { when });
    return { id, fires_at: new Date(when).toLocaleString() };
  },

  async list_reminders() {
    const reminders = await getReminders();
    return Object.entries(reminders).map(([id, r]) => ({
      id,
      message: r.message,
      fires_at: new Date(r.when).toLocaleString(),
    }));
  },

  async cancel_reminder({ id }) {
    const reminders = await getReminders();
    if (!reminders[id]) throw new Error(`No reminder with id ${id}.`);
    delete reminders[id];
    await chrome.storage.local.set({ reminders });
    await chrome.alarms.clear(`reminder:${id}`);
    return 'Cancelled.';
  },

  async remember({ fact }) {
    const memories = await getMemories();
    memories.push(fact);
    await chrome.storage.local.set({ memories });
    return 'Saved.';
  },

  async forget({ text }) {
    const memories = await getMemories();
    const needle = text.toLowerCase();
    const kept = memories.filter((m) => !m.toLowerCase().includes(needle));
    await chrome.storage.local.set({ memories: kept });
    return `Removed ${memories.length - kept.length} fact(s).`;
  },
};

// Runs a tool_use block and returns the matching tool_result block.
export async function runTool(block, settings) {
  const impl = IMPLEMENTATIONS[block.name];
  try {
    if (!impl) throw new Error(`Unknown tool ${block.name}`);
    const output = await impl(block.input || {}, settings);
    return {
      type: 'tool_result',
      tool_use_id: block.id,
      content: typeof output === 'string' ? output : JSON.stringify(output),
    };
  } catch (err) {
    return { type: 'tool_result', tool_use_id: block.id, content: String(err.message || err), is_error: true };
  }
}

// Fires when a reminder alarm goes off (called from the service worker).
export async function fireReminder(alarmName) {
  const id = alarmName.slice('reminder:'.length);
  const reminders = await getReminders();
  const reminder = reminders[id];
  if (!reminder) return;
  delete reminders[id];
  await chrome.storage.local.set({ reminders });
  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Tafiq reminder',
    message: reminder.message,
    priority: 2,
    requireInteraction: true,
  });
  chrome.tts.speak(`Reminder: ${reminder.message}`, { enqueue: true });
}
