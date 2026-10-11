# Tafiq Voice Assistant (ChromeOS)

A personal, always-on voice assistant that runs as a Chrome extension on your Chromebook.
Say **"Hey Tafiq"** and then what you want:

- "Hey Tafiq, open YouTube" / "open Files" / "open Settings" / "open Calculator"
- "Hey Tafiq, play Arijit Singh songs on YouTube"
- "Hey Tafiq, set a timer for 10 minutes for my tea"
- "Hey Tafiq, remind me in an hour to call mum"
- "Hey Tafiq, summarize this page"
- "Hey Tafiq, close all my YouTube tabs" / "switch to my Gmail tab"
- "Hey Tafiq, what's the weather in Hyderabad today?"
- "Hey Tafiq, remember that my exam is on the 20th"

After it answers, it keeps listening for about 7 seconds, so you can follow up without
saying the wake word again. Say "stop" to cut it off.

## Install on your Chromebook

1. Download this folder (`assistant-extension`) to your Chromebook, e.g. into **My files → Downloads**.
   (On GitHub: **Code → Download ZIP**, then unzip it in the Files app.)
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick the `assistant-extension` folder.
5. A pinned **Tafiq** tab opens. Click **Allow** when Chrome asks for the microphone.
6. The settings page opens. Paste your **Claude API key** (from
   [console.anthropic.com](https://console.anthropic.com) → API Keys), add your name, and click **Save**.

That's it. Say "Hey Tafiq, open YouTube" to try it.

Opening apps by name ("open Gmail") works even without an API key; everything else needs one.

## How "always active" works

- The pinned **Tafiq** tab is the ears: it listens continuously for the wake word.
  Keep it pinned; Chrome is told never to discard it.
- When Chrome starts (i.e. every time you log in to your Chromebook) the tab is re-opened
  automatically, and a check every minute re-opens it if it was closed.
  Turn this off with **Always on** in settings.
- **Alt+Shift+T** starts listening immediately, without the wake word
  (change it at `chrome://extensions/shortcuts`).
- Click the Tafiq toolbar icon to open a **side panel** where you can type instead of talk.

## Tips

- If it doesn't react to "Hey Tafiq", watch what appears under the orb on the listening tab while
  you speak. Speech recognition may hear "Hey Taufiq" or "Hey Tofik" — add that spelling to
  **Wake words** in settings.
- Add your own apps or websites under **Settings → Apps** (`Name = https://…`), then say "open Name".
- Change the language under **Settings → Voice** (Hindi, Urdu, Arabic and others).
- "New chat" in the side panel clears the conversation. It also resets itself after 15 quiet minutes.

## Limitations

- Chrome extensions can't change volume, brightness or Wi-Fi, or install apps. Tafiq says so if asked.
- Android/Linux apps can't be launched directly; web apps, Chrome apps and ChromeOS pages
  (Files, Settings, Downloads…) can.
- Timers shorter than 30 seconds are rounded up to 30 seconds (Chrome alarm limit).
- Speech recognition uses Chrome's built-in service, which needs an internet connection.
- The mic indicator stays on while listening; that's expected.

## Privacy and cost

- Your API key, memories and settings are stored only in this extension on your device.
- Wake-word listening happens in Chrome's speech recognition. Only what you say *after* the wake
  word (plus page text when you ask it to read a page) is sent to Claude.
- Each request uses Claude API credits. "Thinking effort: Low" (the default) keeps replies fast and cheap.

## Files

| File | What it does |
| --- | --- |
| `manifest.json` | Extension definition and permissions |
| `background.js` | Keeps the listening tab alive, routes requests, fires reminders, keyboard shortcut |
| `listener.html/js` | Always-on microphone, wake word detection, speaks replies |
| `agent.js` | Claude API tool-use loop and personality |
| `tools.js` | What Claude can do: open apps/URLs, tabs, read page, reminders, memory |
| `apps.js` | App name → URL / Chrome app lookup |
| `panel.html/js` | Side panel chat |
| `options.html/js` | Settings page |
