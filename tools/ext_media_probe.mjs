// Does the offscreen document see navigator.mediaDevices and chrome.tabCapture exist in the SW?
import { chromium } from 'playwright';
import path from 'node:path';
const EXT = path.resolve('extension');
const ctx = await chromium.launchPersistentContext(process.argv[2], { headless: false, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
console.log('sw has', await sw.evaluate(() => ({ tabCapture: typeof chrome.tabCapture, getMediaStreamId: typeof chrome.tabCapture?.getMediaStreamId, offscreen: typeof chrome.offscreen, scripting: typeof chrome.scripting })));
await sw.evaluate(async () => { globalThis.__events = []; await ensureOffscreen(); });
const off = await ctx.newPage(); await off.goto(sw.url().replace(/sw\.js$/, 'offscreen.html'));
console.log('offscreen has', await off.evaluate(() => ({ mediaDevices: typeof navigator.mediaDevices, getUserMedia: typeof navigator.mediaDevices?.getUserMedia, AudioWorkletNode: typeof AudioWorkletNode, gpu: typeof navigator.gpu })));
const page = await ctx.newPage(); await page.goto('https://example.com');
const r = await sw.evaluate(async () => { try { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); return await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }); } catch (e) { return 'ERR ' + e.message; } });
console.log('getMediaStreamId without a gesture:', r);
await ctx.close();
