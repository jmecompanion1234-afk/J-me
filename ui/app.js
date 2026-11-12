// J-me Phase A front end: plain ES module, no build step.
const $ = (id) => document.getElementById(id);
const queueEl = $('queue'), panel = $('panel'), panelBody = $('panel-body'), statusEl = $('status'), trEl = $('transcript');
const sourceEl = $('source'), listenEl = $('listen'), floatBtn = $('float'), homeEl = $('home'), askText = $('ask-text'), imagesEl = $('images');

// The AI a card hands off to (the same choice the companion page remembers).
const SERVICES = { chatgpt: ['ChatGPT', (p) => 'https://chatgpt.com/?q=' + p], claude: ['Claude', (p) => 'https://claude.ai/new?q=' + p], perplexity: ['Perplexity', (p) => 'https://www.perplexity.ai/search?q=' + p] };
let svc = 'chatgpt';
try { svc = SERVICES[localStorage.getItem('jme:svc')] ? localStorage.getItem('jme:svc') : 'chatgpt'; } catch {}
const promptFor = (it) => {
  const moment = (it.anchor && it.anchor.text ? it.anchor.text : '').replace(/\s+/g, ' ').slice(0, 240);
  const ctx = moment ? `\n\nContext, from a conversation I am listening to: "${moment}"` : '';
  return it.kind === 'prompt' ? it.text + ctx : `${it.text}\n\nWhat should I know about this?` + ctx;
};
const handoff = (it) => `<div class="hand"><a class="ai" href="${esc(SERVICES[svc][1](encodeURIComponent(promptFor(it))))}" target="_blank" rel="noopener">Ask ${SERVICES[svc][0]} ↗</a><select id="svc">${Object.entries(SERVICES).map(([k, v]) => `<option value="${k}"${k === svc ? ' selected' : ''}>${v[0]}</option>`).join('')}</select></div>`;

function renderImages() {
  const seen = new Set(); const pics = [];
  for (const it of [...items].sort((a, b) => b.born - a.born)) for (const im of it.images || []) { if (seen.has(im.thumb) || pics.length >= 16) continue; seen.add(im.thumb); pics.push(im); }
  imagesEl.classList.toggle('on', pics.length > 0);
  imagesEl.innerHTML = pics.map((p) => `<a href="${esc(p.page)}" target="_blank" rel="noopener" title="${esc(p.title)}"><img src="${esc(p.thumb)}" alt="${esc(p.title)}" referrerpolicy="no-referrer" loading="lazy"></a>`).join('');
}

let ws, audioCtx, stream, micStream, workletNode, items = [], openId = null;

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => setStatus('connected');
  ws.onclose = () => { setStatus('disconnected, retrying…'); setTimeout(connect, 1500); };
  ws.onmessage = (e) => handle(JSON.parse(e.data));
}

function handle(ev) {
  if (ev.type === 'queue') { items = ev.items; renderQueue(); if (openId) refreshPanel(); }
  else if (ev.type === 'segment') addSegment(ev.segment);
  else if (ev.type === 'status') setStatus(ev.text);
  else if (ev.type === 'error') setStatus('⚠ ' + ev.text);
  else if (ev.type === 'item' && ev.change === 'pulled') showItem(ev.item);
  else if (ev.type === 'item' && ev.change === 'ready' && ev.item.id === openId) showItem(ev.item);
  else if (ev.type === 'hello') setStatus(`${ev.mode} mode · session ${ev.sessionId.slice(-8)}`);
}

function setStatus(t) { statusEl.textContent = t; }

function renderQueue() {
  renderImages();
  queueEl.innerHTML = '';
  if (!items.length) { queueEl.innerHTML = '<div class="empty">Listening builds the queue. Nothing staged yet.</div>'; return; }
  for (const it of items) {
    const card = document.createElement('div');
    card.className = 'card' + (it.state === 'pinned' ? ' pinned' : '') + (it.kind === 'prompt' ? ' prompt' : '');
    card.style.opacity = (0.35 + 0.65 * it.score).toFixed(2);
    card.innerHTML =
      `<div class="text">${esc(it.text)}</div>` +
      `<div class="meta"><span class="kind ${it.kind}" title="${it.kind}"></span>` +
      (it.state === 'ready' || it.state === 'pinned' && (it.results || it.answer) ? '<span class="ready" title="ready"></span>' : '') +
      `<button class="pin" title="Pin">${it.state === 'pinned' ? '★' : '☆'}</button></div>` +
      `<div class="why">${esc(it.why || '')}</div>`;
    card.querySelector('.pin').onclick = (e) => { e.stopPropagation(); send({ type: 'pin', id: it.id }); };
    card.onclick = () => { openId = it.id; send({ type: 'pull', id: it.id }); showItem(it); };
    queueEl.appendChild(card);
  }
}

function refreshPanel() {
  const it = items.find((i) => i.id === openId);
  if (it) showItem(it);
}

function showItem(it) {
  openId = it.id;
  panel.classList.remove('hidden');
  let html = `<h2>${esc(it.text)}</h2><div class="why">${esc(it.why || '')} · ${it.kind} · ${it.state}</div>` + handoff(it);
  if (it.answer) html += `<div class="answer">${esc(it.answer)}</div>`;
  if (it.results && it.results.length) {
    for (const r of it.results) {
      html += `<div class="result"><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title || r.url)}</a><span class="src">${esc(r.source)}</span><p>${esc(r.snippet || '')}</p></div>`;
    }
  } else if (it.state === 'candidate') html += `<p class="why">Not staged yet (score ${it.score.toFixed(2)}). Pin it to fetch now.</p>`;
  else if (it.state === 'staged') html += `<p class="why">Fetching…</p>`;
  else if (!it.answer) html += `<p class="why">No results.</p>`;
  html += `<div class="anchor">“${esc(it.anchor?.text || '')}”</div>`;
  panelBody.innerHTML = html;
  const sel = panelBody.querySelector('#svc');
  if (sel) sel.onchange = () => { svc = sel.value; try { localStorage.setItem('jme:svc', svc); } catch {} showItem(it); };
}
$('close').onclick = () => { panel.classList.add('hidden'); openId = null; panelBody.innerHTML = ''; };

const segs = [];
function addSegment(s) {
  segs.push(s);
  while (segs.length > 40) segs.shift();
  trEl.innerHTML = segs.map((x, i) => `<span class="seg${i === segs.length - 1 ? ' new' : ''}">${x.speaker ? esc(x.speaker) + ': ' : ''}${esc(x.text)} </span>`).join('');
  trEl.scrollTop = trEl.scrollHeight;
}

function send(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }

async function startAudio(kind) {
  try {
    if (kind === 'mic') {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
    } else if (kind === 'both') {
      // Speaker output (pick "Entire screen" + share system audio) and the room mic, together.
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      for (const t of stream.getVideoTracks()) t.stop();
      if (!stream.getAudioTracks().length) { throw new Error('no audio in that share: pick "entire screen" and tick share system audio'); }
      micStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
      stream.getAudioTracks()[0].onended = () => { if (listenEl.checked) { listenEl.checked = false; stopAudio(); } };
    } else {
      // Media mode: share a tab or the screen WITH audio; the video track is dropped at once.
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      for (const t of stream.getVideoTracks()) t.stop();
      if (!stream.getAudioTracks().length) { throw new Error('no audio in that share: pick a tab or "entire screen" and tick share audio'); }
      // The user closed the shared tab or pressed "stop sharing": flip the switch off.
      stream.getAudioTracks()[0].onended = () => { if (listenEl.checked) { listenEl.checked = false; stopAudio(); } };
    }
    // A new listen starts clean: the engine drops what the last one staged.
    send({ type: 'start' }); segs.length = 0; trEl.innerHTML = ''; items = []; renderQueue();
    audioCtx = new AudioContext({ sampleRate: 16000 });
    await audioCtx.audioWorklet.addModule('worklet.js');
    const src = audioCtx.createMediaStreamSource(stream);
    workletNode = new AudioWorkletNode(audioCtx, 'pcm-forwarder');
    workletNode.port.onmessage = (e) => { if (ws && ws.readyState === 1) ws.send(e.data); };
    src.connect(workletNode);
    if (micStream) audioCtx.createMediaStreamSource(micStream).connect(workletNode);
    // keep the graph alive without playing it back
    const sink = audioCtx.createGain(); sink.gain.value = 0; workletNode.connect(sink); sink.connect(audioCtx.destination);
    sourceEl.disabled = true;
    setStatus(kind === 'mic' ? 'listening to the room' : kind === 'both' ? 'listening to speakers and mic' : 'listening to media');
    if (canFloat && !pip) floatBtn.classList.remove('hidden');
    return true;
  } catch (e) {
    setStatus(e.name === 'NotAllowedError' ? 'nothing chosen' : 'audio failed: ' + e.message);
    stream?.getTracks().forEach((t) => t.stop());
    return false;
  }
}
function stopAudio() {
  send({ type: 'stop' });
  stream?.getTracks().forEach((t) => t.stop());
  micStream?.getTracks().forEach((t) => t.stop()); micStream = null;
  audioCtx?.close();
  sourceEl.disabled = false;
  floatBtn.classList.add('hidden');
  setStatus('off');
}
listenEl.onchange = async (e) => {
  if (e.target.checked) { if (!(await startAudio(sourceEl.value))) e.target.checked = false; }
  else stopAudio();
};
$('ask').onsubmit = (e) => { e.preventDefault(); const t = askText.value.trim(); if (t) { send({ type: 'ask', text: t }); askText.value = ''; } };

// --- Float: the whole page moves into a small always-on-top window (Document Picture-in-Picture,
// Chrome/Edge 116+). It stays over the video tab, or any other app, until it is closed or docked.
const canFloat = 'documentPictureInPicture' in window;
let pip = null;
async function float() {
  if (!canFloat || pip) return;
  try {
    pip = await window.documentPictureInPicture.requestWindow({ width: 400, height: 640 });
  } catch (e) { setStatus('could not float: ' + e.message); return; }
  for (const sheet of document.styleSheets) {
    try {
      const st = pip.document.createElement('style');
      st.textContent = [...sheet.cssRules].map((r) => r.cssText).join(' ');
      pip.document.head.appendChild(st);
    } catch {
      const l = pip.document.createElement('link'); l.rel = 'stylesheet'; l.href = sheet.href; pip.document.head.appendChild(l);
    }
  }
  pip.document.title = 'J-me';
  for (const el of [...document.body.children]) if (el.tagName !== 'SCRIPT' && el.id !== 'home') pip.document.body.appendChild(el);
  floatBtn.classList.add('hidden');
  homeEl.classList.remove('hidden');
  pip.addEventListener('pagehide', dock);
}
function dock() {
  if (!pip) return;
  const w = pip; pip = null;
  for (const el of [...w.document.body.children]) document.body.insertBefore(el, homeEl);
  homeEl.classList.add('hidden');
  if (stream) floatBtn.classList.remove('hidden');
  try { w.close(); } catch {}
}
floatBtn.onclick = float;
$('dock').onclick = dock;
if (!canFloat) floatBtn.title = 'Floating needs Chrome or Edge';

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

connect();
