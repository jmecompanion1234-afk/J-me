// What does a web search look like from inside the extension? Prints status, size and parsed count.
import { chromium } from 'playwright';
import path from 'node:path';
import os from 'node:os';
const EXT = path.resolve('extension');
const ctx = await chromium.launchPersistentContext(path.join(os.tmpdir(), 'jme-ext-test-profile'), {
  headless: false, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`], viewport: { width: 1000, height: 600 },
});
const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
const page = await ctx.newPage();
page.on('request', (r) => { if (/vendor\//.test(r.url())) console.log('[request]', r.url().split('/').pop()); });
await page.goto(`chrome-extension://${new URL(sw.url()).host}/offscreen.html`);
await page.waitForFunction(() => typeof globalThis.__jme === 'object');
const r = await page.evaluate(async () => {
  const res = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent('Antikythera mechanism'), { headers: { accept: 'text/html' } });
  const html = await res.text();
  return { status: res.status, type: res.headers.get('content-type'), len: html.length, results: (html.match(/result__a/g) || []).length, head: html.replace(/\s+/g, ' ').slice(0, 600) };
});
console.log(JSON.stringify(r, null, 1));
const r2 = await page.evaluate(async () => { try { await globalThis.__jme.prepare({ order: ['ollama'] }); return { ear: globalThis.__jme.ear?.device, brain: globalThis.__jme.brain?.name }; } catch (e) { return { error: e.message }; } });
console.log('prepare:', JSON.stringify(r2));
await ctx.close();
