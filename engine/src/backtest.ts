import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { EngineEvent, Mode, QueueItem, TranscriptSegment } from './types.ts';
import { Engine, type EngineOptions } from './engine.ts';
import { loadTranscript } from './sources/replay.ts';
import { fmtTime } from './text.ts';

/**
 * Backtest: run a recorded transcript through the engine with the clock driven by the
 * transcript itself, and write a map of the buffer: which items existed when, how they
 * scored, when they were staged, when they fell off. No audio, no waiting.
 */
export interface BacktestOptions {
  file: string;
  mode: Mode;
  outDir: string;
  /** seconds between map samples */
  sampleEvery: number;
  engine: Partial<EngineOptions>;
  /** stop after this many transcript seconds (0 = whole file) */
  limitSec: number;
  log: (line: string) => void;
}

export interface MapSample {
  t: number;
  items: { id: string; score: number; state: string }[];
}

export interface BacktestMap {
  file: string;
  mode: Mode;
  generatedAt: string;
  durationSec: number;
  segments: TranscriptSegment[];
  items: QueueItem[];
  samples: MapSample[];
  events: { t: number; id: string; change: string }[];
  stats: Record<string, number>;
}

export async function runBacktest(o: BacktestOptions): Promise<{ map: BacktestMap; htmlPath: string; jsonPath: string }> {
  const segs = await loadTranscript(o.file);
  if (segs.length === 0) throw new Error(`no segments parsed from ${o.file}`);
  const end = o.limitSec > 0 ? Math.min(o.limitSec, segs[segs.length - 1].t1) : segs[segs.length - 1].t1;
  const engine = new Engine({ ...o.engine, mode: o.mode });
  const samples: MapSample[] = [];
  const events: BacktestMap['events'] = [];
  engine.on((ev: EngineEvent) => {
    if (ev.type === 'item') events.push({ t: ev.now, id: ev.item.id, change: ev.change });
    if (ev.type === 'error') o.log(`  ! ${ev.text}`);
  });

  o.log(`backtest ${path.basename(o.file)}: ${segs.length} segments, ${fmtTime(end)} of transcript, mode=${o.mode}`);
  const started = Date.now();
  let clock = 0;
  let nextSample = 0;
  let nextProgress = 300;
  for (const seg of segs) {
    if (seg.t0 > end) break;
    // Tick second by second up to this segment so decay happens between utterances.
    while (clock + 1 <= seg.t1) {
      clock += 1;
      engine.tick(clock);
      if (clock >= nextSample) {
        samples.push({ t: clock, items: engine.queue.snapshot().map((i) => ({ id: i.id, score: +i.score.toFixed(3), state: i.state })) });
        nextSample += o.sampleEvery;
      }
    }
    const p = engine.addSegment(seg);
    if (p) await p; // the anticipator is the slow part; run it inline so the clock stays honest
    if (seg.t1 >= nextProgress) {
      o.log(`  ${fmtTime(seg.t1)}  live=${engine.queue.live.size} born=${engine.queue.history.length + engine.queue.live.size} calls=${engine.stats.anticipatorCalls}`);
      nextProgress += 300;
    }
  }
  await engine.drain();
  engine.tick(end);
  engine.queue.close(end);
  const items = [...engine.queue.history].sort((a, b) => a.born - b.born);
  const wall = (Date.now() - started) / 1000;
  const stagedIds = new Set(events.filter((e) => e.change === 'staged').map((e) => e.id));
  const staged = stagedIds.size;
  const recurred = items.filter((i) => i.recurrences > 0).length;
  const lifetimes = items.map((i) => (i.died ?? end) - i.born);
  const stats = {
    transcriptSec: +end.toFixed(0),
    wallSec: +wall.toFixed(1),
    anticipatorCalls: engine.stats.anticipatorCalls,
    anticipatorMeanMs: engine.stats.anticipatorCalls ? Math.round(engine.stats.anticipatorMs / engine.stats.anticipatorCalls) : 0,
    candidatesProposed: engine.stats.candidates,
    itemsBorn: items.length,
    itemsStaged: staged,
    itemsRecurred: recurred,
    itemsPer10Min: +((items.length / Math.max(1, end)) * 600).toFixed(1),
    meanLifetimeSec: lifetimes.length ? Math.round(lifetimes.reduce((a, b) => a + b, 0) / lifetimes.length) : 0,
    webFetches: engine.stats.fetches,
  };
  const map: BacktestMap = {
    file: path.basename(o.file),
    mode: o.mode,
    generatedAt: new Date().toISOString(),
    durationSec: end,
    segments: segs.filter((s) => s.t0 <= end),
    items,
    samples,
    events,
    stats,
  };
  await fs.mkdir(o.outDir, { recursive: true });
  const base = path.join(o.outDir, path.basename(o.file).replace(/\.[^.]+$/, '') + '.map');
  const jsonPath = base + '.json';
  const htmlPath = base + '.html';
  await fs.writeFile(jsonPath, JSON.stringify(map));
  await fs.writeFile(htmlPath, renderMapHtml(map));
  o.log(`done in ${wall.toFixed(0)} s: ${items.length} items born, ${staged} staged, ${stats.itemsPer10Min}/10 min; map -> ${htmlPath}`);
  return { map, htmlPath, jsonPath };
}

/** A self-contained HTML page: the buffer map (one lane per item, shaded by score) over the transcript. */
export function renderMapHtml(map: BacktestMap): string {
  const data = JSON.stringify(map).replace(/<\/script/gi, '<\\/script');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>J-me buffer map: ${escapeHtml(map.file)}</title>
<link rel="icon" href="data:,">
<style>
:root{--bg:#0f1115;--fg:#e8e8ec;--mut:#8a8f9c;--line:#262a33;--card:#171a21;--acc:#f2b84b;--s:#6ea8fe;--l:#7bd88f;--p:#c792ea;--m:#ff8a65}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
header{padding:16px 20px;border-bottom:1px solid var(--line);display:flex;flex-wrap:wrap;gap:16px 28px;align-items:baseline}
h1{font-size:16px;margin:0}h1 small{color:var(--mut);font-weight:400;margin-left:8px}
.stat{color:var(--mut)}.stat b{color:var(--fg);font-weight:600}
#wrap{display:grid;grid-template-columns:1fr;gap:0}
#map{position:relative;overflow-x:auto;padding:12px 20px 4px}
#axis{position:relative;height:18px;color:var(--mut);font-size:11px}
.tick{position:absolute;top:0;border-left:1px solid var(--line);padding-left:4px;height:100%}
.lane{position:relative;height:22px;margin:3px 0;display:flex;align-items:center}
.lane .lbl{position:sticky;left:0;z-index:2;width:260px;flex:none;padding-right:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px;background:var(--bg)}
.lane .lbl .k{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px;vertical-align:middle}
.k.search{background:var(--s)}.k.lookup{background:var(--l)}.k.prompt{background:var(--p)}.k.media{background:var(--m)}
.bar{position:relative;flex:none;height:14px}
.seg{position:absolute;top:0;height:100%;background:var(--acc)}
.evt{position:absolute;top:-3px;width:2px;height:20px;background:#fff;opacity:.8}
.legend{padding:4px 20px 10px;color:var(--mut);font-size:12px;display:flex;gap:18px;flex-wrap:wrap}
#detail{padding:12px 20px;border-top:1px solid var(--line);min-height:70px;color:var(--mut)}
#detail b{color:var(--fg)}
#transcript{padding:12px 20px 40px;border-top:1px solid var(--line);columns:1}
.line{display:flex;gap:12px;padding:3px 0;border-bottom:1px dotted var(--line)}
.line .t{color:var(--mut);flex:none;width:52px;font-variant-numeric:tabular-nums}
.line .born{color:var(--acc);font-size:12px;margin-left:8px}
@media (max-width:640px){.lane .lbl{width:150px}}
</style></head><body>
<header><h1>J-me buffer map <small>${escapeHtml(map.file)} · ${escapeHtml(map.mode)} mode · ${fmtTime(map.durationSec)}</small></h1>
${Object.entries(map.stats).map(([k, v]) => `<span class="stat">${escapeHtml(k)} <b>${v}</b></span>`).join('')}
</header>
<div class="legend"><span><i class="k search" style="display:inline-block;width:8px;height:8px"></i> search</span><span><i class="k lookup" style="display:inline-block;width:8px;height:8px"></i> lookup</span><span><i class="k prompt" style="display:inline-block;width:8px;height:8px"></i> prompt</span><span><i class="k media" style="display:inline-block;width:8px;height:8px"></i> media</span><span>bar opacity = score · white tick = staged · lane = one item from birth to expiry · hover or tap a lane</span></div>
<div id="map"><div id="axis"></div><div id="lanes"></div></div>
<div id="detail">Hover a lane.</div>
<div id="transcript"></div>
<script>
const M=${data};
const PX=Math.max(2, Math.min(8, 1400/Math.max(60,M.durationSec/10)));
const W=Math.ceil(M.durationSec/10*PX);
const fmt=s=>{const m=Math.floor(s/60),x=Math.floor(s%60),h=Math.floor(m/60);return (h?h+':':'')+String(h?m%60:m).padStart(h?2:1,'0')+':'+String(x).padStart(2,'0')};
const axis=document.getElementById('axis');axis.style.width=(W+260)+'px';
const step=M.durationSec>3600?600:M.durationSec>1200?300:60;
for(let t=0;t<=M.durationSec;t+=step){const d=document.createElement('div');d.className='tick';d.style.left=(260+t/10*PX)+'px';d.textContent=fmt(t);axis.appendChild(d)}
const byId=new Map(M.items.map(i=>[i.id,i]));
const series=new Map();for(const s of M.samples)for(const it of s.items){if(!series.has(it.id))series.set(it.id,[]);series.get(it.id).push([s.t,it.score,it.state])}
const lanes=document.getElementById('lanes');
for(const it of M.items){
  const lane=document.createElement('div');lane.className='lane';
  const lbl=document.createElement('div');lbl.className='lbl';lbl.innerHTML='<span class="k '+it.kind+'"></span>'+esc(it.text);lane.appendChild(lbl);
  const bar=document.createElement('div');bar.className='bar';bar.style.width=W+'px';
  const ser=series.get(it.id)||[];const dt=M.samples.length>1?M.samples[1].t-M.samples[0].t:5;
  for(const [t,sc] of ser){const d=document.createElement('div');d.className='seg';d.style.left=(t/10*PX)+'px';d.style.width=(Math.max(1,dt/10*PX)+0.7)+'px';d.style.opacity=(0.15+0.85*sc).toFixed(2);bar.appendChild(d)}
  for(const e of M.events)if(e.id===it.id&&e.change==='staged'){const d=document.createElement('div');d.className='evt';d.style.left=(e.t/10*PX)+'px';bar.appendChild(d)}
  lane.appendChild(bar);
  lane.onmouseenter=lane.onclick=()=>show(it);
  lanes.appendChild(lane);
}
function show(it){const d=document.getElementById('detail');d.innerHTML='<b>'+esc(it.kind)+'</b> · '+esc(it.text)+'<br>'+esc(it.why||'')+'<br><span>born '+fmt(it.born)+' · gone '+fmt(it.died||M.durationSec)+' · peak '+it.peak.toFixed(2)+' · confidence '+it.confidence.toFixed(2)+' · final state '+esc(it.state)+'</span><br><span>anchor: “'+esc(it.anchor.text.slice(0,220))+'”</span>'}
const tr=document.getElementById('transcript');
const bornAt=new Map();for(const it of M.items){const k=Math.floor(it.born);if(!bornAt.has(k))bornAt.set(k,[]);bornAt.get(k).push(it)}
for(const s of M.segments){const d=document.createElement('div');d.className='line';
  const born=[];for(let t=Math.floor(s.t0);t<=Math.floor(s.t1);t++)if(bornAt.has(t))born.push(...bornAt.get(t));
  d.innerHTML='<span class="t">'+fmt(s.t0)+'</span><span>'+(s.speaker?'<b>'+esc(s.speaker)+':</b> ':'')+esc(s.text)+(born.length?'<span class="born">→ '+born.map(b=>esc(b.text)).join(' · ')+'</span>':'')+'</span>';tr.appendChild(d)}
function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
</script></body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
}
