// Service worker: keeps the always-on listener tab alive, routes requests to the agent,
// fires reminders, and handles the keyboard shortcut.

import { ask, resetConversation } from './agent.js';
import { getSettings } from './settings.js';
import { fireReminder } from './tools.js';

const LISTENER_URL = chrome.runtime.getURL('listener.html');

async function findListenerTab() {
  const tabs = await chrome.tabs.query({});
  return tabs.find((tab) => (tab.url || tab.pendingUrl || '').startsWith(LISTENER_URL)) || null;
}

async function ensureListenerTab({ focus = false, wake = false } = {}) {
  let tab = await findListenerTab();
  if (!tab) {
    const url = wake ? `${LISTENER_URL}#wake` : LISTENER_URL;
    tab = await chrome.tabs.create({ url, pinned: true, active: focus });
  } else if (focus) {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  }
  // Never let Chrome discard the listener to save memory.
  await chrome.tabs.update(tab.id, { autoDiscardable: false });
  return tab;
}

function broadcast(message) {
  chrome.runtime.sendMessage(message).catch(() => {}); // no open pages is fine
}

// Serialize requests so two commands never interleave in one conversation.
let queue = Promise.resolve();
function enqueueAsk(text, source) {
  const run = async () => {
    broadcast({ type: 'log', role: 'user', text, source });
    try {
      const reply = await ask(text, (event) => broadcast({ type: 'log', role: 'tool', text: `${event.name}` }));
      broadcast({ type: 'log', role: 'assistant', text: reply, source });
      return { reply };
    } catch (err) {
      const reply = String(err.message || err);
      broadcast({ type: 'log', role: 'error', text: reply, source });
      return { reply, error: true };
    }
  };
  const result = queue.then(run);
  queue = result.catch(() => {});
  return result;
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  chrome.alarms.create('keepalive', { periodInMinutes: 1 });
  const settings = await getSettings();
  if (reason === 'install') {
    await ensureListenerTab({ focus: true }); // focus so the mic permission prompt is visible
    if (!settings.apiKey) chrome.runtime.openOptionsPage();
  } else if (settings.alwaysOn) {
    await ensureListenerTab();
  }
});

chrome.runtime.onStartup.addListener(async () => {
  chrome.alarms.create('keepalive', { periodInMinutes: 1 });
  if ((await getSettings()).alwaysOn) await ensureListenerTab();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'keepalive') {
    if ((await getSettings()).alwaysOn) await ensureListenerTab();
  } else if (alarm.name.startsWith('reminder:')) {
    await fireReminder(alarm.name);
  }
});

// Start listening right away (keyboard shortcut or the mic button in the side panel).
async function wakeListener() {
  if (await findListenerTab()) broadcast({ type: 'wake' });
  else await ensureListenerTab({ wake: true });
}

chrome.commands.onCommand.addListener((command) => {
  if (command === 'wake') wakeListener();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'ask') {
    enqueueAsk(message.text, message.source).then(sendResponse);
    return true; // async response
  }
  if (message.type === 'reset') {
    resetConversation().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === 'request-wake') {
    wakeListener().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === 'open-listener') {
    ensureListenerTab({ focus: true }).then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});
