import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ItemKind, SearchResult } from './types.ts';
import type { BacktestMap } from './backtest.ts';
import { fmtTime } from './text.ts';

/**
 * The companion: what a viewer gets. A portable JSON built from a buffer map, and a single
 * self-contained HTML page that syncs to the episode (YouTube embed or a manual clock), shows
 * what is live right now, and hands any item to the viewer's own search engine or AI.
 *
 * The host reviews it first: the same page has a review mode that approves, drops and edits
 * items and exports the reviewed JSON, which rebuilds the page.
 */
export interface CompanionItem {
  id: string;
  kind: ItemKind;
  text: string;
  why: string;
  /** seconds into the episode when it came up */
  at: number;
  /** seconds when it fell out of the live buffer */
  until: number;
  /** the transcript moment, short */
  excerpt: string;
  /** a ready-to-paste prompt that carries the moment with it */
  prompt: string;
  links: { title: string; url: string; snippet?: string; source: string }[];
  approved: boolean;
  /** [t, score] pairs for ordering and fade at a given time */
  curve: [number, number][];
}

export interface Companion {
  format: 'jme-companion/1';
  title: string;
  source: string;
  video?: { provider: 'youtube'; id: string };
  durationSec: number;
  generatedAt: string;
  items: CompanionItem[];
}

export function buildCompanion(map: BacktestMap, opts: { title?: string; youtubeId?: string }): Companion {
  const curves = new Map<string, [number, number][]>();
  for (const s of map.samples) for (const it of s.items) {
    if (!curves.has(it.id)) curves.set(it.id, []);
    curves.get(it.id)!.push([s.t, it.score]);
  }
  const staged = new Set(map.events.filter((e) => e.change === 'staged').map((e) => e.id));
  const title = opts.title ?? map.file.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
  const items: CompanionItem[] = map.items.map((it) => {
    const excerpt = trimExcerpt(it.anchor.text, 220);
    return {
      id: it.id,
      kind: it.kind,
      text: it.text,
      why: it.why,
      at: round1(it.born),
      until: round1(it.died ?? map.durationSec),
      excerpt,
      prompt: buildPrompt(it.kind, it.text, excerpt, it.born, title),
      links: (it.results ?? []).map(slimLink),
      // Default approval = what the engine would have staged. The host changes it in review.
      approved: staged.has(it.id),
      curve: curves.get(it.id) ?? [],
    };
  });
  return {
    format: 'jme-companion/1',
    title,
    source: map.file,
    video: opts.youtubeId ? { provider: 'youtube', id: opts.youtubeId } : undefined,
    durationSec: map.durationSec,
    generatedAt: new Date().toISOString(),
    items,
  };
}

/** A prompt a viewer can hand to any model: the item plus the moment that earned it. */
export function buildPrompt(kind: ItemKind, text: string, excerpt: string, at: number, title: string): string {
  const where = `In "${title}" at ${fmtTime(at)}`;
  const ctx = excerpt ? ` The moment: "${excerpt}"` : '';
  switch (kind) {
    case 'lookup':
      return `${where}, the speakers mentioned ${text}.${ctx} Who or what is this, and why does it matter to the point being made? Be brief.`;
    case 'search':
      return `${where}, the speakers raised: ${text}.${ctx} What are the facts here, with sources if you can? Be brief and say what is uncertain.`;
    case 'prompt':
      return `${where}: ${text}${ctx}`;
    case 'media':
      return `${where}, the speakers referred to ${text}.${ctx} What is being referred to, and where can it be seen?`;
    case 'math':
      return `${where}: ${text}${ctx} Check the arithmetic and say whether the figures can all be true at once.`;
  }
}

function slimLink(r: SearchResult): CompanionItem['links'][number] {
  return { title: r.title, url: r.url, snippet: r.snippet ? r.snippet.slice(0, 160) : undefined, source: r.source };
}

function trimExcerpt(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), n - 30)) + '…';
}

const round1 = (x: number) => Math.round(x * 10) / 10;

export async function loadCompanionOrMap(file: string, opts: { title?: string; youtubeId?: string }): Promise<Companion> {
  const data = JSON.parse(await fs.readFile(file, 'utf8')) as { format?: string } & Record<string, unknown>;
  if (data.format === 'jme-companion/1') {
    const c = data as unknown as Companion;
    if (opts.youtubeId) c.video = { provider: 'youtube', id: opts.youtubeId };
    if (opts.title) c.title = opts.title;
    return c;
  }
  return buildCompanion(data as unknown as BacktestMap, opts);
}

export async function writeCompanion(c: Companion, outBase: string): Promise<{ jsonPath: string; htmlPath: string }> {
  await fs.mkdir(path.dirname(outBase), { recursive: true });
  const jsonPath = outBase + '.jme.json';
  const htmlPath = outBase + '.companion.html';
  await fs.writeFile(jsonPath, JSON.stringify(c));
  await fs.writeFile(htmlPath, renderCompanionHtml(c));
  return { jsonPath, htmlPath };
}

export function renderCompanionHtml(c: Companion): string {
  const data = JSON.stringify(c).replace(/<\/script/gi, '<\\/script');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(c.title)} · J-me companion</title>
<link rel="icon" href="data:,">
<style>
:root{--bg:#0f1115;--fg:#e8e8ec;--mut:#8a8f9c;--line:#262a33;--card:#171a21;--hi:#1e222b;--acc:#f2b84b;--search:#6ea8fe;--lookup:#7bd88f;--prompt:#c792ea;--media:#ff8a65}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;border-bottom:1px solid var(--line);flex-wrap:wrap}
h1{font-size:16px;margin:0}h1 small{color:var(--mut);font-weight:400;margin-left:8px}
.btn{background:var(--acc);color:#111;border:0;border-radius:8px;padding:7px 11px;font-weight:600;cursor:pointer;font-size:13px}
.btn.ghost{background:transparent;color:var(--fg);border:1px solid var(--line)}.btn.sm{padding:4px 8px;font-size:12px}
main{display:grid;grid-template-columns:1fr;gap:0}
@media(min-width:980px){main{grid-template-columns:minmax(0,1.1fr) minmax(360px,.9fr);height:calc(100vh - 54px)}#right{overflow-y:auto}}
#left{padding:12px 16px}
#player{aspect-ratio:16/9;background:#000;border-radius:10px;overflow:hidden}
#player iframe{width:100%;height:100%;border:0}
#clock{display:flex;align-items:center;gap:10px;margin-top:10px;color:var(--mut);font-size:13px}
#clock input[type=range]{flex:1}
#clock .t{font-variant-numeric:tabular-nums;min-width:44px}
#right{padding:12px 16px;border-left:1px solid var(--line)}
h2{font-size:13px;color:var(--mut);text-transform:uppercase;letter-spacing:.06em;margin:14px 0 8px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:8px;transition:opacity .5s}
.card .top{display:flex;gap:8px;align-items:baseline}
.card .k{width:8px;height:8px;border-radius:2px;flex:none;display:inline-block;position:relative;top:-1px}
.k.search{background:var(--search)}.k.lookup{background:var(--lookup)}.k.prompt{background:var(--prompt)}.k.media{background:var(--media)}
.card .text{font-weight:600;flex:1}.card .at{color:var(--mut);font-size:12px;cursor:pointer}
.card .why{color:var(--mut);font-size:13px;margin:2px 0 6px}
.links a{display:block;color:var(--search);text-decoration:none;font-size:14px;margin:3px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.links a span{color:var(--mut);font-size:12px;margin-left:6px}
.hand{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.hand a,.hand button{background:var(--hi);color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:4px 8px;font-size:12px;text-decoration:none;cursor:pointer}
.hand a:hover,.hand button:hover{border-color:var(--acc)}
.empty{color:var(--mut);padding:16px 0}
.all .card{cursor:pointer}
/* review mode */
body.review .card{opacity:1!important}
.rev{display:none;gap:8px;align-items:center;margin-top:8px;padding-top:8px;border-top:1px dashed var(--line);font-size:12px;color:var(--mut)}
body.review .rev{display:flex}
body.review .card.dropped{opacity:.35!important}
.card .text[contenteditable]{outline:1px dashed var(--line);padding:0 4px;border-radius:4px}
#revbar{display:none;gap:8px;align-items:center;flex-wrap:wrap;color:var(--mut);font-size:13px}
body.review #revbar{display:flex}
select{background:var(--card);color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:4px 6px;font-size:12px}
</style></head><body>
<header>
  <h1>${esc(c.title)} <small>J-me companion</small></h1>
  <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
    <label style="color:var(--mut);font-size:12px">Hand prompts to <select id="svc"></select></label>
    <button id="revtoggle" class="btn ghost sm">Review</button>
  </div>
</header>
<div id="revbar" style="padding:8px 16px;border-bottom:1px solid var(--line)">
  <span>Review mode: tick what viewers should see, edit a title by clicking it, then</span>
  <button id="dl" class="btn sm">Download reviewed JSON</button>
  <span id="revcount"></span>
</div>
<main>
  <section id="left">
    <div id="player"></div>
    <div id="clock"><span class="t" id="tnow">0:00</span><input type="range" id="scrub" min="0" max="${Math.ceil(c.durationSec)}" step="1" value="0"><span class="t">${fmtTime(c.durationSec)}</span><span id="sync"></span></div>
    <h2>Everything in this episode</h2>
    <div id="all" class="all"></div>
  </section>
  <aside id="right">
    <h2>Live now</h2>
    <div id="live"></div>
  </aside>
</main>
<script>
const C=${data};
const SERVICES=[
  ['chatgpt','ChatGPT',q=>'https://chatgpt.com/?q='+q],
  ['claude','Claude',q=>'https://claude.ai/new?q='+q],
  ['perplexity','Perplexity',q=>'https://www.perplexity.ai/search?q='+q],
  ['copy','Copy to clipboard',null],
];
const KEY='jme:'+C.source+':'+C.generatedAt;
let state={approved:Object.fromEntries(C.items.map(i=>[i.id,i.approved])),text:{}};
try{const s=JSON.parse(localStorage.getItem(KEY)||'null');if(s)state={...state,...s}}catch{}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}};
const fmt=s=>{s=Math.max(0,s|0);const m=Math.floor(s/60),x=s%60,h=Math.floor(m/60);return (h?h+':':'')+String(h?m%60:m).padStart(h?2:1,'0')+':'+String(x).padStart(2,'0')};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const svc=document.getElementById('svc');for(const [id,name] of SERVICES){const o=document.createElement('option');o.value=id;o.textContent=name;svc.appendChild(o)}
try{svc.value=localStorage.getItem('jme:svc')||'chatgpt'}catch{}
svc.onchange=()=>{try{localStorage.setItem('jme:svc',svc.value)}catch{};render()};
const txt=i=>state.text[i.id]??i.text;
function searchUrl(i){return 'https://duckduckgo.com/?q='+encodeURIComponent(txt(i))}
function handoff(i){const s=SERVICES.find(x=>x[0]===svc.value);const q=encodeURIComponent(i.prompt.replace(i.text,txt(i)));
  if(!s||!s[2])return '<button data-copy="'+esc(i.id)+'">Copy prompt</button>';return '<a href="'+s[2](q)+'" target="_blank" rel="noopener">Ask '+esc(s[1])+'</a>'}
function scoreAt(i,t){let best=0;for(const [tt,sc] of i.curve){if(tt<=t)best=sc;else break}return best}
function card(i,t,opts={}){const d=document.createElement('div');d.className='card'+(state.approved[i.id]?'':' dropped');
  const sc=t==null?1:scoreAt(i,t);if(t!=null)d.style.opacity=(0.35+0.65*sc).toFixed(2);
  const links=i.links.length?i.links.slice(0,3).map(l=>'<a href="'+esc(l.url)+'" target="_blank" rel="noopener">'+esc(l.title||l.url)+'<span>'+esc(l.source)+'</span></a>').join(''):'<a href="'+searchUrl(i)+'" target="_blank" rel="noopener">Search the web for this</a>';
  d.innerHTML='<div class="top"><span class="k '+i.kind+'"></span><span class="text" data-id="'+esc(i.id)+'">'+esc(txt(i))+'</span><span class="at" data-seek="'+i.at+'">'+fmt(i.at)+'</span></div>'+
    '<div class="why">'+esc(i.why)+'</div><div class="links">'+links+'</div>'+
    '<div class="hand">'+handoff(i)+'<button data-copy="'+esc(i.id)+'">Copy prompt</button></div>'+
    '<label class="rev"><input type="checkbox" data-ok="'+esc(i.id)+'" '+(state.approved[i.id]?'checked':'')+'> show to viewers · <i>'+esc(i.excerpt)+'</i></label>';
  return d}
let now=0,player=null,useYt=!!(C.video&&C.video.provider==='youtube');
function liveItems(t){return C.items.filter(i=>(document.body.classList.contains('review')||state.approved[i.id])&&i.at<=t&&t<=i.until+20&&scoreAt(i,t)>0.15).sort((a,b)=>scoreAt(b,t)-scoreAt(a,t))}
function render(){document.getElementById('tnow').textContent=fmt(now);document.getElementById('scrub').value=now|0;
  const live=document.getElementById('live');live.innerHTML='';const L=liveItems(now);
  if(!L.length)live.innerHTML='<div class="empty">Nothing staged at this moment. Play on.</div>';for(const i of L)live.appendChild(card(i,now));
  const all=document.getElementById('all');all.innerHTML='';const vis=C.items.filter(i=>document.body.classList.contains('review')||state.approved[i.id]);
  for(const i of vis)all.appendChild(card(i,null));
  document.getElementById('revcount').textContent=Object.values(state.approved).filter(Boolean).length+' of '+C.items.length+' shown';}
document.body.addEventListener('click',e=>{const t=e.target.closest('[data-seek]');if(t){seek(+t.dataset.seek);return}
  const cp=e.target.closest('[data-copy]');if(cp){const i=C.items.find(x=>x.id===cp.dataset.copy);navigator.clipboard?.writeText(i.prompt.replace(i.text,txt(i)));cp.textContent='Copied';setTimeout(()=>cp.textContent='Copy prompt',1200);return}
  const tx=e.target.closest('.text');if(tx&&document.body.classList.contains('review')){tx.contentEditable='true';tx.focus()}});
document.body.addEventListener('change',e=>{const ok=e.target.closest('[data-ok]');if(ok){state.approved[ok.dataset.ok]=ok.checked;save();render()}});
document.body.addEventListener('focusout',e=>{const tx=e.target.closest('.text[contenteditable]');if(tx){state.text[tx.dataset.id]=tx.textContent.trim();tx.contentEditable='false';save();render()}});
document.getElementById('revtoggle').onclick=()=>{document.body.classList.toggle('review');render()};
document.getElementById('dl').onclick=()=>{const out={...C,items:C.items.map(i=>({...i,text:txt(i),approved:!!state.approved[i.id]}))};
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(out)],{type:'application/json'}));a.download=(C.source.replace(/\\.[^.]+$/,''))+'.reviewed.jme.json';a.click()};
const scrub=document.getElementById('scrub');scrub.oninput=()=>{now=+scrub.value;if(player&&player.seekTo)player.seekTo(now,true);render()};
function seek(t){now=t;if(player&&player.seekTo)player.seekTo(t,true);render()}
if(useYt){const s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';document.head.appendChild(s);
  window.onYouTubeIframeAPIReady=()=>{player=new YT.Player('player',{videoId:C.video.id,playerVars:{rel:0,modestbranding:1},events:{onReady:()=>{document.getElementById('sync').textContent='synced to the video'}}});
    setInterval(()=>{if(player&&player.getCurrentTime){const t=player.getCurrentTime();if(Math.abs(t-now)>=0.5){now=t;render()}}},500)};
  document.getElementById('player').textContent='';
}else{document.getElementById('player').style.display='none';document.getElementById('sync').textContent='no video linked: drag the clock, or press play in your own player and follow along'}
render();
</script></body></html>`;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
}
