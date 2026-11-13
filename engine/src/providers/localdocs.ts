import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SearchResult } from '../types.ts';
import { DocIndex, type DocSearch } from './docindex.ts';

/**
 * Local documents provider for Node: a folder of .md / .txt files on this device, so a meeting
 * can pull up the internal doc instead of (or beside) a web result. The index itself is
 * DocIndex (platform-free); this walks the folder. Nothing here touches the network.
 */
export class LocalDocs implements DocSearch {
  private idx: DocIndex;
  root: string;

  constructor(root: string) {
    this.root = root;
    this.idx = new DocIndex((f) => 'file:///' + path.join(root, f).replace(/\\/g, '/'));
  }

  get ready(): boolean {
    return this.idx.ready;
  }

  async index(): Promise<number> {
    this.idx.clear();
    for (const f of await walk(this.root)) {
      const body = await fs.readFile(f, 'utf8');
      this.idx.add(path.relative(this.root, f), body);
    }
    return this.idx.finish();
  }

  names(): string[] {
    return this.idx.names();
  }

  search(query: string, max = 3): SearchResult[] {
    return this.idx.search(query, max);
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
