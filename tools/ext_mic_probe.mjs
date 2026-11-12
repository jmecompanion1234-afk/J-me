// Why did the side panel's microphone switch not start? Click it, watch the panel's console and
// the service worker's answer, then call startMic() directly.
//   node tools/ext_mic_probe.mjs FILE.wav [profileDir]
import { chromium } from 'playwright';
import path from 'node:path';
import os from 'node:os';
const file = process.argv[2];
const EXT = path.resolve('extension');
const ctx = await chromium.launchPersistentContext(process.argv[3] || path.join(os.tmpdir(), 'jme-ext-test-profile'), {
  headless: false,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--use-fake-device-for-media-capture', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${path.resolve(file)}%noloop`],
});
const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
sw.on('console', (m) => console.log('sw console:', m.text()));
await sw.evaluate(async () => { globalThis.__events = []; await chrome.storage.local.set({ brainOrder: ['ollama'] }); await ensureOffscreen(); });
const t = () => new Date().toISOString().slice(11, 19);
const panel = await ctx.newPage();
panel.on('console', (m) => console.log(t(), 'panel console:', m.text()));
panel.on('pageerror', (e) => console.log(t(), 'panel error:', e.message));
await panel.goto(sw.url().replace(/sw\.js$/, 'panel.html'));
console.log(t(), 'panel loaded; state:', await panel.evaluate(() => document.getElementById('state').textContent));
console.log(t(), 'direct state query:', JSON.stringify(await panel.evaluate(() => chrome.runtime.sendMessage({ target: 'sw', type: 'state' }))));
await panel.click('#mic');
console.log(t(), 'clicked; checked =', await panel.evaluate(() => document.getElementById('mic').checked));
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const st = await panel.evaluate(() => document.getElementById('state').textContent);
  const src = await sw.evaluate(() => source);
  if (i % 5 === 0 || src) console.log(t(), 'state:', st, '| sw source:', JSON.stringify(src));
  if (src) break;
}
const evs = await sw.evaluate(() => globalThis.__events.splice(0));
console.log(t(), 'events:', evs.filter((e) => e.type !== 'queue').map((e) => e.type + ':' + (e.text || e.segment?.text || '')).join(' | ').slice(0, 1200));
if (!(await sw.evaluate(() => source))) {
  console.log(t(), 'calling startMic() directly:', await sw.evaluate(() => startMic().then(() => 'ok', (e) => 'ERR ' + (e && e.message))));
  await new Promise((r) => setTimeout(r, 15000));
  const evs2 = await sw.evaluate(() => globalThis.__events.splice(0));
  console.log(t(), 'events:', evs2.filter((e) => e.type !== 'queue').map((e) => e.type + ':' + (e.text || e.segment?.text || '')).join(' | ').slice(0, 1200));
}
await ctx.close();
