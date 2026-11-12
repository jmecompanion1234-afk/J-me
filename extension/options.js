// Settings: which AI the cards hand off to, the microphone permission, and the brain choice.
const micstate = document.getElementById('micstate');
const brain = document.getElementById('brain');

chrome.storage.local.get(['aiService', 'brainOrder']).then((v) => {
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
