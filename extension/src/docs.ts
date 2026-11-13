// The person's own documents, in the browser. The settings page reads the folder they chose
// (File System Access API, a click) and stores each file's text in IndexedDB; the offscreen
// page builds the index from that store, so it never needs the folder handle or a gesture.
// Nothing leaves the machine.
import { DocIndex } from '../../engine/src/providers/docindex.ts';

export interface StoredDoc {
  name: string;
  text: string;
  size: number;
}
export interface DocStore {
  folder: string;
  files: StoredDoc[];
  updatedAt: number;
}

const DB = 'jme-docs';
const STORE = 'docs';
const KEY = 'folder';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadDocStore(): Promise<DocStore | null> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as DocStore) ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function saveDocStore(store: DocStore | null): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const os = tx.objectStore(STORE);
      if (store) os.put(store, KEY);
      else os.delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** The index the engine searches, built from the store. Null when there are no documents. */
export async function loadDocIndex(): Promise<DocIndex | null> {
  const store = await loadDocStore();
  if (!store || !store.files.length) return null;
  const idx = new DocIndex((f) => 'docs:' + encodeURIComponent(f));
  for (const f of store.files) idx.add(f.name, f.text);
  idx.finish();
  return idx.ready ? idx : null;
}

// ---- reading a folder (settings page only: it needs the person's click) ----
const TEXT_EXT = /\.(md|markdown|txt|text|json|csv|tsv|html?|xml|yaml|yml|rst|org|log)$/i;
const MAX_FILE = 2 * 1024 * 1024;
const MAX_FILES = 800;

/** Walk a directory handle and read every text-like file. HTML is stripped to text. */
export async function readFolder(dir: FileSystemDirectoryHandle, onProgress?: (n: number) => void): Promise<StoredDoc[]> {
  const out: StoredDoc[] = [];
  const walk = async (h: FileSystemDirectoryHandle, prefix: string): Promise<void> => {
    for await (const [name, entry] of (h as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
      if (out.length >= MAX_FILES) return;
      if (name.startsWith('.') || name === 'node_modules') continue;
      if (entry.kind === 'directory') await walk(entry as FileSystemDirectoryHandle, prefix + name + '/');
      else if (TEXT_EXT.test(name)) {
        const file = await (entry as FileSystemFileHandle).getFile();
        if (file.size > MAX_FILE) continue;
        let text = await file.text();
        if (/\.(html?|xml)$/i.test(name)) text = text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        if (/\.json$/i.test(name)) text = text.replace(/[{}\[\]",]/g, ' ');
        out.push({ name: prefix + name, text, size: file.size });
        onProgress?.(out.length);
      }
    }
  };
  await walk(dir, '');
  return out;
}
