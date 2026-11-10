// J-me overlay: a draggable panel on the page showing the live queue. Injected on demand.
(() => {
  if (window.__jme) { window.__jme.show(); return; }
  const host = document.createElement('div');
  host.id = 'jme-overlay';
  host.style.cssText = 'all:initial;position:fixed;right:16px;bottom:16px;width:340px;max-height:70vh;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
<style>
:host{all:initial}
*{box-sizing:border-box}
.box{display:flex;flex-direction:column;max-height:70vh;background:#0f1115;color:#e8e8ec;border:1px solid #262a33;border-radius:12px;
  font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.5);overflow:hidden}
.bar{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #262a33;cursor:move;user-select:none}
.bar b{font-weight:700}.bar .st{color:#8a8f9c;font-size:12px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bar button{all:unset;cursor:pointer;color:#8a8f9c;padding:0 4px;font-size:16px}
.list{overflow:auto;padding:8px;display:flex;flex-direction:column;gap:6px}
.empty{color:#8a8f9c;font-size:13px;padding:8px}
.card{background:#171a21;border:1px solid #262a33;border-radius:8px;padding:8px 10px;cursor:pointer;transition:opacity .4s}
.card:hover{background:#1e222b}.card.pinned{border-color:#f2b84b}
.card .t{display:flex;gap:6px;align-items:flex-start}.card .t span{flex:1}
.card .pin{all:unset;cursor:pointer;color:#8a8f9c;font-size:14px}.card.pinned .pin{color:#f2b84b}
.card .why{color:#8a8f9c;font-size:12px;margin-top:2px}
.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#7bd88f;margin-right:6px;vertical-align:middle}
.res{margin-top:6px;border-top:1px solid #262a33;padding-top:6px;font-size:13px}
.res a{color:#6ea8fe;text-decoration:none;display:block;margin-top:4px}.res a:hover{text-decoration:underline}
.res p{margin:1px 0 0;color:#8a8f9c;font-size:12px}.answer{white-space:pre-wrap;font-size:13px}
.tr{padding:6px 10px;border-top:1px solid #262a33;color:#8a8f9c;font-size:12px;max-height:3.6em;overflow:hidden}
.ask{display:flex;gap:6px;padding:8px;border-top:1px solid #262a33}
.ask input{flex:1;background:#171a21;color:#e8e8ec;border:1px solid #262a33;border-radius:6px;padding:6px 8px;font:inherit;font-size:13px}
.ask button{all:unset;cursor:pointer;background:#f2b84b;color:#111;border-radius:6px;padding:6px 10px;font-weight:600;font-size:13px}
</style>
<div class="box">
  <div class="bar"><b>J-me</b><span class="st">starting…</span><button class="min" title="Collapse">–</button><button class="x" title="Hide">×</button></div>
  <div class="list"><div class="empty">Listening builds the queue. Nothing staged yet.</div></div>
  <div class="tr"></div>
  <form class="ask"><input placeholder="Ask something… it jumps the queue"><button>Ask</button></form>
</div>`;
  document.documentElement.appendChild(host);
  const q = (s) => root.querySelector(s);
  const list = q('.list'), st = q('.st'), tr = q('.tr'), askForm = q('.ask'), askInput = q('.ask input');
  let items = [], open = null, segs = [], collapsed = false;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const send = (msg) => chrome.runtime.sendMessage({ target: 'offscreen', type: 'ws', msg }).catch(() => {});

  function render() {
    list.innerHTML = '';
    if (!items.length) { list.innerHTML = '<div class="empty">Listening builds the queue. Nothing staged yet.</div>'; return; }
    for (const it of items) {
      const c = document.createElement('div');
      c.className = 'card' + (it.state === 'pinned' ? ' pinned' : '');
      c.style.opacity = (0.4 + 0.6 * it.score).toFixed(2);
      const ready = (it.results && it.results.length) || it.answer;
      let html = `<div class="t">${ready ? '<i class="dot"></i>' : ''}<span>${esc(it.text)}</span><button class="pin">${it.state === 'pinned' ? '★' : '☆'}</button></div><div class="why">${esc(it.why || '')}</div>`;
      if (open === it.id) {
        html += '<div class="res">';
        if (it.answer) html += `<div class="answer">${esc(it.answer)}</div>`;
        for (const r of it.results || []) html += `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title || r.url)}</a><p>${esc(r.snippet || '')}</p>`;
        if (!ready) html += `<p>${it.state === 'candidate' ? 'Not fetched yet. Pin it to fetch now.' : it.state === 'staged' ? 'Fetching…' : 'No results.'}</p>`;
        html += '</div>';
      }
      c.innerHTML = html;
      c.querySelector('.pin').onclick = (e) => { e.stopPropagation(); send({ type: 'pin', id: it.id }); };
      c.onclick = (e) => { if (e.target.tagName === 'A') return; open = open === it.id ? null : it.id; if (open) send({ type: 'pull', id: it.id }); render(); };
      list.appendChild(c);
    }
  }
  function handle(ev) {
    if (ev.type === 'queue') { items = ev.items; render(); }
    else if (ev.type === 'segment') { segs.push(ev.segment.text); while (segs.length > 6) segs.shift(); tr.textContent = segs.join(' '); }
    else if (ev.type === 'status') st.textContent = ev.text;
    else if (ev.type === 'hello') st.textContent = 'listening to this tab';
    else if (ev.type === 'error') st.textContent = '⚠ ' + ev.text;
    else if (ev.type === 'off') st.textContent = 'off';
  }
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => { if (msg && msg.type) handle(msg); });
  }

  askForm.onsubmit = (e) => { e.preventDefault(); const t = askInput.value.trim(); if (t) { send({ type: 'ask', text: t }); askInput.value = ''; } };
  q('.x').onclick = () => { host.style.display = 'none'; };
  q('.min').onclick = () => { collapsed = !collapsed; list.style.display = tr.style.display = askForm.style.display = collapsed ? 'none' : ''; };
  // Drag by the bar.
  const bar = q('.bar');
  let drag = null;
  bar.onpointerdown = (e) => { if (e.target.tagName === 'BUTTON') return; const r = host.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top }; bar.setPointerCapture(e.pointerId); };
  bar.onpointermove = (e) => { if (!drag) return; host.style.left = Math.max(0, e.clientX - drag.dx) + 'px'; host.style.top = Math.max(0, e.clientY - drag.dy) + 'px'; host.style.right = 'auto'; host.style.bottom = 'auto'; };
  bar.onpointerup = () => { drag = null; };
  // Stay visible when the player goes fullscreen: move into the fullscreen element and back.
  document.addEventListener('fullscreenchange', () => { (document.fullscreenElement || document.documentElement).appendChild(host); });

  window.__jme = { show: () => { host.style.display = ''; }, handle };
})();
