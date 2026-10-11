// Shared settings helpers (used by the service worker and extension pages).

export const DEFAULT_SETTINGS = {
  apiKey: '',
  model: 'claude-opus-5-5',
  effort: 'low', // low = fastest replies, good for voice. Raise for harder tasks.
  userName: '',
  language: 'en-US',
  wakeWords: 'hey tafiq, hey taufiq, hey tawfiq, hey tofik, ok tafiq, hi tafiq',
  alwaysOn: true,
  webSearch: true,
  appsInWindow: false,
  customApps: '',
};

export async function getSettings() {
  const stored = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
}

export async function saveSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}
