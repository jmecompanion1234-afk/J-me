import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Mode } from './types.ts';
import { serve } from './server.ts';
import { runBacktest } from './backtest.ts';
import { LocalDocs } from './providers/localdocs.ts';
import { loadCompanionOrMap, writeCompanion } from './companion.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const HELP = `J-me engine

  node engine/src/main.ts                      live: serve the UI at http://localhost:8787
  node engine/src/main.ts --backtest FILE      replay a transcript (.srt .vtt .json .txt) and write a buffer map
  node engine/src/main.ts --companion MAP      build the viewer companion page from a .map.json (or a reviewed .jme.json)
      [--youtube VIDEO_ID] [--title "Episode title"]

options
  --mode room|media        decay profile and prompt framing (default: room live, media for backtests)
  --docs DIR               also search a local folder of .md/.txt (internal docs) for staged items
  --fetch                  backtest only: actually run web searches for staged items (default: dry)
  --every SEC              seconds of transcript between anticipator calls (default 15)
  --window SEC             seconds of transcript the anticipator sees (default 60)
  --limit SEC              backtest only: stop after this much transcript
  --model NAME             Ollama model (default qwen2.5:7b, or $JME_MODEL)
  --port N                 live only (default 8787)
  --host ADDR              live only (default 127.0.0.1; 0.0.0.0 to reach it from other devices)
`;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main(): Promise<void> {
  if (flag('help') || flag('h')) {
    console.log(HELP);
    return;
  }
  const log = (line: string) => console.log(line);
  const companion = arg('companion');
  if (companion) {
    const src = path.resolve(companion);
    const c = await loadCompanionOrMap(src, { youtubeId: arg('youtube'), title: arg('title') });
    const outBase = path.join(path.dirname(src), path.basename(src).replace(/\.(map|jme|reviewed\.jme)?\.json$/, ''));
    const { jsonPath, htmlPath } = await writeCompanion(c, outBase);
    log(`companion: ${c.items.length} items, ${c.items.filter((i) => i.approved).length} shown to viewers${c.video ? `, synced to YouTube ${c.video.id}` : ''}`);
    log(`  ${jsonPath}\n  ${htmlPath}`);
    return;
  }
  const backtest = arg('backtest');
  const mode = (arg('mode') as Mode | undefined) ?? (backtest ? 'media' : 'room');
  const anticipator = arg('model') ? { model: arg('model') } : {};
  const windowSec = Number(arg('window') ?? 60);
  const anticipateEvery = Number(arg('every') ?? 15);
  let docs: LocalDocs | undefined;
  if (arg('docs')) {
    docs = new LocalDocs(path.resolve(arg('docs') as string));
    log(`local docs: ${await docs.index()} chunks indexed`);
  }

  if (backtest) {
    await runBacktest({
      file: path.resolve(backtest),
      mode,
      outDir: path.join(ROOT, 'sessions', 'backtests'),
      sampleEvery: 5,
      limitSec: Number(arg('limit') ?? 0),
      engine: { anticipator, windowSec, anticipateEvery, fetchWeb: flag('fetch'), answerPrompts: flag('fetch'), docs },
      log,
    });
    return;
  }

  await serve({
    port: Number(arg('port') ?? 8787),
    host: arg('host') ?? '127.0.0.1',
    uiDir: path.join(ROOT, 'ui'),
    modelsDir: path.join(ROOT, 'models'),
    sessionsDir: path.join(ROOT, 'sessions'),
    mode,
    docsDir: arg('docs') ? path.resolve(arg('docs') as string) : undefined,
    log,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
