// Does a brain answer, alone and then beside the ear? Opens the offscreen page as a tab.
//   node tools/ext_brain_probe.mjs webllm|ollama|builtin [profileDir]
import { chromium } from 'playwright';
import path from 'node:path';
import os from 'node:os';
const kind = process.argv[2] || 'webllm';
const EXT = path.resolve('extension');
const ctx = await chromium.launchPersistentContext(process.argv[3] || path.join(os.tmpdir(), 'jme-ext-test-profile'), {
  headless: false, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`], viewport: { width: 1000, height: 600 },
});
const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
await sw.evaluate(() => chrome.storage.local.set({ brainOrder: ['none'] })); // keep the warm-up out of the way
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}] ${m.text().slice(0, 300)}`); });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto(`chrome-extension://${new URL(sw.url()).host}/offscreen.html`);
await page.waitForFunction(() => typeof globalThis.__jme === 'object');
const ask = (label) => page.evaluate(async (label) => {
  const t0 = performance.now();
  try {
    const out = await globalThis.__b.chat([{ role: 'system', content: 'Respond with JSON only: {"items":[{"kind":"lookup","text":"...","why":"...","confidence":0.9}]}' }, { role: 'user', content: 'Transcript: "the Antikythera mechanism was found in 1901". Propose one item.' }], { json: true, maxTokens: 120 });
    return `${label}: ok in ${Math.round(performance.now() - t0)} ms: ${out.slice(0, 160).replace(/\s+/g, ' ')}`;
  } catch (e) { return `${label}: FAILED ${String(e && e.message || e).slice(0, 200)}`; }
}, label);
console.log(await page.evaluate(async (kind) => {
  const t0 = performance.now();
  try { globalThis.__b = await globalThis.__jme.pickBrain({ order: [kind], onStatus: (t) => console.log('[status] ' + t) }); } catch (e) { return 'FAILED ' + (e.stack || e.message); }
  return `brain ${globalThis.__b.name} in ${Math.round(performance.now() - t0)} ms`;
}, kind));
console.log(await ask('right after load'));
await page.waitForTimeout(15000);
console.log(await ask('after 15 s idle'));
console.log(await page.evaluate(async () => { const t0 = performance.now(); await globalThis.__jme.loadEar('wasm'); return `ear ${globalThis.__jme.ear.device} in ${Math.round(performance.now() - t0)} ms`; }));
console.log(await ask('after ear on wasm'));
await ctx.close();
