import { getSettings, saveSettings } from './settings.js';

const $ = (id) => document.getElementById(id);
const TEXT_FIELDS = ['apiKey', 'model', 'effort', 'userName', 'wakeWords', 'language', 'customApps'];
const CHECK_FIELDS = ['webSearch', 'alwaysOn', 'appsInWindow'];

async function renderMemories() {
  const { memories = [] } = await chrome.storage.local.get('memories');
  const list = $('memories');
  list.replaceChildren();
  if (!memories.length) {
    const li = document.createElement('li');
    li.textContent = 'Nothing yet.';
    list.appendChild(li);
  }
  memories.forEach((fact, index) => {
    const li = document.createElement('li');
    li.textContent = `${fact} `;
    const remove = document.createElement('button');
    remove.textContent = 'Remove';
    remove.style.padding = '0 8px';
    remove.onclick = async () => {
      memories.splice(index, 1);
      await chrome.storage.local.set({ memories });
      renderMemories();
    };
    li.appendChild(remove);
    list.appendChild(li);
  });
}

async function load() {
  const settings = await getSettings();
  TEXT_FIELDS.forEach((id) => ($(id).value = settings[id]));
  CHECK_FIELDS.forEach((id) => ($(id).checked = settings[id]));
  renderMemories();
}

$('save').onclick = async () => {
  const patch = {};
  TEXT_FIELDS.forEach((id) => (patch[id] = $(id).value.trim()));
  CHECK_FIELDS.forEach((id) => (patch[id] = $(id).checked));
  if (!patch.model) patch.model = 'claude-opus-5-5';
  await saveSettings(patch);
  $('saved').textContent = 'Saved ✓';
  setTimeout(() => ($('saved').textContent = ''), 2000);
};

$('openListener').onclick = () => chrome.runtime.sendMessage({ type: 'open-listener' });

load();
