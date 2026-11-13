// Drive the extension in a real Chrome and play a speech file through it, end to end:
// ear (VAD + Moonshine in the browser) -> engine -> brain -> queue. Prints what happens.
//
//   node tools/ext_test.mjs FILE.wav [--brain ollama|builtin|webllm] [--seconds N] [--profile DIR] [--mic] [--pause] [--bridge] [--docs [DIR]] [--modes docs,web] [--shots DIR]
//
// --docs seeds the documents in DIR (default samples/docs) through the settings page's own store.
// --modes sets the two search switches (docs, web; both on by default). --shots saves screenshots
// of the side panel into DIR as it runs (for sharing).
//
// --mic feeds the file through Chrome's fake microphone instead (the side panel's switch path):
// permission is auto-granted, the panel page is opened in a tab and its cards are counted.
//
// Branded Chrome (137+) ignores --load-extension, so this runs Playwright's Chromium, which has no
// built-in model: --brain builtin is checked by hand in Chrome. Tab capture needs a real click on the toolbar icon, which no automation can do, so the
// test plays the file inside the offscreen page instead; the capture path is exercised by hand.
import { chromium } from 'playwright';
import { Bridge } from '../engine/src/bridge.ts';
import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const args = process.argv.slice(2);
const valued = ['--brain', '--seconds', '--profile', '--modes', '--shots', '--docs'];
const file = args.find((a, i) => /\.(wav|mp3)$/i.test(a) || (!a.startsWith('--') && !(i > 0 && valued.includes(args[i - 1]))));
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
if (!file) { console.error('usage: node tools/ext_test.mjs FILE.wav [--brain ollama|builtin|webllm] [--seconds N] [--profile DIR]'); process.exit(2); }
const brainOrder = opt('brain', '') ? [opt('brain')] : undefined;
const seconds = Number(opt('seconds', 0));
const mic = args.includes('--mic');
const docsArg = args.includes('--docs') ? args[args.indexOf('--docs') + 1] : undefined;
const docsDir = args.includes('--docs') ? (docsArg && !docsArg.startsWith('--') && docsArg !== file ? docsArg : 'samples/docs') : null;
const modes = opt('modes', 'docs,web').split(',');
const shots = opt('shots', '');
if (shots) await fs.mkdir(shots, { recursive: true });
let shotN = 0;
const shot = async (page, name) => { if (!shots) return; const f = path.join(shots, `${String(++shotN).padStart(2, '0')}-${name}.png`); await page.screenshot({ path: f }); console.log(`  📷 ${f}`); };
// --bridge: run the agent bridge in this process, point the extension at it, and at the end
// read the state back and push an agent ask through it.
const bridge = args.includes('--bridge') ? new Bridge() : null;
const bridgePort = bridge ? await bridge.listen(0) : 0;
if (bridge) console.log(`bridge on http://127.0.0.1:${bridgePort}`);
const profile = opt('profile', path.join(os.tmpdir(), 'jme-ext-test-profile'));
const EXT = path.resolve('extension');

// Serve the audio file on a loopback port so the offscreen page can fetch it.
const audio = await fs.readFile(file);
const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'audio/wav', 'access-control-allow-origin': '*' }); res.end(audio); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/${path.basename(file)}`;

const ctx = await chromium.launchPersistentContext(profile, {
  headless: false,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--autoplay-policy=no-user-gesture-required',
    ...(mic ? ['--use-fake-device-for-media-capture', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${path.resolve(file)}%noloop`] : [])],
  viewport: { width: 1100, height: 700 },
});
let sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
console.log('extension loaded:', sw.url(), 'storage:', JSON.stringify(await sw.evaluate(() => chrome.storage.local.get(null))));
await sw.evaluate(async (order) => {
  globalThis.__events = [];
  await chrome.storage.local.set({ brainOrder: order ?? [] }); // before the install-time warm-up fires
  await ensureOffscreen();
}, brainOrder ?? null);
await sw.evaluate((m) => chrome.storage.local.set({ searchDocs: m.includes('docs'), searchWeb: m.includes('web') }), modes);
console.log('search switches:', modes.join(' + '));
// The offscreen page's module is a few MB; wait until it answers.
const send = async (msg) => {
  for (let i = 0; i < 60; i++) {
    try { return await sw.evaluate((m) => chrome.runtime.sendMessage({ target: 'offscreen', ...m }), msg); }
    catch (e) { if (!/Receiving end does not exist/.test(e.message)) throw e; await new Promise((r) => setTimeout(r, 500)); }
  }
  throw new Error('offscreen page never answered');
};

const t0 = Date.now();
const since = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(6);
let done = false;
const seen = new Set();
const pump = async () => {
  const evs = await sw.evaluate(() => globalThis.__events.splice(0));
  for (const ev of evs) {
    if (ev.type === 'status') console.log(`${since()}  · ${ev.text}`);
    else if (ev.type === 'segment') console.log(`${since()}  [${ev.segment.t0.toFixed(0)}-${ev.segment.t1.toFixed(0)}s] ${ev.segment.text}`);
    else if (ev.type === 'item' && ev.change !== 'touched') console.log(`${since()}  ${ev.change.padEnd(7)} ${ev.item.kind.padEnd(6)} ${ev.item.text}  (${ev.item.score.toFixed(2)}${ev.item.results ? `, ${ev.item.results.length} results` : ''}${ev.item.images && ev.item.images.length ? `, ${ev.item.images.length} pictures` : ''}${ev.item.videos && ev.item.videos.length ? `, ${ev.item.videos.length} videos` : ''})`);
    else if (ev.type === 'error') console.log(`${since()}  ! ${ev.text}`);
    else if (ev.type === 'hello') console.log(`${since()}  hello`);
    else if (ev.type === 'paused') console.log(`${since()}  ${ev.paused ? 'PAUSED (queue held, transcript continues)' : 'RESUMED'}`);
    if (ev.type === 'status' && ev.text === 'file finished') done = true;
  }
};
const pumping = setInterval(() => pump().catch(() => {}), 1000);

console.log('prepare (models load; the first run downloads them)...');
const prep = await send({ type: 'prepare', brain: brainOrder ? { order: brainOrder } : {} });
await pump();
console.log('prepared:', JSON.stringify(prep));
if (!prep || !prep.ok) { clearInterval(pumping); await ctx.close(); server.close(); process.exit(1); }

// The side panel page is opened as a tab in both modes: its cards are counted at the end, and
// a tick must not rebuild them (node identity is checked, which is what the flicker was).
// --docs: seed two documents through the settings page's own store, so cards can hit them.
if (docsDir) {
  const files = [];
  for (const name of (await fs.readdir(docsDir)).sort()) {
    if (!/\.(md|txt|markdown)$/i.test(name)) continue;
    const text = await fs.readFile(path.join(docsDir, name), 'utf8');
    files.push({ name, text, size: Buffer.byteLength(text) });
  }
  const opts = await ctx.newPage();
  await opts.goto(sw.url().replace(/sw\.js$/, 'options.html'));
  await opts.waitForFunction(() => !!window.__jmeDocs);
  await opts.evaluate(([f, folder]) => window.__jmeDocs.save(f, folder), [files, path.basename(path.resolve(docsDir))]);
  console.log('documents seeded:', JSON.stringify(await opts.evaluate(async () => { const s = await window.__jmeDocs.load(); return { folder: s.folder, files: s.files.map((f) => f.name) }; })));
  await shot(opts, 'settings-documents');
  await opts.close();
}
const panel = await ctx.newPage();
if (shots) await panel.setViewportSize({ width: 600, height: 960 });
await panel.goto(sw.url().replace(/sw\.js$/, 'panel.html'));
panel.on('pageerror', (e) => console.log('panel page error:', e.message));
if (mic) {
  await panel.click('#mic'); // the real switch: panel -> sw.startMic -> offscreen getUserMedia
  await new Promise((r) => setTimeout(r, 1500));
  console.log('panel says:', await panel.evaluate(() => document.getElementById('state').textContent));
} else {
  const page = { title: 'Two friends on the Antikythera mechanism (demo)', author: 'J-me samples', description: 'A scripted chat about the Antikythera mechanism, the Library of Alexandria and what gets lost.', url: 'https://example.invalid/demo' };
  await sw.evaluate(() => { source = { kind: 'tab', tabId: 0 }; }); // so the panel's state line reads as it does in use
  const r = await send({ type: 'start', file: url, page, brain: brainOrder ? { order: brainOrder } : {}, ...(bridge ? { bridge: `http://127.0.0.1:${bridgePort}` } : {}) });
  console.log('start:', JSON.stringify(r));
}
const deadline = Date.now() + (seconds ? seconds * 1000 : 20 * 60 * 1000);
const pauseAt = args.includes('--pause') ? Date.now() + 20_000 : Infinity; // hold 25 s in the middle, then catch up
let pausedAt = 0;
const shotAt = shots ? [40, 80, 120, 150].map((t) => t0 + t * 1000) : [];
while (!done && Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 1000));
  if (shotAt.length && Date.now() >= shotAt[0]) { shotAt.shift(); await shot(panel, 'panel'); }
  if (!pausedAt && Date.now() >= pauseAt) { pausedAt = Date.now(); await send({ type: 'ws', msg: { type: 'pause' } }); console.log(`${since()}  >> pause`); }
  else if (pausedAt > 0 && Date.now() - pausedAt > 25_000) { pausedAt = -1; await send({ type: 'ws', msg: { type: 'resume' } }); console.log(`${since()}  >> resume`); }
}
clearInterval(pumping);
// "Answer here" through a custom OpenAI-compatible endpoint (Ollama's), on the first prompt card.
{
  const snap = await send({ type: 'drain' });
  const target = (snap.items || []).find((i) => i.kind === 'prompt') || (snap.items || [])[0];
  if (target) {
    await send({ type: 'ws', msg: { type: 'answer', id: target.id, frontier: { provider: 'custom', key: '', model: 'qwen2.5:7b', baseUrl: 'http://127.0.0.1:11434/v1' } } });
    for (let i = 0; i < 60; i++) { await new Promise((r) => setTimeout(r, 1000)); const s2 = await send({ type: 'drain' }); const it = (s2.items || []).find((i) => i.id === target.id); if (it && it.answer && it.answer !== '…') { console.log(`\nanswer here (${target.kind}: ${target.text}):\n  ${it.answer.replace(/\n/g, ' ').slice(0, 300)}`); break; } }
  }
}
if (bridge) {
  const s = bridge.state;
  console.log(`\nbridge state: listening=${s.listening} title=${JSON.stringify(s.title)} segments=${s.transcript.length} cards=${s.cards.length} pinned=${s.pinned.length} status=${JSON.stringify(s.status)}`);
  const r = bridge.command({ type: 'ask', text: 'What is the oldest known geared mechanism?', by: 'harness-agent' });
  console.log('agent ask ->', JSON.stringify(r));
  const ev = await new Promise((resolve) => { const off = bridge.on((e) => { if (e.type === 'item' && e.change === 'born' && /oldest known geared/.test(e.item.text)) { off(); resolve(e); } }); setTimeout(() => { off(); resolve(null); }, 15000); });
  console.log('agent card born:', ev ? `${ev.item.kind} "${ev.item.text}" (${ev.item.why})` : 'NOT SEEN');
}
const d = await send({ type: 'drain' });
await pump();
console.log(`\nsegments: ${d.segments.length}, live items: ${d.items.length}, expired: ${d.history.length}`);
for (const it of d.items) console.log(`  ${it.state.padEnd(9)} ${it.kind.padEnd(6)} ${it.text}  score ${it.score.toFixed(2)}${it.results ? `, ${it.results.length} results` : ''}${it.results && it.results.some((r) => r.source === 'docs') ? ` [📄 ${it.results.filter((r) => r.source === 'docs').map((r) => r.title).join('; ')}]` : ''}${it.images && it.images.length ? `, ${it.images.length} pictures` : ''}${it.videos && it.videos.length ? `, ${it.videos.length} videos` : ''}`);
{
  const seen = await panel.evaluate(async () => {
    const root = document.getElementById('jme-overlay').shadowRoot;
    const before = [...root.querySelectorAll('.card')];
    const imgsBefore = [...root.querySelectorAll('.imgs img')];
    await new Promise((r) => setTimeout(r, 2500)); // two ticks
    const after = [...root.querySelectorAll('.card')];
    const kept = before.filter((n) => after.includes(n)).length;
    const imgsKept = imgsBefore.filter((n) => n.isConnected).length;
    return { cards: after.length, prompts: root.querySelectorAll('.card.prompt').length, pictures: root.querySelectorAll('.imgs img').length, videos: root.querySelectorAll('.vids a').length, nodesKeptAcrossTicks: `${kept}/${before.length} cards, ${imgsKept}/${imgsBefore.length} pictures`, status: root.querySelector('.st').textContent, state: document.getElementById('state').textContent };
  });
  console.log('side panel shows:', JSON.stringify(seen));
}
if (shots) {
  // Open the first card that carries a document paragraph, so the green block is in the picture.
  const opened = await panel.evaluate(() => {
    const root = document.getElementById('jme-overlay').shadowRoot;
    const c = [...root.querySelectorAll('.card')].find((n) => !n.classList.contains('prompt')) || root.querySelector('.card');
    if (!c) return null;
    c.querySelector('.t span').click();
    return c.querySelector('.t span').textContent;
  });
  await new Promise((r) => setTimeout(r, 1200));
  console.log('opened card:', opened);
}
await shot(panel, 'panel-end');
await send({ type: 'stop' });
if (bridge) { await new Promise((r) => setTimeout(r, 800)); console.log('bridge after stop: listening=' + bridge.state.listening); bridge.close(); }
await ctx.close();
server.close();
