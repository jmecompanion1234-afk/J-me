// J-me service worker: the toolbar switch. One tab at a time.
const ENGINE = 'ws://127.0.0.1:8787';
let tabId = null;

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Capture the tab audio and feed the local J-me engine.',
  });
}

async function start(tab) {
  await ensureOffscreen();
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
  tabId = tab.id;
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['overlay.js'] });
  const r = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'start', streamId, engine: ENGINE, title: tab.title });
  if (r && r.ok === false) throw new Error(r.error || 'could not start');
  chrome.action.setBadgeText({ text: 'ON', tabId: tab.id });
  chrome.action.setBadgeBackgroundColor({ color: '#f2b84b', tabId: tab.id });
  chrome.action.setTitle({ title: 'J-me: listening to this tab (click to stop)', tabId: tab.id });
}

async function stop() {
  const t = tabId;
  tabId = null;
  try { await chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop' }); } catch {}
  if (t != null) {
    try { await chrome.action.setBadgeText({ text: '', tabId: t }); } catch {}
    try { await chrome.action.setTitle({ title: 'J-me: listen to this tab', tabId: t }); } catch {}
    try { await chrome.tabs.sendMessage(t, { type: 'off' }); } catch {}
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (tabId === tab.id) { await stop(); return; }
  if (tabId != null) await stop();
  try {
    await start(tab);
  } catch (e) {
    const t = tabId; tabId = null;
    chrome.action.setBadgeText({ text: '!', tabId: tab.id });
    chrome.action.setTitle({ title: 'J-me could not start: ' + e.message, tabId: tab.id });
    try { await chrome.tabs.sendMessage(tab.id, { type: 'status', text: 'could not start: ' + e.message }); } catch {}
  }
});

chrome.tabs.onRemoved.addListener((id) => { if (id === tabId) stop(); });

// Engine events arrive from the offscreen page and go to the overlay in the captured tab.
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || msg.target !== 'sw') return;
  if (msg.type === 'event' && tabId != null) chrome.tabs.sendMessage(tabId, msg.ev).catch(() => {});
  else if (msg.type === 'engine-down') {
    if (tabId != null) chrome.tabs.sendMessage(tabId, { type: 'status', text: 'engine not running: double-click J-me.cmd, then click the switch again' }).catch(() => {});
    stop();
  }
  reply();
});
