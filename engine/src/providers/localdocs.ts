import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SearchResult } from '../types.ts';
import { terms } from '../text.ts';

/**
 * Local documents provider: a folder of .md / .txt files indexed on this device, so a meeting
 * can pull up the internal doc instead of (or beside) a web result. v0 is a lexical BM25
 * index over paragraph chunks; an embedding index can replace `score` later without changing
 * the interface. Nothing here touches the network.
 */
interface Chunk {
  file: string;
  heading: string;
  text: string;
  tf: Map<string, number>;
  len: number;
}

export class LocalDocs {
  private chunks: Chunk[] = [];
  private df = new Map<string, number>();
  private avgLen = 1;
  ready = false;
  root: string;

  constructor(root: string) {
    this.root = root;
  }

  async index(): Promise<number> {
    const files = await walk(this.root);
    this.chunks = [];
    this.df.clear();
    for (const f of files) {
      const body = await fs.readFile(f, 'utf8');
      let heading = path.basename(f);
      for (const para of body.split(/\n\s*\n/)) {
        const p = para.trim();
        if (!p) continue;
        const h = p.match(/^#+\s*(.+)$/m);
        if (h) heading = h[1].trim();
        const ts = terms(p);
        if (ts.length < 4) continue;
        const tf = new Map<string, number>();
        for (const t of ts) tf.set(t, (tf.get(t) ?? 0) + 1);
        for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
        this.chunks.push({ file: path.relative(this.root, f), heading, text: p.slice(0, 600), tf, len: ts.length });
      }
    }
    this.avgLen = this.chunks.reduce((a, c) => a + c.len, 0) / Math.max(1, this.chunks.length);
    this.ready = true;
    return this.chunks.length;
  }

  search(query: string, max = 3): SearchResult[] {
    if (!this.ready || this.chunks.length === 0) return [];
    const q = [...new Set(terms(query))];
    const N = this.chunks.length;
    const k1 = 1.4;
    const b = 0.75;
    const scored: { c: Chunk; s: number }[] = [];
    for (const c of this.chunks) {
      let s = 0;
      for (const t of q) {
        const f = c.tf.get(t);
        if (!f) continue;
        const n = this.df.get(t) ?? 0;
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        s += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * c.len) / this.avgLen)));
      }
      if (s > 0) scored.push({ c, s });
    }
    scored.sort((x, y) => y.s - x.s);
    return scored.slice(0, max).map(({ c }) => ({
      title: `${c.heading} (${c.file})`,
      url: 'file:///' + path.join(this.root, c.file).replace(/\\/g, '/'),
      snippet: c.text.replace(/\s+/g, ' ').slice(0, 240),
      source: 'docs',
    }));
  }
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (/\.(md|txt|markdown)$/i.test(e.name)) out.push(p);
  }
  return out;
}
