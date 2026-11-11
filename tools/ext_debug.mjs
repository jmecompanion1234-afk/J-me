// Open the extension's offscreen page as a tab in Playwright's Chromium and print its console.
import { chromium } from 'playwright';
import path from 'node:path';
import os from 'node:os';
const EXT = path.resolve('extension');
const ctx = await chromium.launchPersistentContext(path.join(os.tmpdir(), 'jme-ext-test-profile'), {
  headless: false, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`], viewport: { width: 1000, height: 600 },
});
const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
const id = new URL(sw.url()).host;
const page = await ctx.newPage();
page.on('console', (m) => console.log(`[${m.type()}] ${m.text().slice(0, 400)}`));
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto(`chrome-extension://${id}/offscreen.html`);
await page.waitForTimeout(3000);
const has = await page.evaluate(() => typeof globalThis.__jme);
console.log('__jme:', has, 'webgpu:', await page.evaluate(() => !!navigator.gpu), 'LanguageModel:', await page.evaluate(() => typeof globalThis.LanguageModel));
if (has === 'object') {
  const order = process.argv[2] ? [process.argv[2]] : ['ollama'];
  const r = await page.evaluate(async (order) => { try { await globalThis.__jme.prepare({ order }); return { ear: globalThis.__jme.ear?.device, brain: globalThis.__jme.brain?.name }; } catch (e) { return { error: e.message, stack: e.stack }; } }, order);
  console.log('prepare:', JSON.stringify(r));
}
await ctx.close();
