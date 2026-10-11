// Renders conversation events broadcast by the service worker.

const TOOL_LABELS = {
  open_app: 'Opening app…',
  open_url: 'Opening page…',
  search_in_browser: 'Searching…',
  list_tabs: 'Checking tabs…',
  switch_to_tab: 'Switching tab…',
  close_tabs: 'Closing tabs…',
  read_page: 'Reading page…',
  set_reminder: 'Setting reminder…',
  list_reminders: 'Checking reminders…',
  cancel_reminder: 'Cancelling reminder…',
  remember: 'Remembering…',
  forget: 'Forgetting…',
};

export function attachLog(container) {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type !== 'log') return;
    const el = document.createElement('div');
    el.className = `msg ${message.role}`;
    el.textContent = message.role === 'tool' ? TOOL_LABELS[message.text] || message.text : message.text;
    container.appendChild(el);
    while (container.children.length > 100) container.firstChild.remove();
    el.scrollIntoView({ block: 'end', behavior: 'smooth' });
  });
}
