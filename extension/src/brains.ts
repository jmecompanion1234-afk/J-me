// Which brain, in the browser. In order of preference:
//   1. Ollama on this machine (the big brain from the developer install), when it answers;
//   2. the browser's built-in model (Chrome 138+), when it is available;
//   3. WebLLM running Qwen 2.5 3B on WebGPU, downloaded once into the browser cache.
//      (1.5B was tried: faster to load, same 25-35 s per call on an integrated GPU, and it
//      returned nothing usable for this prompt. Pinned to web-llm 0.2.82: 0.2.83+ disposes
//      in-use shape objects on prompts over ~100 characters, mlc-ai/web-llm#844.)
// All three run on this device. Only the first needs anything installed.
import type { Chat, ChatMessage, ChatOptions } from '../../engine/src/brain.ts';
import { ollamaChat } from '../../engine/src/brain.ts';

export type BrainKind = 'ollama' | 'builtin' | 'webllm';

export interface Brain {
  kind: BrainKind;
  name: string;
  chat: Chat;
}

export interface BrainOptions {
  ollamaHost: string;
  /** Ollama models in order of preference */
  ollamaPrefer: string[];
  webllmModel: string;
  /** try these in order; set to [] to skip one */
  order: BrainKind[];
  onStatus: (text: string) => void;
}

export const DEFAULT_BRAIN_OPTIONS: BrainOptions = {
  ollamaHost: 'http://127.0.0.1:11434',
  ollamaPrefer: ['qwen2.5:7b', 'qwen2.5:3b', 'qwen3:8b', 'llama3.1:8b', 'llama3.2:3b'],
  webllmModel: 'Qwen2.5-3B-Instruct-q4f16_1-MLC',
  order: ['ollama', 'builtin', 'webllm'],
  onStatus: () => {},
};

/** The JSON the anticipator asks for, as a schema for brains that can be constrained. */
export const ITEMS_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['search', 'lookup', 'prompt', 'media'] },
          text: { type: 'string' },
          why: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: ['kind', 'text', 'why', 'confidence'],
      },
    },
  },
  required: ['items'],
};

export async function pickBrain(o: Partial<BrainOptions> = {}): Promise<Brain> {
  const opts = { ...DEFAULT_BRAIN_OPTIONS, ...o };
  const tried: string[] = [];
  for (const which of opts.order) {
    const b = which === 'ollama' ? await tryOllama(opts) : which === 'builtin' ? await tryBuiltin(opts) : await tryWebllm(opts);
    if (b) return b;
    tried.push(which);
  }
  throw new Error(`no brain: tried ${tried.join(', ')}. Install Ollama, or use a browser with WebGPU.`);
}

async function tryOllama(o: BrainOptions): Promise<Brain | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(o.ollamaHost + '/api/tags', { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const tags = (await res.json()) as { models?: { name: string }[] };
    const names = (tags.models ?? []).map((m) => m.name);
    if (!names.length) return null;
    const pick = o.ollamaPrefer.find((p) => names.includes(p) || names.includes(p + ':latest')) ?? names[0];
    return { kind: 'ollama', name: `Ollama ${pick}`, chat: ollamaChat(o.ollamaHost, pick) };
  } catch {
    return null;
  }
}

// The Prompt API (built-in model). Typed here: the global is new and not in lib.dom yet.
interface LMSession {
  prompt(input: string, opts?: { responseConstraint?: unknown; signal?: AbortSignal }): Promise<string>;
  destroy(): void;
}
interface LanguageModelStatic {
  availability(opts?: unknown): Promise<'unavailable' | 'downloadable' | 'downloading' | 'available'>;
  params(): Promise<{ defaultTemperature: number; defaultTopK: number; maxTopK: number } | null>;
  create(opts: {
    initialPrompts?: { role: string; content: string }[];
    temperature?: number;
    topK?: number;
    monitor?: (m: EventTarget) => void;
    signal?: AbortSignal;
  }): Promise<LMSession>;
}

async function tryBuiltin(o: BrainOptions): Promise<Brain | null> {
  const LM = (globalThis as unknown as { LanguageModel?: LanguageModelStatic }).LanguageModel;
  if (!LM) return null;
  let avail: string;
  try {
    avail = await LM.availability();
  } catch {
    return null;
  }
  if (avail === 'unavailable') return null;
  if (avail !== 'available') o.onStatus('the browser is downloading its built-in model (once)');
  const params = await LM.params().catch(() => null);
  const chat: Chat = async (messages: ChatMessage[], c: ChatOptions) => {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const user = messages.filter((m) => m.role !== 'system').map((m) => m.content).join('\n\n');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), c.timeoutMs ?? 60_000);
    let session: LMSession | null = null;
    try {
      session = await LM.create({
        initialPrompts: system ? [{ role: 'system', content: system }] : [],
        temperature: c.temperature ?? params?.defaultTemperature ?? 0.3,
        topK: params?.defaultTopK ?? 3,
        signal: ctrl.signal,
        monitor: (m) =>
          m.addEventListener('downloadprogress', (e) => o.onStatus(`downloading the built-in model ${Math.round(((e as { loaded?: number }).loaded ?? 0) * 100)}%`)),
      });
      return await session.prompt(user, { signal: ctrl.signal, ...(c.json ? { responseConstraint: ITEMS_SCHEMA } : {}) });
    } finally {
      clearTimeout(timer);
      session?.destroy();
    }
  };
  // Prove it answers once, so a broken install falls through to WebLLM instead of failing live.
  try {
    await chat([{ role: 'user', content: 'Reply with the single word: ready' }], { timeoutMs: 180_000, maxTokens: 5 });
  } catch (e) {
    o.onStatus('built-in model not usable: ' + (e as Error).message);
    return null;
  }
  return { kind: 'builtin', name: 'browser built-in model', chat };
}

async function tryWebllm(o: BrainOptions): Promise<Brain | null> {
  if (!(navigator as unknown as { gpu?: unknown }).gpu) return null;
  const { CreateMLCEngine, prebuiltAppConfig } = await import('@mlc-ai/web-llm');
  o.onStatus(`loading ${o.webllmModel} (the first time downloads it once)`);
  const engine = await CreateMLCEngine(o.webllmModel, {
    // the Cache API is not reliable inside an offscreen document; IndexedDB is
    appConfig: { ...prebuiltAppConfig, useIndexedDBCache: true },
    initProgressCallback: (p) => o.onStatus(p.text.replace(/\[.*?\]/g, '').trim().slice(0, 120)),
  });
  const chat: Chat = async (messages, c) => {
    // No grammar-constrained output: WebLLM's matcher is unreliable here, and the prompt
    // already asks for JSON only; parseCandidates digs the object out of any wrapper text.
    const r = await engine.chat.completions.create({
      messages,
      temperature: c.temperature ?? 0.3,
      max_tokens: c.maxTokens ?? 600,
    });
    return r.choices[0]?.message?.content ?? '';
  };
  return { kind: 'webllm', name: o.webllmModel.replace(/-MLC$/, ''), chat };
}
