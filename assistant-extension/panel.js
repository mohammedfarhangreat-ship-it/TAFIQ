// Side panel: typed chat with the same assistant, plus a button to start voice.

import { attachLog } from './log.js';

const $ = (id) => document.getElementById(id);

attachLog($('log'));
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'log') $('empty')?.remove();
});

$('form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = $('input').value.trim();
  if (!text) return;
  $('input').value = '';
  await chrome.runtime.sendMessage({ type: 'ask', text, source: 'text' });
});

$('mic').onclick = () => chrome.runtime.sendMessage({ type: 'request-wake' });
$('settings').onclick = () => chrome.runtime.openOptionsPage();
$('new').onclick = async () => {
  await chrome.runtime.sendMessage({ type: 'reset' });
  $('log').replaceChildren();
};
