// The Documents section of the settings page: choose a folder, read it, store the text locally.
// Bundled separately (extension/options-docs.js) because it shares docs.ts with the offscreen page.
import { loadDocStore, readFolder, saveDocStore, type DocStore, type StoredDoc } from './docs.ts';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const state = $('docsstate');
const list = $('docslist');

function show(store: DocStore | null): void {
  if (!store || !store.files.length) {
    state.textContent = 'No documents yet.';
    list.textContent = '';
    return;
  }
  const kb = Math.round(store.files.reduce((a, f) => a + f.size, 0) / 1024);
  state.textContent = `${store.files.length} file${store.files.length === 1 ? '' : 's'} from "${store.folder}" (${kb} KB), read ${new Date(store.updatedAt).toLocaleString()}.`;
  list.textContent = store.files.slice(0, 40).map((f) => f.name).join(' · ') + (store.files.length > 40 ? ` · and ${store.files.length - 40} more` : '');
}

async function save(folder: string, files: StoredDoc[]): Promise<void> {
  const store: DocStore | null = files.length ? { folder, files, updatedAt: Date.now() } : null;
  await saveDocStore(store);
  await chrome.storage.local.set({ docsUpdatedAt: Date.now(), docsCount: files.length });
  show(store);
}

$('docspick').onclick = async () => {
  const picker = (window as unknown as { showDirectoryPicker?: (o?: { mode?: string }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
  if (!picker) { state.textContent = 'This browser cannot open folders from a page (Chrome and Edge can).'; return; }
  let dir: FileSystemDirectoryHandle;
  try { dir = await picker.call(window, { mode: 'read' }); } catch { return; }
  state.textContent = `Reading "${dir.name}"…`;
  const files = await readFolder(dir, (n) => { state.textContent = `Reading "${dir.name}"… ${n} files`; });
  await save(dir.name, files);
};

$('docsforget').onclick = () => save('', []);

loadDocStore().then(show);

// For the test harness: seed documents without a folder picker.
(window as unknown as { __jmeDocs: unknown }).__jmeDocs = { save: (files: StoredDoc[], folder = 'test') => save(folder, files), load: loadDocStore };
