import type { SearchResult } from '../types.ts';
import { terms } from '../text.ts';

/**
 * The document index, platform-free: feed it documents (a name and their text), ask it for
 * the best paragraphs. v0 is lexical BM25 over paragraph chunks; an embedding index can replace
 * `score` later behind the same interface. Node reads a folder into it (localdocs.ts); the
 * extension reads the folder the person chose on the settings page (extension/src/docs.ts).
 * Nothing here touches the network.
 */
export interface DocSearch {
  ready: boolean;
  /** the document names, for the brain's context ("documents on hand") */
  names(): string[];
  search(query: string, max?: number): SearchResult[];
}

interface Chunk {
  file: string;
  heading: string;
  text: string;
  tf: Map<string, number>;
  len: number;
}

export class DocIndex implements DocSearch {
  private chunks: Chunk[] = [];
  private df = new Map<string, number>();
  private avgLen = 1;
  private files: string[] = [];
  ready = false;
  /** how a result's url is built from a file name (Node: file:///…; the browser: docs:…) */
  urlFor: (file: string) => string;

  constructor(urlFor: (file: string) => string = (f) => 'docs:' + encodeURIComponent(f)) {
    this.urlFor = urlFor;
  }

  clear(): void {
    this.chunks = [];
    this.df.clear();
    this.files = [];
    this.ready = false;
  }

  /** Add one document. Paragraphs become chunks; a markdown heading names the chunks under it. */
  add(file: string, body: string): number {
    let heading = file.replace(/^.*[\\/]/, '');
    let n = 0;
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
      this.chunks.push({ file, heading, text: p.slice(0, 600), tf, len: ts.length });
      n++;
    }
    if (n) this.files.push(file);
    return n;
  }

  /** Call after the last add(). */
  finish(): number {
    this.avgLen = this.chunks.reduce((a, c) => a + c.len, 0) / Math.max(1, this.chunks.length);
    this.ready = this.chunks.length > 0;
    return this.chunks.length;
  }

  names(): string[] {
    return [...this.files];
  }

  get size(): number {
    return this.chunks.length;
  }

  search(query: string, max = 3): SearchResult[] {
    if (!this.ready || this.chunks.length === 0) return [];
    const q = [...new Set(terms(query))];
    const N = this.chunks.length;
    const k1 = 1.4;
    const b = 0.75;
    const scored: { c: Chunk; s: number; hit: number }[] = [];
    for (const c of this.chunks) {
      let s = 0;
      let hit = 0;
      for (const t of q) {
        const f = c.tf.get(t);
        if (!f) continue;
        hit++;
        const n = this.df.get(t) ?? 0;
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        s += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * c.len) / this.avgLen)));
      }
      if (s > 0) scored.push({ c, s, hit });
    }
    scored.sort((x, y) => y.s - x.s);
    // A floor on relevance: one weak term is noise, not a document hit. Two matched terms, or
    // one strong one, counts (a small corpus has small idf, so an absolute floor alone fails).
    const top = scored[0]?.s ?? 0;
    return scored.filter(({ s, hit }) => (hit >= 2 || s >= 1.0) && s >= top * 0.35).slice(0, max).map(({ c }) => ({
      title: `${c.heading} (${c.file})`,
      url: this.urlFor(c.file),
      snippet: c.text.replace(/\s+/g, ' ').slice(0, 240),
      source: 'docs',
    }));
  }
}
