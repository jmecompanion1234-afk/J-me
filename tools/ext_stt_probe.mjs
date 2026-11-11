// Which Moonshine device/precision works in this browser? Loads the extension's offscreen page
// as a tab and runs the first 6 s of a wav through each combination.
import { chromium } from 'playwright';
import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const file = process.argv[2];
const EXT = path.resolve('extension');
const audio = await fs.readFile(file);
const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'audio/wav', 'access-control-allow-origin': '*' }); res.end(audio); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/a.wav`;
const ctx = await chromium.launchPersistentContext(process.argv[4] || path.join(os.tmpdir(), 'jme-ext-test-profile'), {
  headless: false, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`], viewport: { width: 1000, height: 600 },
});
const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log(`[console.error] ${m.text().slice(0, 300)}`); });
await page.goto(`chrome-extension://${new URL(sw.url()).host}/offscreen.html`);
await page.waitForFunction(() => typeof globalThis.__jme === 'object');
const combos = JSON.parse(process.argv[3] || '[["webgpu","fp32"],["webgpu","fp16"],["webgpu","q8"],["webgpu","q4"],["wasm","q8"],["wasm","fp32"]]');
for (const [device, dtype] of combos) {
  const r = await page.evaluate(async ({ url, device, dtype, model }) => {
    const ac = new AudioContext({ sampleRate: 16000 });
    const buf = await ac.decodeAudioData(await (await fetch(url)).arrayBuffer());
    const samples = buf.getChannelData(0).slice(0, 16000 * 6);
    await ac.close();
    const t0 = performance.now();
    try {
      const stt = await globalThis.__jme.pipeline('automatic-speech-recognition', model, { device, dtype });
      const t1 = performance.now();
      const out = await stt(samples);
      const t2 = performance.now();
      const out2 = await stt(samples.slice(0, 16000 * 3));
      const t3 = performance.now();
      return { ok: true, load: Math.round(t1 - t0), run6s: Math.round(t2 - t1), run3s: Math.round(t3 - t2), text: out.text, text2: out2.text };
    } catch (e) { return { ok: false, error: String(e && e.message || e).slice(0, 200), load: Math.round(performance.now() - t0) }; }
  }, { url, device, dtype, model: 'onnx-community/moonshine-base-ONNX' });
  console.log(device, dtype, JSON.stringify(r));
}
await ctx.close();
server.close();
