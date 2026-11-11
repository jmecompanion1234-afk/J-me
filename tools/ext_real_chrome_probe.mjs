// Run the extension's prepare step inside branded Chrome (not Playwright's Chromium).
import { chromium } from 'playwright';
import path from 'node:path';
const EXT = path.resolve('extension');
const ctx = await chromium.launchPersistentContext(process.argv[2], {
  headless: false, channel: 'chrome',
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--disable-features=DisableLoadExtensionCommandLineSwitch'],
  viewport: { width: 1000, height: 600 },
});
const t = () => new Date().toISOString().slice(11, 19);
let sw = ctx.serviceWorkers()[0];
if (!sw) { console.log(t(), 'waiting for the service worker'); sw = await ctx.waitForEvent('serviceworker', { timeout: 20000 }).catch(() => null); }
if (!sw) { console.log(t(), 'NO SERVICE WORKER: branded Chrome refused the extension'); await ctx.close(); process.exit(2); }
console.log(t(), 'sw', sw.url());
const ver = await sw.evaluate(() => navigator.userAgent);
console.log(t(), ver);
await sw.evaluate(async () => { globalThis.__events = []; await ensureOffscreen(); });
const r = await sw.evaluate(() => send({ type: 'prepare', brain: {} }));
console.log(t(), 'prepare', JSON.stringify(r));
const ev = await sw.evaluate(() => globalThis.__events.filter(e => e.type === 'status').map(e => e.text));
console.log(ev.join('\n'));
await ctx.close();
