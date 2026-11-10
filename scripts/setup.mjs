// J-me setup: one command after `npm install`.
//   node scripts/setup.mjs            default brain (qwen2.5:7b, needs ~6 GB of GPU memory)
//   node scripts/setup.mjs --small    smaller brain (qwen2.5:3b) for laptops without a GPU
// Downloads the two on-device speech models (~250 MB) into models/, checks that Ollama is
// installed and running, and pulls the brain model. Safe to run again; it skips what is there.
import { existsSync, mkdirSync, createWriteStream, rmSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODELS = path.join(ROOT, 'models');
const BASE = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/';
const small = process.argv.includes('--small');
const BRAIN = process.env.JME_MODEL || (small ? 'qwen2.5:3b' : 'qwen2.5:7b');
const OLLAMA = process.env.JME_OLLAMA || 'http://127.0.0.1:11434';

const say = (s) => console.log(s);
const fail = (s) => { console.error('\n' + s); process.exit(1); };

async function download(name, dest) {
  say(`  downloading ${name} ...`);
  const res = await fetch(BASE + name, { redirect: 'follow' });
  if (!res.ok || !res.body) fail(`download failed: ${name} (${res.status})`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

async function speechModels() {
  mkdirSync(MODELS, { recursive: true });
  const vad = path.join(MODELS, 'silero_vad.onnx');
  if (existsSync(vad)) say('  silero VAD: present');
  else await download('silero_vad.onnx', vad);
  const moon = path.join(MODELS, 'sherpa-onnx-moonshine-base-en-int8');
  if (existsSync(moon)) say('  moonshine STT: present');
  else {
    const tgz = path.join(MODELS, 'moonshine.tar.bz2');
    await download('sherpa-onnx-moonshine-base-en-int8.tar.bz2', tgz);
    const r = spawnSync('tar', ['-xjf', tgz, '-C', MODELS], { stdio: 'inherit' });
    if (r.status !== 0) fail('could not extract the Moonshine model: is `tar` installed? (it ships with Windows 10+, macOS and Linux)');
    rmSync(tgz, { force: true });
  }
}

async function brain() {
  let up = false;
  try { up = (await fetch(OLLAMA + '/api/tags')).ok; } catch {}
  if (!up) {
    const r = spawnSync('ollama', ['--version'], { encoding: 'utf8' });
    if (r.error) fail('Ollama is not installed. Get it at https://ollama.com, then run this again.');
    fail(`Ollama is installed but not running at ${OLLAMA}. Start it (open the Ollama app, or run \`ollama serve\`), then run this again.`);
  }
  const tags = await (await fetch(OLLAMA + '/api/tags')).json();
  const have = (tags.models || []).some((m) => m.name === BRAIN || m.name === BRAIN + ':latest');
  if (have) { say(`  brain ${BRAIN}: present`); return; }
  say(`  pulling ${BRAIN} with Ollama (a few GB, once) ...`);
  const r = spawnSync('ollama', ['pull', BRAIN], { stdio: 'inherit' });
  if (r.status !== 0) fail(`ollama pull ${BRAIN} failed`);
}

say('J-me setup');
say('speech (on device):');
await speechModels();
say('brain (on device, via Ollama):');
await brain();
say(`\nReady. Start J-me with J-me.cmd (Windows) or ./jme.sh (macOS, Linux).`);
if (BRAIN !== 'qwen2.5:7b') say(`The engine uses ${BRAIN} when JME_MODEL=${BRAIN} is set, or with --model ${BRAIN}.`);
