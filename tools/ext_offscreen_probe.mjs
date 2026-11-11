// Bisect a brain failure inside the real offscreen document: a series of chat requests of
// growing size, stopping at the first failure.
//   node tools/ext_offscreen_probe.mjs [profileDir] [lengths|real] [webllmModel]
import { chromium } from 'playwright';
import path from 'node:path';
import os from 'node:os';
const EXT = path.resolve('extension');
const ctx = await chromium.launchPersistentContext(process.argv[2] || path.join(os.tmpdir(), 'jme-ext-test-profile'), {
  headless: false, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`], viewport: { width: 1000, height: 600 },
});
const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
await sw.evaluate(async () => { globalThis.__events = []; await chrome.storage.local.set({ brainOrder: ['webllm'] }); await ensureOffscreen(); });
const send = async (msg) => {
  for (let i = 0; i < 60; i++) {
    try { return await sw.evaluate((m) => chrome.runtime.sendMessage({ target: 'offscreen', ...m }), msg); }
    catch (e) { if (!/Receiving end does not exist/.test(e.message)) throw e; await new Promise((r) => setTimeout(r, 500)); }
  }
};
const t = () => new Date().toISOString().slice(11, 19);
const chat = async (label, messages, opts) => {
  const t0 = Date.now();
  const r = await send({ type: 'chat', messages, opts });
  console.log(t(), label, JSON.stringify(r).slice(0, 140), `${Date.now() - t0} ms`);
  return r && r.ok;
};
const model = process.argv[4];
const brain = { order: ['webllm'], ...(model ? { webllmModel: model } : {}) };
console.log(t(), 'prepare', JSON.stringify(await send({ type: 'prepare', brain })));
const USER = [
  'Mode: listening to media (podcast/video/lecture)',
  'N: 3',
  'Already in queue:',
  '(empty)',
  '',
  'Most recent transcript:',
  '"""',
  'Okay so before we get into the main thing, I want to go back to what you said last week about the Antikythera mechanism, because I went down a rabbit hole on that.',
  'Oh man, the Antikythera thing.',
  '"""',
].join('\n');
const lengths = [100, 200, 300, 400, 500, 700].map((n) => [`system of ${n} words + user, 60`, [{ role: 'system', content: ('word ').repeat(n) + 'Reply tersely.' }, { role: 'user', content: 'Say the word ready.' }], { maxTokens: 60 }]);
const variants = process.argv[3] === 'lengths' ? lengths : [
  ['1 user only, 600 tokens', [{ role: 'user', content: 'Say the word ready.' }], { maxTokens: 600 }],
  ['2 short system + user, 60', [{ role: 'system', content: 'You are terse.' }, { role: 'user', content: 'Say the word ready.' }], { maxTokens: 60 }],
  ['3 long system + short user, 60', [{ role: 'system', content: '$SYSTEM' }, { role: 'user', content: 'Say the word ready.' }], { maxTokens: 60 }],
  ['4 long system + real user, 60', [{ role: 'system', content: '$SYSTEM' }, { role: 'user', content: USER }], { maxTokens: 60 }],
  ['5 the real call (600, temp 0.3)', [{ role: 'system', content: '$SYSTEM' }, { role: 'user', content: USER }], { maxTokens: 600, temperature: 0.3 }],
  ['6 again user only', [{ role: 'user', content: 'Say the word ready.' }], { maxTokens: 60 }],
];
for (const [label, messages, opts] of variants) if (!(await chat(label, messages, opts))) break;
await ctx.close();
