// Does Chrome's fake microphone deliver the wav? Open getUserMedia from an extension page with the
// same constraints the offscreen page uses, and print the signal level over a few seconds.
//   node tools/ext_fakemic_probe.mjs FILE.wav profileDir [loop]
import { chromium } from 'playwright';
import path from 'node:path';
const file = process.argv[2];
const loop = process.argv[4] === 'loop';
const EXT = path.resolve('extension');
const ctx = await chromium.launchPersistentContext(process.argv[3], {
  headless: false,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--use-fake-device-for-media-capture', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${path.resolve(file)}${loop ? '' : '%noloop'}`],
});
const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
const page = await ctx.newPage();
await page.goto(sw.url().replace(/sw\.js$/, 'options.html'));
const r = await page.evaluate(async () => {
  const out = [];
  for (const c of [{ audio: true }, { audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: true } }]) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ ...c, video: false });
      const t = s.getAudioTracks()[0];
      const ctx = new AudioContext({ sampleRate: 16000 });
      const src = ctx.createMediaStreamSource(s);
      const an = ctx.createAnalyser(); an.fftSize = 2048;
      src.connect(an);
      const buf = new Float32Array(an.fftSize);
      const levels = [];
      for (let i = 0; i < 8; i++) {
        await new Promise((f) => setTimeout(f, 500));
        an.getFloatTimeDomainData(buf);
        let sum = 0; for (const v of buf) sum += v * v;
        levels.push(Math.sqrt(sum / buf.length).toFixed(4));
      }
      out.push({ constraints: JSON.stringify(c), label: t.label, settings: t.getSettings(), levels, ctxRate: ctx.sampleRate });
      t.stop(); await ctx.close();
    } catch (e) { out.push({ constraints: JSON.stringify(c), error: e.name + ': ' + e.message }); }
  }
  return out;
});
for (const x of r) console.log(JSON.stringify(x));
await ctx.close();
