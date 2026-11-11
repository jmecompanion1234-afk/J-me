// Build the extension: bundle the offscreen page (ear + engine + brains) with esbuild and
// copy the runtime files it loads by URL into extension/vendor/. Run after any change under
// extension/src/ or engine/src/:   npm run build:ext
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.join(ROOT, 'extension');
const VENDOR = path.join(EXT, 'vendor');
const NM = path.join(ROOT, 'node_modules');

rmSync(VENDOR, { recursive: true, force: true });
rmSync(path.join(EXT, 'chunks'), { recursive: true, force: true });
mkdirSync(VENDOR, { recursive: true });
const ORT = path.join(NM, 'onnxruntime-web', 'dist');
const copies = [
  // the dev build transformers.js pins loads the asyncify variant for both wasm and WebGPU
  ...['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm'].map((f) => [path.join(ORT, f), f]),
  [path.join(NM, '@ricky0123', 'vad-web', 'dist', 'silero_vad_v5.onnx'), 'silero_vad_v5.onnx'],
];
for (const [from, name] of copies) {
  copyFileSync(from, path.join(VENDOR, name));
  console.log(`vendor/${name}  ${(statSync(from).size / 1e6).toFixed(1)} MB`);
}

const r = await build({
  entryPoints: [path.join(EXT, 'src', 'offscreen.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['chrome128'],
  outdir: EXT,
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]',
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  external: ['onnxruntime-node', 'sharp', 'node:*', 'fs', 'path', 'url', 'module'],
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info',
  metafile: true,
});
const outs = Object.entries(r.metafile.outputs).map(([f, o]) => `${path.relative(ROOT, f)}  ${(o.bytes / 1e6).toFixed(2)} MB`);
console.log(outs.join('\n'));
