// Drive the extension in a real Chrome and play a speech file through it, end to end:
// ear (VAD + Moonshine in the browser) -> engine -> brain -> queue. Prints what happens.
//
//   node tools/ext_test.mjs FILE.wav [--brain ollama|builtin|webllm] [--seconds N] [--profile DIR] [--mic]
//
// --mic feeds the file through Chrome's fake microphone instead (the side panel's switch path):
// permission is auto-granted, the panel page is opened in a tab and its cards are counted.
//
// Branded Chrome (137+) ignores --load-extension, so this runs Playwright's Chromium, which has no
// built-in model: --brain builtin is checked by hand in Chrome. Tab capture needs a real click on the toolbar icon, which no automation can do, so the
// test plays the file inside the offscreen page instead; the capture path is exercised by hand.
import { chromium } from 'playwright';
import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
if (!file) { console.error('usage: node tools/ext_test.mjs FILE.wav [--brain ollama|builtin|webllm] [--seconds N] [--profile DIR]'); process.exit(2); }
const brainOrder = opt('brain', '') ? [opt('brain')] : undefined;
const seconds = Number(opt('seconds', 0));
const mic = args.includes('--mic');
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
    else if (ev.type === 'item' && ev.change !== 'touched') console.log(`${since()}  ${ev.change.padEnd(7)} ${ev.item.kind.padEnd(6)} ${ev.item.text}  (${ev.item.score.toFixed(2)}${ev.item.results ? `, ${ev.item.results.length} results` : ''}${ev.item.images && ev.item.images.length ? `, ${ev.item.images.length} pictures` : ''})`);
    else if (ev.type === 'error') console.log(`${since()}  ! ${ev.text}`);
    else if (ev.type === 'hello') console.log(`${since()}  hello`);
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
const panel = await ctx.newPage();
await panel.goto(sw.url().replace(/sw\.js$/, 'panel.html'));
panel.on('pageerror', (e) => console.log('panel page error:', e.message));
if (mic) {
  await panel.click('#mic'); // the real switch: panel -> sw.startMic -> offscreen getUserMedia
  await new Promise((r) => setTimeout(r, 1500));
  console.log('panel says:', await panel.evaluate(() => document.getElementById('state').textContent));
} else {
  const r = await send({ type: 'start', file: url, brain: brainOrder ? { order: brainOrder } : {} });
  console.log('start:', JSON.stringify(r));
}
const deadline = Date.now() + (seconds ? seconds * 1000 : 20 * 60 * 1000);
while (!done && Date.now() < deadline) await new Promise((r) => setTimeout(r, 1000));
clearInterval(pumping);
const d = await send({ type: 'drain' });
await pump();
console.log(`\nsegments: ${d.segments.length}, live items: ${d.items.length}, expired: ${d.history.length}`);
for (const it of d.items) console.log(`  ${it.state.padEnd(9)} ${it.kind.padEnd(6)} ${it.text}  score ${it.score.toFixed(2)}${it.results ? `, ${it.results.length} results` : ''}${it.images && it.images.length ? `, ${it.images.length} pictures` : ''}`);
{
  const seen = await panel.evaluate(async () => {
    const root = document.getElementById('jme-overlay').shadowRoot;
    const before = [...root.querySelectorAll('.card')];
    const imgsBefore = [...root.querySelectorAll('.imgs img')];
    await new Promise((r) => setTimeout(r, 2500)); // two ticks
    const after = [...root.querySelectorAll('.card')];
    const kept = before.filter((n) => after.includes(n)).length;
    const imgsKept = imgsBefore.filter((n) => n.isConnected).length;
    return { cards: after.length, prompts: root.querySelectorAll('.card.prompt').length, pictures: root.querySelectorAll('.imgs img').length, nodesKeptAcrossTicks: `${kept}/${before.length} cards, ${imgsKept}/${imgsBefore.length} pictures`, status: root.querySelector('.st').textContent, state: document.getElementById('state').textContent };
  });
  console.log('side panel shows:', JSON.stringify(seen));
}
await send({ type: 'stop' });
await ctx.close();
server.close();
