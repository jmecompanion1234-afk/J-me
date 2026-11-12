// J-me overlay: the live queue as a draggable panel on the page (injected on demand), or as the
// body of the extension's side panel (the same file, loaded by panel.html). Cards carry the web
// links, an "Ask <your AI>" hand-off, and the pictures that feed the strip across the top.
(() => {
  if (window.__jme) { window.__jme.show(); return; }
  const PANEL = location.protocol === 'chrome-extension:';
  const host = document.createElement('div');
  host.id = 'jme-overlay';
  host.style.cssText = PANEL
    ? 'all:initial;display:block;width:100%;height:100%;'
    : 'all:initial;position:fixed;right:16px;bottom:16px;width:340px;max-height:70vh;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'open' });
  const MAXH = PANEL ? '100%' : '70vh';
  root.innerHTML = `
<style>
:host{all:initial}
*{box-sizing:border-box}
.box{display:flex;flex-direction:column;max-height:${MAXH};${PANEL ? 'height:100%;border:0;border-radius:0;box-shadow:none;' : ''}background:#0f1115;color:#e8e8ec;border:1px solid #262a33;border-radius:12px;
  font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.5);overflow:hidden}
.bar{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #262a33;cursor:${PANEL ? 'default' : 'move'};user-select:none}
.bar b{font-weight:700}.bar .st{color:#8a8f9c;font-size:12px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bar button{all:unset;cursor:pointer;color:#8a8f9c;padding:0 4px;font-size:16px}
.imgs{display:none;gap:4px;overflow-x:auto;padding:6px 8px;border-bottom:1px solid #262a33;scrollbar-width:thin}
.imgs.on{display:flex}
.imgs a{flex:0 0 auto;height:84px;border-radius:6px;overflow:hidden;background:#171a21;opacity:.95;transition:opacity .4s}
.imgs a:hover{opacity:1;outline:1px solid #f2b84b}.imgs img{height:84px;width:auto;max-width:150px;display:block;object-fit:cover}
.list{overflow:auto;padding:8px;display:flex;flex-direction:column;gap:6px;flex:1}
.empty{color:#8a8f9c;font-size:13px;padding:8px}
.card{background:#171a21;border:1px solid #262a33;border-radius:8px;padding:8px 10px;cursor:pointer;transition:opacity .4s}
.card:hover{background:#1e222b}.card.pinned{border-color:#f2b84b}.card.prompt{border-left:3px solid #c792ea}
.card .t{display:flex;gap:6px;align-items:flex-start}.card .t span{flex:1}
.card .pin{all:unset;cursor:pointer;color:#8a8f9c;font-size:14px}.card.pinned .pin{color:#f2b84b}
.card .why{color:#8a8f9c;font-size:12px;margin-top:2px}
.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#7bd88f;margin-right:6px;vertical-align:middle}
.res{margin-top:6px;border-top:1px solid #262a33;padding-top:6px;font-size:13px}
.res a{color:#6ea8fe;text-decoration:none;display:block;margin-top:4px}.res a:hover{text-decoration:underline}
.res p{margin:1px 0 0;color:#8a8f9c;font-size:12px}.answer{white-space:pre-wrap;font-size:13px}
.hand{margin-top:6px}
a.ai{display:inline-block;background:#c792ea;color:#111;border-radius:6px;padding:4px 10px;font-weight:600;font-size:12px;text-decoration:none}
a.ai.small{background:transparent;color:#c792ea;padding:4px 0}a.ai:hover{filter:brightness(1.1)}
.tr{padding:6px 10px;border-top:1px solid #262a33;color:#8a8f9c;font-size:12px;max-height:3.6em;overflow:hidden}
.ask{display:flex;gap:6px;padding:8px;border-top:1px solid #262a33}
.ask input{flex:1;background:#171a21;color:#e8e8ec;border:1px solid #262a33;border-radius:6px;padding:6px 8px;font:inherit;font-size:13px}
.ask button{all:unset;cursor:pointer;background:#f2b84b;color:#111;border-radius:6px;padding:6px 10px;font-weight:600;font-size:13px}
</style>
<div class="box">
  <div class="bar"><b>J-me</b><span class="st">starting…</span>${PANEL ? '' : '<button class="min" title="Collapse">–</button><button class="x" title="Hide">×</button>'}</div>
  <div class="imgs"></div>
  <div class="list"><div class="empty">Listening builds the queue. Nothing staged yet.</div></div>
  <div class="tr"></div>
  <form class="ask"><input placeholder="Ask something… it jumps the queue"><button>Ask</button></form>
</div>`;
  (PANEL ? document.getElementById('jme-root') || document.body : document.documentElement).appendChild(host);
  const q = (s) => root.querySelector(s);
  const list = q('.list'), st = q('.st'), tr = q('.tr'), imgs = q('.imgs'), askForm = q('.ask'), askInput = q('.ask input');
  let items = [], open = null, segs = [], collapsed = false;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const send = (msg) => chrome.runtime.sendMessage({ target: 'offscreen', type: 'ws', msg }).catch(() => {});

  // The AI the card hands off to. Chosen on the settings page; ChatGPT until then.
  const SERVICES = {
    chatgpt: ['ChatGPT', (p) => 'https://chatgpt.com/?q=' + p],
    claude: ['Claude', (p) => 'https://claude.ai/new?q=' + p],
    perplexity: ['Perplexity', (p) => 'https://www.perplexity.ai/search?q=' + p],
  };
  let svc = 'chatgpt';
  const hasStorage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  if (hasStorage) {
    chrome.storage.local.get('aiService').then((v) => { if (v && SERVICES[v.aiService]) { svc = v.aiService; render(); } }).catch(() => {});
    chrome.storage.onChanged.addListener((ch) => { if (ch.aiService && SERVICES[ch.aiService.newValue]) { svc = ch.aiService.newValue; render(); } });
  }
  const promptFor = (it) => {
    const moment = (it.anchor && it.anchor.text ? it.anchor.text : '').replace(/\s+/g, ' ').slice(0, 240);
    const ctx = moment ? `\n\nContext, from a conversation I am listening to: "${moment}"` : '';
    return it.kind === 'prompt' ? it.text + ctx : `${it.text}\n\nWhat should I know about this?` + ctx;
  };
  const aiLink = (it, small) => `<a class="ai${small ? ' small' : ''}" href="${esc(SERVICES[svc][1](encodeURIComponent(promptFor(it))))}" target="_blank" rel="noopener">Ask ${SERVICES[svc][0]} ↗</a>`;

  // Rendering is keyed by item (and by picture): a tick updates nodes in place, so nothing
  // flickers, the list keeps its scroll position and pictures are not reloaded.
  const picNodes = new Map();
  function renderImages() {
    // Newest items first, so the strip reads as a stream of what was just said.
    const seen = new Set();
    const pics = [];
    for (const it of [...items].sort((a, b) => b.born - a.born)) {
      for (const im of it.images || []) {
        if (seen.has(im.thumb)) continue;
        seen.add(im.thumb);
        pics.push({ ...im, score: it.score });
        if (pics.length >= 16) break;
      }
      if (pics.length >= 16) break;
    }
    imgs.classList.toggle('on', pics.length > 0);
    for (const [k, n] of picNodes) if (!seen.has(k)) { n.remove(); picNodes.delete(k); }
    pics.forEach((p, i) => {
      let n = picNodes.get(p.thumb);
      if (!n) {
        n = document.createElement('a');
        n.href = p.page; n.target = '_blank'; n.rel = 'noopener'; n.title = p.title;
        n.innerHTML = `<img src="${esc(p.thumb)}" alt="${esc(p.title)}" referrerpolicy="no-referrer" loading="lazy">`;
        picNodes.set(p.thumb, n);
      }
      n.style.opacity = (0.5 + 0.5 * p.score).toFixed(2);
      if (imgs.children[i] !== n) imgs.insertBefore(n, imgs.children[i] || null);
    });
  }

  const cardNodes = new Map();
  let emptyNode = null;
  function cardHtml(it) {
    const ready = (it.results && it.results.length) || it.answer;
    let html = `<div class="t">${ready ? '<i class="dot"></i>' : ''}<span>${esc(it.text)}</span><button class="pin">${it.state === 'pinned' ? '★' : '☆'}</button></div><div class="why">${esc(it.why || '')}</div>`;
    if (it.kind === 'prompt') html += `<div class="hand">${aiLink(it, false)}</div>`;
    if (open === it.id) {
      html += '<div class="res">';
      if (it.answer) html += `<div class="answer">${esc(it.answer)}</div>`;
      for (const r of it.results || []) html += `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title || r.url)}</a><p>${esc(r.snippet || '')}</p>`;
      if (!ready) html += `<p>${it.state === 'candidate' ? 'Not fetched yet. Pin it to fetch now.' : it.state === 'staged' ? 'Fetching…' : 'No results.'}</p>`;
      if (it.kind !== 'prompt') html += `<div class="hand">${aiLink(it, true)}</div>`;
      html += '</div>';
    }
    return html;
  }
  function render() {
    renderImages();
    const ids = new Set(items.map((it) => it.id));
    for (const [id, n] of cardNodes) if (!ids.has(id)) { n.remove(); cardNodes.delete(id); }
    if (!items.length) {
      if (!emptyNode) { emptyNode = document.createElement('div'); emptyNode.className = 'empty'; emptyNode.textContent = 'Listening builds the queue. Nothing staged yet.'; }
      if (!emptyNode.isConnected) list.appendChild(emptyNode);
      return;
    }
    if (emptyNode) emptyNode.remove();
    items.forEach((it, i) => {
      let c = cardNodes.get(it.id);
      if (!c) { c = document.createElement('div'); cardNodes.set(it.id, c); c.dataset.sig = ''; }
      c.className = 'card' + (it.state === 'pinned' ? ' pinned' : '') + (it.kind === 'prompt' ? ' prompt' : '');
      c.style.opacity = (0.4 + 0.6 * it.score).toFixed(2);
      const sig = [it.state, it.text, it.why, (it.results || []).length, it.answer ? it.answer.length : 0, open === it.id, svc].join('\u0001');
      if (c.dataset.sig !== sig) {
        c.dataset.sig = sig;
        c.innerHTML = cardHtml(it);
        c.querySelector('.pin').onclick = (e) => { e.stopPropagation(); send({ type: 'pin', id: it.id }); };
        c.onclick = (e) => { if (e.target.tagName === 'A') return; open = open === it.id ? null : it.id; if (open) send({ type: 'pull', id: it.id }); render(); };
      }
      if (list.children[i] !== c) list.insertBefore(c, list.children[i] || null);
    });
  }
  function handle(ev) {
    if (ev.type === 'queue') { items = ev.items; render(); }
    else if (ev.type === 'segment') { segs.push(ev.segment.text); while (segs.length > 6) segs.shift(); tr.textContent = segs.join(' '); }
    else if (ev.type === 'status') { if (!/^stt /.test(ev.text)) st.textContent = ev.text; } // the ear's timing lines are for the log
    else if (ev.type === 'hello') { st.textContent = 'listening'; segs = []; tr.textContent = ''; }
    else if (ev.type === 'error') st.textContent = '⚠ ' + ev.text;
    else if (ev.type === 'off') st.textContent = 'off';
  }
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg) return;
      if (PANEL) { if (msg.target === 'panel' && msg.ev) handle(msg.ev); }
      else if (msg.type) handle(msg);
    });
  }

  askForm.onsubmit = (e) => { e.preventDefault(); const t = askInput.value.trim(); if (t) { send({ type: 'ask', text: t }); askInput.value = ''; } };
  if (!PANEL) {
    q('.x').onclick = () => { host.style.display = 'none'; };
    q('.min').onclick = () => { collapsed = !collapsed; list.style.display = tr.style.display = askForm.style.display = collapsed ? 'none' : ''; imgs.style.display = collapsed ? 'none' : ''; };
    // Drag by the bar.
    const bar = q('.bar');
    let drag = null;
    bar.onpointerdown = (e) => { if (e.target.tagName === 'BUTTON') return; const r = host.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top }; bar.setPointerCapture(e.pointerId); };
    bar.onpointermove = (e) => { if (!drag) return; host.style.left = Math.max(0, e.clientX - drag.dx) + 'px'; host.style.top = Math.max(0, e.clientY - drag.dy) + 'px'; host.style.right = 'auto'; host.style.bottom = 'auto'; };
    bar.onpointerup = () => { drag = null; };
    // Stay visible when the player goes fullscreen: move into the fullscreen element and back.
    document.addEventListener('fullscreenchange', () => { (document.fullscreenElement || document.documentElement).appendChild(host); });
  }

  window.__jme = { show: () => { host.style.display = ''; }, handle };
})();
