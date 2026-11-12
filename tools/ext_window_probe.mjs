// Does the reader window tile beside the video window? Call the service worker's openBeside twice
// (a new window, then reuse) and print the window bounds.
import { chromium } from 'playwright';
import path from 'node:path';
const EXT = path.resolve('extension');
const ctx = await chromium.launchPersistentContext(process.argv[2], { headless: false, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`], viewport: null });
const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
const page = await ctx.newPage(); await page.goto('https://example.com');
const r1 = await sw.evaluate(async () => { await openBeside('https://en.wikipedia.org/wiki/Antikythera_mechanism', 'reader', { w: 1600, h: 900 }, null); const ws = await chrome.windows.getAll({ populate: true }); return ws.map((w) => ({ type: w.type, left: w.left, top: w.top, width: w.width, height: w.height, url: w.tabs[0]?.url?.slice(0, 50) })); });
console.log('after first link:', JSON.stringify(r1));
const r2 = await sw.evaluate(async () => { await openBeside('https://en.wikipedia.org/wiki/Library_of_Alexandria', 'reader', { w: 1600, h: 900 }, null); const ws = await chrome.windows.getAll({ populate: true }); return { windows: ws.length, readerUrl: ws.find((w) => w.type === 'popup')?.tabs[0]?.url }; });
console.log('after second link:', JSON.stringify(r2));
await ctx.close();
