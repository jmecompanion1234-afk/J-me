// J-me service worker: the switches. The toolbar icon is "this tab"; the side panel has the
// "microphone" switch. One source at a time. The ear and the brain live in the offscreen page;
// this file only routes.
let source = null; // null | { kind: 'tab', tabId } | { kind: 'mic' }

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Capture the tab or microphone audio and run speech recognition and the anticipating model on this device.',
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

async function startTab(tab) {
  // The side panel is the big view (Chrome makes room for it; drag its edge to half the
  // screen). Opening it needs the click itself, so it goes first. The small panel on the
  // page is a setting.
  const { overlayOnPage } = await chrome.storage.local.get('overlayOnPage');
  try { await chrome.sidePanel.open({ windowId: tab.windowId }); } catch (e) { console.warn('side panel', e); }
  await ensureOffscreen();
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
  source = { kind: 'tab', tabId: tab.id };
  if (overlayOnPage) await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['overlay.js'] });
  chrome.action.setBadgeText({ text: '…', tabId: tab.id });
  chrome.action.setBadgeBackgroundColor({ color: '#f2b84b', tabId: tab.id });
  const r = await send({ type: 'start', streamId, title: tab.title, brain: await brainPrefs() });
  if (r && r.ok === false) throw new Error(r.error || 'could not start');
  chrome.action.setBadgeText({ text: 'ON', tabId: tab.id });
  chrome.action.setTitle({ title: 'J-me: listening to this tab (click to stop)', tabId: tab.id });
}

async function startMic() {
  await ensureOffscreen();
  source = { kind: 'mic' };
  chrome.action.setBadgeText({ text: 'MIC' });
  chrome.action.setBadgeBackgroundColor({ color: '#f2b84b' });
  const r = await send({ type: 'start', mic: true, brain: await brainPrefs() });
  if (r && r.ok === false) throw new Error(r.error || 'could not start');
  chrome.action.setTitle({ title: 'J-me: listening to the microphone (switch off in the side panel)' });
}

async function stop() {
  const s = source;
  source = null;
  try { await chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop' }); } catch {}
  if (s && s.kind === 'tab') {
    try { await chrome.action.setBadgeText({ text: '', tabId: s.tabId }); } catch {}
    try { await chrome.action.setTitle({ title: 'J-me: listen to this tab', tabId: s.tabId }); } catch {}
    try { await chrome.tabs.sendMessage(s.tabId, { type: 'off' }); } catch {}
  } else {
    try { await chrome.action.setBadgeText({ text: '' }); } catch {}
    try { await chrome.action.setTitle({ title: 'J-me: listen to this tab' }); } catch {}
  }
  chrome.runtime.sendMessage({ target: 'panel', ev: { type: 'off' } }).catch(() => {});
}

function failed(e, tab) {
  source = null;
  console.error('J-me could not start', e);
  // Release a half-taken stream, or the next click fails with "Error starting tab capture".
  chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop' }).catch(() => {});
  const text = 'could not start: ' + (e && e.message ? e.message : String(e));
  if (tab) {
    chrome.action.setBadgeText({ text: '!', tabId: tab.id });
    chrome.action.setTitle({ title: 'J-me ' + text, tabId: tab.id });
    chrome.tabs.sendMessage(tab.id, { type: 'status', text }).catch(() => {});
  } else {
    chrome.action.setBadgeText({ text: '' }).catch(() => {});
  }
  chrome.runtime.sendMessage({ target: 'panel', ev: { type: 'status', text } }).catch(() => {});
}

chrome.action.onClicked.addListener(async (tab) => {
  if (source && source.kind === 'tab' && source.tabId === tab.id) { await stop(); return; }
  if (source) await stop();
  try {
    await startTab(tab);
  } catch (e) {
    failed(e, tab);
  }
});

chrome.tabs.onRemoved.addListener((id) => { if (source && source.kind === 'tab' && source.tabId === id) stop(); });

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'panel', title: 'Open the J-me panel (microphone, cards)', contexts: ['action'] });
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
  // Warm the models right after install, so the first click does not wait for the download.
  // (A short delay lets a stored brain preference land first.)
  setTimeout(async () => {
    try {
      await ensureOffscreen();
      await send({ type: 'prepare', brain: await brainPrefs() });
    } catch {}
  }, 3000);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'panel' && tab) chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
});

// Engine events arrive from the offscreen page and go to the overlay in the captured tab and to
// the side panel, when it is open. The panel's switch and state query land here too.
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || msg.target !== 'sw') return;
  if (msg.type === 'event') {
    if (source && source.kind === 'tab') chrome.tabs.sendMessage(source.tabId, msg.ev).catch(() => {});
    chrome.runtime.sendMessage({ target: 'panel', ev: msg.ev }).catch(() => {});
    if (globalThis.__events) globalThis.__events.push(msg.ev); // test harness hook
    reply();
  } else if (msg.type === 'stopped') {
    stop();
    reply();
  } else if (msg.type === 'state') {
    reply({ source });
  } else if (msg.type === 'mic') {
    (async () => {
      if (!msg.on) { await stop(); reply({ ok: true }); return; }
      if (source) await stop();
      try { await startMic(); reply({ ok: true }); }
      catch (e) { failed(e, null); reply({ ok: false, error: e && e.message ? e.message : String(e) }); }
    })();
    return true;
  } else {
    reply();
  }
});
