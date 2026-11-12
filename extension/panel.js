// The side panel's own strip: the microphone switch and what J-me is listening to. The cards
// below it are overlay.js in panel mode. The toolbar icon stays "this tab"; this switch is the
// other source, for a call in another app or the room.
const mic = document.getElementById('mic');
const state = document.getElementById('state');
const sw = (msg) => chrome.runtime.sendMessage({ target: 'sw', ...msg }).catch(() => null);

async function refresh() {
  const s = await sw({ type: 'state' });
  const src = s && s.source;
  mic.checked = !!src && src.kind === 'mic';
  state.textContent = !src ? 'off · click the J-me icon on a tab, or switch the microphone on'
    : src.kind === 'mic' ? 'listening to the microphone' : 'listening to a tab';
}

mic.onchange = async () => {
  const want = mic.checked;
  state.textContent = want ? 'starting the microphone…' : 'stopping…';
  const r = await sw({ type: 'mic', on: want });
  if (want && r && r.ok === false) {
    mic.checked = false;
    const hint = /not allowed|denied|permission/i.test(r.error || '') ? ' Open settings (⚙) and allow the microphone once.' : '';
    state.textContent = 'could not start: ' + (r.error || 'unknown') + hint;
    return;
  }
  refresh();
};

document.getElementById('settings').onclick = (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); };
chrome.runtime.onMessage.addListener((m) => { if (m && m.target === 'panel' && m.ev && (m.ev.type === 'hello' || m.ev.type === 'off')) refresh(); });
refresh();
