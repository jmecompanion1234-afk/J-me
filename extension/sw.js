// J-me service worker: the toolbar switch. One tab at a time. The ear and the brain live in
// the offscreen page; this file only routes.
let tabId = null;

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Capture the tab audio and run speech recognition and the anticipating model on this device.',
  });
}

/** The brain preference, when one is stored (chrome.storage.local.brainOrder, e.g. ["webllm"]). */
async function brainPrefs() {
  const { brainOrder } = await chrome.storage.local.get('brainOrder');
  return Array.isArray(brainOrder) && brainOrder.length ? { order: brainOrder } : {};
}

/** Message the offscreen page; it answers only once its (large) module has loaded, so retry
 *  through "Receiving end does not exist" for up to ~20 s. */
async function send(msg, tries = 40) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await chrome.runtime.sendMessage({ target: 'offscreen', ...msg });
      if (r !== undefined) return r;
    } catch (e) {
      last = e;
      if (!/Receiving end does not exist/.test(String(e && e.message))) throw e;
    }
    await new Promise((f) => setTimeout(f, 500));
  }
  throw new Error('the J-me page did not answer' + (last ? ': ' + last.message : ''));
}

async function start(tab) {
  await ensureOffscreen();
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
  tabId = tab.id;
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['overlay.js'] });
  chrome.action.setBadgeText({ text: '…', tabId: tab.id });
  chrome.action.setBadgeBackgroundColor({ color: '#f2b84b', tabId: tab.id });
  const r = await send({ type: 'start', streamId, title: tab.title, brain: await brainPrefs() });
  if (r && r.ok === false) throw new Error(r.error || 'could not start');
  chrome.action.setBadgeText({ text: 'ON', tabId: tab.id });
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
    tabId = null;
    console.error('J-me could not start', e);
    // Release a half-taken tab stream, or the next click fails with "Error starting tab capture".
    chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop' }).catch(() => {});
    chrome.action.setBadgeText({ text: '!', tabId: tab.id });
    chrome.action.setTitle({ title: 'J-me could not start: ' + e.message, tabId: tab.id });
    try { await chrome.tabs.sendMessage(tab.id, { type: 'status', text: 'could not start: ' + e.message }); } catch {}
  }
});

chrome.tabs.onRemoved.addListener((id) => { if (id === tabId) stop(); });

// Warm the models right after install, so the first click does not wait for the download.
// (A short delay lets a stored brain preference land first.)
chrome.runtime.onInstalled.addListener(() => {
  setTimeout(async () => {
    try {
      await ensureOffscreen();
      await send({ type: 'prepare', brain: await brainPrefs() });
    } catch {}
  }, 3000);
});

// Engine events arrive from the offscreen page and go to the overlay in the captured tab.
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || msg.target !== 'sw') return;
  if (msg.type === 'event') {
    if (tabId != null) chrome.tabs.sendMessage(tabId, msg.ev).catch(() => {});
    if (globalThis.__events) globalThis.__events.push(msg.ev); // test harness hook
  } else if (msg.type === 'stopped') {
    stop();
  }
  reply();
});
