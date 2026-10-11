// App catalog: maps spoken names to something we can open on ChromeOS.
// Order of lookup: user's custom apps -> installed Chrome apps -> built-in web apps.

const BUILT_IN_APPS = [
  { name: 'Gmail', aliases: ['mail', 'email', 'g mail'], url: 'https://mail.google.com/' },
  { name: 'YouTube', aliases: ['you tube', 'yt'], url: 'https://www.youtube.com/' },
  { name: 'YouTube Music', aliases: ['music', 'youtube music'], url: 'https://music.youtube.com/' },
  { name: 'Google Drive', aliases: ['drive'], url: 'https://drive.google.com/' },
  { name: 'Google Docs', aliases: ['docs', 'documents'], url: 'https://docs.google.com/document/' },
  { name: 'Google Sheets', aliases: ['sheets', 'spreadsheets'], url: 'https://docs.google.com/spreadsheets/' },
  { name: 'Google Slides', aliases: ['slides', 'presentations'], url: 'https://docs.google.com/presentation/' },
  { name: 'Google Calendar', aliases: ['calendar'], url: 'https://calendar.google.com/' },
  { name: 'Google Maps', aliases: ['maps'], url: 'https://maps.google.com/' },
  { name: 'Google Photos', aliases: ['photos', 'gallery'], url: 'https://photos.google.com/' },
  { name: 'Google Meet', aliases: ['meet'], url: 'https://meet.google.com/' },
  { name: 'Google Keep', aliases: ['keep', 'notes'], url: 'https://keep.google.com/' },
  { name: 'Google Translate', aliases: ['translate', 'translator'], url: 'https://translate.google.com/' },
  { name: 'Google', aliases: ['google search'], url: 'https://www.google.com/' },
  { name: 'Play Store', aliases: ['google play', 'play store'], url: 'https://play.google.com/store' },
  { name: 'WhatsApp', aliases: ['whatsapp', 'whats app'], url: 'https://web.whatsapp.com/' },
  { name: 'Telegram', aliases: [], url: 'https://web.telegram.org/' },
  { name: 'Instagram', aliases: ['insta'], url: 'https://www.instagram.com/' },
  { name: 'Facebook', aliases: ['fb'], url: 'https://www.facebook.com/' },
  { name: 'X', aliases: ['twitter'], url: 'https://x.com/' },
  { name: 'LinkedIn', aliases: ['linked in'], url: 'https://www.linkedin.com/' },
  { name: 'Spotify', aliases: [], url: 'https://open.spotify.com/' },
  { name: 'Netflix', aliases: [], url: 'https://www.netflix.com/' },
  { name: 'GitHub', aliases: ['git hub'], url: 'https://github.com/' },
  { name: 'Claude', aliases: ['claude ai'], url: 'https://claude.ai/' },
  { name: 'Outlook', aliases: ['hotmail'], url: 'https://outlook.live.com/' },
  { name: 'Canva', aliases: [], url: 'https://www.canva.com/' },
  // ChromeOS / Chrome system pages (best effort: availability depends on ChromeOS version).
  { name: 'Files', aliases: ['file manager', 'my files', 'files app'], url: 'chrome://file-manager/' },
  { name: 'ChromeOS Settings', aliases: ['settings', 'system settings', 'os settings'], url: 'chrome://os-settings/' },
  { name: 'Chrome Settings', aliases: ['browser settings'], url: 'chrome://settings/' },
  { name: 'Downloads', aliases: ['download'], url: 'chrome://downloads/' },
  { name: 'History', aliases: ['browser history'], url: 'chrome://history/' },
  { name: 'Extensions', aliases: [], url: 'chrome://extensions/' },
  { name: 'Bookmarks', aliases: ['bookmark manager'], url: 'chrome://bookmarks/' },
];

export function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(the|app|application|please|my)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// "Name = https://url" per line.
export function parseCustomApps(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.split('='))
    .filter((parts) => parts.length >= 2)
    .map(([name, ...rest]) => ({ name: name.trim(), aliases: [], url: rest.join('=').trim() }))
    .filter((app) => app.name && app.url);
}

async function installedChromeApps() {
  try {
    const all = await chrome.management.getAll();
    return all
      .filter((item) => item.isApp && item.enabled)
      .map((item) => ({ name: item.name, aliases: [], chromeAppId: item.id }));
  } catch {
    return [];
  }
}

export async function getCatalog(settings) {
  return [
    ...parseCustomApps(settings.customApps),
    ...(await installedChromeApps()),
    ...BUILT_IN_APPS,
  ];
}

// exact=true skips fuzzy prefix matching (used for the instant no-AI path).
export async function findApp(query, settings, { exact = false } = {}) {
  const wanted = normalize(query);
  if (!wanted) return null;
  const catalog = await getCatalog(settings);
  const keys = (app) => [app.name, ...app.aliases].map(normalize);
  return (
    catalog.find((app) => keys(app).includes(wanted)) ||
    (!exact &&
      catalog.find((app) =>
        keys(app).some((k) => k.length >= 3 && wanted.length >= 3 && (k.startsWith(wanted) || wanted.startsWith(k))),
      )) ||
    null
  );
}

export async function launchApp(app, settings) {
  if (app.chromeAppId) {
    await chrome.management.launchApp(app.chromeAppId);
    return;
  }
  if (settings.appsInWindow && /^https?:/.test(app.url)) {
    await chrome.windows.create({ url: app.url, type: 'popup', focused: true, width: 1200, height: 800 });
  } else {
    await chrome.tabs.create({ url: app.url, active: true });
  }
}
