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

async function startTab(tab, panelOpened) {
  await ensureOffscreen();
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
  source = { kind: 'tab', tabId: tab.id };
  // The small panel on the page is a setting, and the fallback when the side panel could not open.
  const { overlayOnPage } = await chrome.storage.local.get('overlayOnPage');
  // Only fall back to the on-page panel when no side panel is actually showing. The open()
  // promise is not a reliable witness (it can reject while the panel opens anyway), so ask Chrome
  // whether a side-panel page of ours exists.
  if (overlayOnPage || !(panelOpened || (await panelShowing()))) await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['overlay.js'] });
  const page = await readPage(tab);
  chrome.action.setBadgeText({ text: '…', tabId: tab.id });
  chrome.action.setBadgeBackgroundColor({ color: '#f2b84b', tabId: tab.id });
  const r = await send({ type: 'start', streamId, title: tab.title, page, brain: await brainPrefs() });
  if (r && r.ok === false) throw new Error(r.error || 'could not start');
  chrome.action.setBadgeText({ text: 'ON', tabId: tab.id });
  chrome.action.setTitle({ title: 'J-me: listening to this tab (click to stop)', tabId: tab.id });
}

/** Is a J-me side panel open in some window? Gives it a moment to appear first. */
async function panelShowing() {
  for (let i = 0; i < 6; i++) {
    try {
      const ctxs = await chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] });
      if (ctxs.length) return true;
    } catch { return false; }
    await new Promise((f) => setTimeout(f, 250));
  }
  return false;
}

/** What the page says it is: title, author/channel, description, URL. Read in the tab (the click
 *  grants it), so the brain knows who is talking and what about. Best effort: a page that cannot
 *  be read (chrome://, the Web Store) gives just the tab title. */
async function readPage(tab) {
  const fallback = { title: tab.title || '', author: '', description: '', url: tab.url || '' };
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN', // the page's own globals (YouTube keeps its video data there)
      func: () => {
        const meta = (sel) => { const el = document.querySelector(sel); return (el && (el.getAttribute('content') || el.getAttribute('href') || el.textContent) || '').trim(); };
        const text = (s) => s.replace(/\s+/g, ' ').trim();
        // YouTube: the watch page keeps its data in ytInitialPlayerResponse; the DOM has the channel.
        let author = meta('link[itemprop="name"]') || meta('meta[name="author"]') || meta('meta[property="article:author"]') || meta('ytd-channel-name a') || meta('#owner #channel-name a') || meta('[itemprop="author"] [itemprop="name"]');
        let description = meta('meta[name="description"]') || meta('meta[property="og:description"]');
        try {
          const yt = window.ytInitialPlayerResponse && window.ytInitialPlayerResponse.videoDetails;
          if (yt) { author = yt.author || author; description = yt.shortDescription || description; }
        } catch {}
        if (!description) description = text(document.body ? document.body.innerText.slice(0, 1500) : '');
        return { title: text(meta('meta[property="og:title"]') || document.title), author: text(author), description: text(description).slice(0, 700), url: location.href };
      },
    });
    return res && res.result ? res.result : fallback;
  } catch (e) {
    console.warn('J-me could not read the page', e);
    return fallback;
  }
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
  // The side panel is the big view (Chrome makes room for it; drag its edge to half the
  // screen). Chrome only opens it in direct response to the click, before any await, so it
  // goes first, synchronously.
  const opening = chrome.sidePanel.open({ windowId: tab.windowId }).then(() => true, (e) => { console.warn('side panel did not open', e); return false; });
  if (source) await stop();
  try {
    await startTab(tab, await opening);
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
  } else if (msg.type === 'open' && typeof msg.url === 'string' && /^https:\/\//.test(msg.url)) {
    // The AI's page in its own small window, so the listened-to tab keeps focus.
    chrome.windows.create({ url: msg.url, type: 'popup', width: 560, height: 760, focused: true }).catch(() => chrome.tabs.create({ url: msg.url, active: false }));
    reply({ ok: true });
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
