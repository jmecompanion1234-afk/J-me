// Settings: which AI the cards hand off to, the microphone permission, and the brain choice.
const micstate = document.getElementById('micstate');
const brain = document.getElementById('brain');

// A frontier model answering inside the cards, with the user's own key.
const DEFAULTS = { openai: { model: 'gpt-4.1-mini', baseUrl: 'https://api.openai.com/v1' }, anthropic: { model: 'claude-sonnet-5-5', baseUrl: 'https://api.anthropic.com' }, custom: { model: 'qwen2.5:7b', baseUrl: 'http://127.0.0.1:11434/v1' } };
const fprov = document.getElementById('fprov'), fkey = document.getElementById('fkey'), fmodel = document.getElementById('fmodel'), furl = document.getElementById('furl'), fnote = document.getElementById('fnote');
function saveFrontier() {
  const provider = fprov.value;
  document.getElementById('furlrow').style.display = provider === 'custom' ? '' : 'none';
  if (!provider) { chrome.storage.local.set({ frontier: null }); fnote.textContent = ''; return; }
  const d = DEFAULTS[provider];
  fmodel.placeholder = d.model; furl.placeholder = d.baseUrl;
  const f = { provider, key: fkey.value.trim(), model: fmodel.value.trim() || d.model, baseUrl: furl.value.trim() || d.baseUrl };
  chrome.storage.local.set({ frontier: f });
  fnote.textContent = provider !== 'custom' && !f.key ? 'Add the key to switch it on.' : `On: ${f.model} at ${f.baseUrl}`;
}
for (const el of [fprov, fkey, fmodel, furl]) el.onchange = saveFrontier;
chrome.storage.local.get('frontier').then((v) => {
  const f = v.frontier;
  if (f) { fprov.value = f.provider; fkey.value = f.key || ''; fmodel.value = f.model || ''; furl.value = f.baseUrl || ''; }
  document.getElementById('furlrow').style.display = fprov.value === 'custom' ? '' : 'none';
  if (f) fnote.textContent = f.provider !== 'custom' && !f.key ? 'Add the key to switch it on.' : `On: ${f.model} at ${f.baseUrl}`;
});

// The agent bridge.
const bridgeon = document.getElementById('bridgeon'), bridgeurl = document.getElementById('bridgeurl');
const saveBridge = () => chrome.storage.local.set({ bridge: { on: bridgeon.checked, url: bridgeurl.value.trim() || 'http://127.0.0.1:8788' } });
bridgeon.onchange = saveBridge; bridgeurl.onchange = saveBridge;
chrome.storage.local.get('bridge').then((v) => { if (v.bridge) { bridgeon.checked = !!v.bridge.on; bridgeurl.value = v.bridge.url || ''; } });

// The two search switches, shared with the pills in the J-me bar.
const searchdocs = document.getElementById('searchdocs'), searchweb = document.getElementById('searchweb');
searchdocs.onchange = () => chrome.storage.local.set({ searchDocs: searchdocs.checked });
searchweb.onchange = () => chrome.storage.local.set({ searchWeb: searchweb.checked });
const showSearch = (v) => { searchdocs.checked = v.searchDocs !== false; searchweb.checked = v.searchWeb !== false; };
chrome.storage.local.get(['searchDocs', 'searchWeb']).then(showSearch);
chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && (ch.searchDocs || ch.searchWeb)) chrome.storage.local.get(['searchDocs', 'searchWeb']).then(showSearch); });

const besideBox = document.getElementById('beside');
besideBox.onchange = () => chrome.storage.local.set({ linksBeside: besideBox.checked });
chrome.storage.local.get('linksBeside').then((v) => { besideBox.checked = v.linksBeside !== false; });

const overlay = document.getElementById('overlay');
overlay.onchange = () => chrome.storage.local.set({ overlayOnPage: overlay.checked });
chrome.storage.local.get(['aiService', 'brainOrder', 'overlayOnPage']).then((v) => {
  overlay.checked = !!v.overlayOnPage;
  const ai = v.aiService || 'chatgpt';
  const r = document.querySelector(`input[name=ai][value=${ai}]`);
  if (r) r.checked = true;
  brain.value = Array.isArray(v.brainOrder) && v.brainOrder.length === 1 ? v.brainOrder[0] : '';
});
for (const r of document.querySelectorAll('input[name=ai]')) r.onchange = () => chrome.storage.local.set({ aiService: r.value });
brain.onchange = () => {
  chrome.storage.local.set({ brainOrder: brain.value ? [brain.value] : [] });
  document.getElementById('brainnote').textContent = 'Takes effect the next time J-me starts listening.';
};

async function micStatus() {
  try {
    const p = await navigator.permissions.query({ name: 'microphone' });
    micstate.textContent = p.state === 'granted' ? 'allowed' : p.state === 'denied' ? 'blocked: allow it in the site settings for this extension' : 'not yet allowed';
    micstate.className = p.state === 'granted' ? 'ok' : p.state === 'denied' ? 'bad' : '';
    p.onchange = micStatus;
  } catch { micstate.textContent = ''; }
}
document.getElementById('allow').onclick = async () => {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());
  } catch (e) {
    micstate.textContent = 'not allowed: ' + (e && e.message ? e.message : e);
    micstate.className = 'bad';
    return;
  }
  micStatus();
};
micStatus();
