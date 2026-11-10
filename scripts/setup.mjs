// J-me setup: one command after `npm install`.
//   node scripts/setup.mjs            looks at the GPU and picks the brain: qwen2.5:7b with
//                                     6 GB or more of GPU memory, qwen2.5:3b otherwise
//   node scripts/setup.mjs --small    force the smaller brain
//   node scripts/setup.mjs --large    force the 7B brain
// Downloads the two on-device speech models (~250 MB) into models/, checks that Ollama is
// installed and running, pulls the brain, and writes the choice to jme.local.json so the
// engine uses it. Safe to run again; it skips what is there.
import { existsSync, mkdirSync, createWriteStream, rmSync, writeFileSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODELS = path.join(ROOT, 'models');
const BASE = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/';
const LARGE = 'qwen2.5:7b', SMALL = 'qwen2.5:3b';

/** GPU memory in MB, or 0 when there is no NVIDIA GPU to ask (Ollama then runs on the CPU). */
function gpuMemoryMb() {
  const r = spawnSync('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader'], { encoding: 'utf8' });
  if (r.error || r.status !== 0 || !r.stdout) return { name: null, mb: 0 };
  const line = r.stdout.trim().split(/\r?\n/)[0];
  const m = line.match(/^(.*),\s*(\d+)\s*MiB/);
  return m ? { name: m[1].trim(), mb: Number(m[2]) } : { name: line, mb: 0 };
}

let BRAIN = process.env.JME_MODEL;
let reason = BRAIN ? `JME_MODEL is set` : '';
if (!BRAIN && process.argv.includes('--small')) { BRAIN = SMALL; reason = '--small'; }
if (!BRAIN && process.argv.includes('--large')) { BRAIN = LARGE; reason = '--large'; }
if (!BRAIN) {
  const gpu = gpuMemoryMb();
  if (gpu.mb >= 6000) { BRAIN = LARGE; reason = `${gpu.name}, ${Math.round(gpu.mb / 1024)} GB`; }
  else { BRAIN = SMALL; reason = gpu.name ? `${gpu.name} has only ${Math.round(gpu.mb / 1024)} GB` : 'no NVIDIA GPU found, so the brain runs on the CPU'; }
}
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
say(`brain (on device, via Ollama): ${BRAIN}  (${reason})`);
await brain();
writeFileSync(path.join(ROOT, 'jme.local.json'), JSON.stringify({ model: BRAIN }, null, 2) + '\n');
say('  written to jme.local.json; the engine uses it. Re-run with --small or --large to change.');
say(`\nReady. Start J-me with J-me.cmd (Windows) or ./jme.sh (macOS, Linux).`);
