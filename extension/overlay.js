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
.bar button.pause{font-size:14px}.bar button.pause.on{color:#f2b84b}
.box.paused .list{outline:1px solid #f2b84b;outline-offset:-1px}
.imgs{display:none;gap:4px;overflow-x:auto;padding:6px 8px;border-bottom:1px solid #262a33;scrollbar-width:thin}
.imgs.on{display:flex}
.imgs a{flex:0 0 auto;height:84px;border-radius:6px;overflow:hidden;background:#171a21;opacity:.95;transition:opacity .4s}
.imgs a:hover{opacity:1;outline:1px solid #f2b84b}.imgs img{height:84px;width:auto;max-width:150px;display:block;object-fit:cover}
.vids{display:none;gap:4px;overflow-x:auto;padding:6px 8px;border-bottom:1px solid #262a33;scrollbar-width:thin}
.vids.on{display:flex}
.vids a{flex:0 0 auto;position:relative;width:150px;height:84px;border-radius:6px;overflow:hidden;background:#171a21}
.vids a:hover{outline:1px solid #f2b84b}.vids img{width:150px;height:84px;display:block;object-fit:cover}
.vids .d{position:absolute;right:4px;bottom:4px;background:rgba(0,0,0,.75);color:#fff;font-size:11px;padding:1px 4px;border-radius:3px}
.vids .p{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:28px;height:28px;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;font-size:14px;display:flex;align-items:center;justify-content:center}
.vids .t{position:absolute;left:0;right:0;top:0;padding:3px 5px;background:linear-gradient(rgba(0,0,0,.8),transparent);color:#fff;font-size:11px;line-height:1.2;max-height:2.4em;overflow:hidden}
.player{display:none;border-bottom:1px solid #262a33;background:#000}
.player.on{display:block}.player iframe{width:100%;aspect-ratio:16/9;border:0;display:block}
.player .pb{display:flex;gap:8px;align-items:center;padding:4px 8px;background:#0f1115;font-size:12px}
.player .pb span{flex:1;color:#8a8f9c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.player .pb a{color:#6ea8fe;text-decoration:none}.player .pb button{all:unset;cursor:pointer;color:#8a8f9c;padding:0 4px;font-size:14px}
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
a.ai.here{background:#c792ea;color:#111;padding:4px 10px}.answer{margin-top:6px}
.tr{padding:6px 10px;border-top:1px solid #262a33;color:#8a8f9c;font-size:12px;max-height:3.6em;overflow:hidden}
.ask{display:flex;gap:6px;padding:8px;border-top:1px solid #262a33}
.ask input{flex:1;background:#171a21;color:#e8e8ec;border:1px solid #262a33;border-radius:6px;padding:6px 8px;font:inherit;font-size:13px}
.ask button{all:unset;cursor:pointer;background:#f2b84b;color:#111;border-radius:6px;padding:6px 10px;font-weight:600;font-size:13px}
</style>
<div class="box">
  <div class="bar"><b>J-me</b><span class="st">starting…</span><button class="pause" title="Hold the cards still (the transcript keeps going); press again to catch up">⏸</button>${PANEL ? '' : '<button class="min" title="Collapse">–</button><button class="x" title="Hide">×</button>'}</div>
  <div class="player"><div class="pb"><span></span><a target="_blank" rel="noopener">open on YouTube ↗</a><button title="Close">×</button></div></div>
  <div class="imgs"></div>
  <div class="vids"></div>
  <div class="list"><div class="empty">Listening builds the queue. Nothing staged yet.</div></div>
  <div class="tr"></div>
  <form class="ask"><input placeholder="Ask something… it jumps the queue"><button>Ask</button></form>
</div>`;
  (PANEL ? document.getElementById('jme-root') || document.body : document.documentElement).appendChild(host);
  const q = (s) => root.querySelector(s);
  const list = q('.list'), st = q('.st'), tr = q('.tr'), imgs = q('.imgs'), vids = q('.vids'), player = q('.player'), askForm = q('.ask'), askInput = q('.ask input');
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
  // "Answer here": a frontier model with the user's own key, answering inside the card.
  let frontier = null;
  const hasStorage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  const readSettings = (v) => {
    if (v.aiService && SERVICES[v.aiService]) svc = v.aiService;
    if ('frontier' in v) frontier = v.frontier && (v.frontier.key || v.frontier.provider === 'custom') ? v.frontier : null;
  };
  if (hasStorage) {
    chrome.storage.local.get(['aiService', 'frontier']).then((v) => { readSettings(v || {}); render(); }).catch(() => {});
    chrome.storage.onChanged.addListener((ch) => { const v = {}; for (const k in ch) v[k] = ch[k].newValue; readSettings(v); render(); });
  }
  // The AI's page opens in a small window beside the video, so the tab being listened to keeps
  // playing and keeps focus. The service worker opens it (a page script cannot).
  const openBeside = (url) => chrome.runtime.sendMessage({ target: 'sw', type: 'open', url }).catch(() => { window.open(url, '_blank', 'noopener'); });
  const promptFor = (it) => {
    const moment = (it.anchor && it.anchor.text ? it.anchor.text : '').replace(/\s+/g, ' ').slice(0, 240);
    const ctx = moment ? `\n\nContext, from a conversation I am listening to: "${moment}"` : '';
    return it.kind === 'prompt' ? it.text + ctx : `${it.text}\n\nWhat should I know about this?` + ctx;
  };
  const aiLink = (it, small) => (frontier ? `<a class="ai${small ? ' small' : ''} here" href="#" data-answer="${esc(it.id)}">Answer here</a> ` : '') +
    `<a class="ai${small || frontier ? ' small' : ''}" href="${esc(SERVICES[svc][1](encodeURIComponent(promptFor(it))))}" target="_blank" rel="noopener" data-beside="1">${frontier ? 'or in ' : 'Ask '}${SERVICES[svc][0]} ↗</a>`;

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

  // The video strip. In the side panel a click plays the video right there (an embedded
  // player); on a page it opens YouTube in a new tab, since pages often forbid frames.
  const vidNodes = new Map();
  function play(v) {
    const f = player.querySelector('iframe');
    if (f) f.remove();
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.id)}?autoplay=1&rel=0`;
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    player.insertBefore(iframe, player.firstChild);
    player.querySelector('.pb span').textContent = v.title + (v.channel ? ' · ' + v.channel : '');
    player.querySelector('.pb a').href = v.url;
    player.classList.add('on');
  }
  player.querySelector('.pb button').onclick = () => { player.classList.remove('on'); const f = player.querySelector('iframe'); if (f) f.remove(); };
  function renderVideos() {
    const seen = new Set();
    const vs = [];
    for (const it of [...items].sort((a, b) => b.born - a.born)) {
      for (const v of it.videos || []) {
        if (seen.has(v.id)) continue;
        seen.add(v.id);
        vs.push({ ...v, score: it.score });
        if (vs.length >= 12) break;
      }
      if (vs.length >= 12) break;
    }
    vids.classList.toggle('on', vs.length > 0);
    for (const [k, n] of vidNodes) if (!seen.has(k)) { n.remove(); vidNodes.delete(k); }
    vs.forEach((v, i) => {
      let n = vidNodes.get(v.id);
      if (!n) {
        n = document.createElement('a');
        n.href = v.url; n.target = '_blank'; n.rel = 'noopener'; n.title = v.title + (v.channel ? ' · ' + v.channel : '');
        n.innerHTML = `<img src="${esc(v.thumb)}" alt="" referrerpolicy="no-referrer" loading="lazy"><div class="t">${esc(v.title)}</div><div class="p">▶</div>${v.duration ? `<div class="d">${esc(v.duration)}</div>` : ''}`;
        if (PANEL) n.onclick = (e) => { e.preventDefault(); play(v); };
        vidNodes.set(v.id, n);
      }
      n.style.opacity = (0.5 + 0.5 * v.score).toFixed(2);
      if (vids.children[i] !== n) vids.insertBefore(n, vids.children[i] || null);
    });
  }

  const cardNodes = new Map();
  let emptyNode = null;
  function cardHtml(it) {
    const ready = (it.results && it.results.length) || it.answer;
    let html = `<div class="t">${ready ? '<i class="dot"></i>' : ''}<span>${esc(it.text)}</span><button class="pin" title="${it.state === 'pinned' ? 'Release it back into the stream' : 'Keep it'}">${it.state === 'pinned' ? '★' : '☆'}</button></div><div class="why">${esc(it.why || '')}</div>`;
    if (it.kind === 'prompt') html += `<div class="hand">${aiLink(it, false)}</div>`;
    if (it.kind === 'prompt' && it.answer && open !== it.id) html += `<div class="answer">${esc(it.answer)}</div>`;
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
    renderVideos();
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
      const sig = [it.state, it.text, it.why, (it.results || []).length, it.answer ? it.answer.length : 0, open === it.id, svc, !!frontier].join('\u0001');
      if (c.dataset.sig !== sig) {
        c.dataset.sig = sig;
        c.innerHTML = cardHtml(it);
        c.querySelector('.pin').onclick = (e) => { e.stopPropagation(); send({ type: it.state === 'pinned' ? 'unpin' : 'pin', id: it.id }); };
        c.onclick = (e) => {
          if (e.target.tagName === 'A') {
            if (e.target.dataset.answer) { e.preventDefault(); open = it.id; send({ type: 'answer', id: it.id, frontier }); render(); }
            else if (e.target.dataset.beside) { e.preventDefault(); openBeside(e.target.href); }
            return;
          }
          open = open === it.id ? null : it.id; if (open) send({ type: 'pull', id: it.id }); render();
        };
      }
      if (list.children[i] !== c) list.insertBefore(c, list.children[i] || null);
    });
  }
  function handle(ev) {
    if (ev.type === 'queue') { items = ev.items; render(); }
    else if (ev.type === 'segment') { segs.push(ev.segment.text); while (segs.length > 6) segs.shift(); tr.textContent = segs.join(' '); }
    else if (ev.type === 'status') { if (!/^stt /.test(ev.text)) st.textContent = ev.text; } // the ear's timing lines are for the log
    else if (ev.type === 'hello') { st.textContent = ev.title ? 'listening to: ' + ev.title : 'listening'; segs = []; tr.textContent = ''; }
    else if (ev.type === 'error') st.textContent = '⚠ ' + ev.text;
    else if (ev.type === 'off') { st.textContent = 'off'; setPaused(false); }
    else if (ev.type === 'paused') setPaused(!!ev.paused);
  }
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg) return;
      if (PANEL) { if (msg.target === 'panel' && msg.ev) handle(msg.ev); }
      else if (msg.type) handle(msg);
    });
  }

  let paused = false;
  const pauseBtn = q('.pause');
  const setPaused = (p) => { paused = p; pauseBtn.textContent = p ? '▶' : '⏸'; pauseBtn.classList.toggle('on', p); q('.box').classList.toggle('paused', p); pauseBtn.title = p ? 'Let the cards run again and catch up on what was said' : 'Hold the cards still (the transcript keeps going); press again to catch up'; };
  pauseBtn.onclick = () => send({ type: paused ? 'resume' : 'pause' });
  askForm.onsubmit = (e) => { e.preventDefault(); const t = askInput.value.trim(); if (t) { send({ type: 'ask', text: t }); askInput.value = ''; } };
  if (!PANEL) {
    q('.x').onclick = () => { host.style.display = 'none'; };
    q('.min').onclick = () => { collapsed = !collapsed; list.style.display = tr.style.display = askForm.style.display = collapsed ? 'none' : ''; imgs.style.display = vids.style.display = collapsed ? 'none' : ''; };
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
