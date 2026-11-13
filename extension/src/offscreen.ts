// J-me offscreen page: the whole engine, in the browser. Takes the captured tab audio,
// keeps it audible, runs the ear and the brain here, and relays engine events to the
// overlay through the service worker. Nothing is installed and nothing leaves the device
// but the web searches for staged items.
import { Engine, type SearchFn } from '../../engine/src/engine.ts';
import { wikiLookup } from '../../engine/src/providers/wiki.ts';
import { ddgInstant } from '../../engine/src/providers/ddg_instant.ts';
import type { EngineEvent } from '../../engine/src/types.ts';
import { Ear, configureRuntime } from './ear.ts';
import { pipeline } from '@huggingface/transformers';
import { pickBrain, type Brain, type BrainOptions } from './brains.ts';
import { frontierAnswer, type FrontierSettings } from './frontier.ts';
import { loadDocIndex } from './docs.ts';
import type { DocIndex } from '../../engine/src/providers/docindex.ts';
import { ANTICIPATOR_SYSTEM } from '../../engine/src/anticipator.ts';

const SAMPLE_RATE = 16000;

/** Browser lookups use open APIs only: Wikipedia and DuckDuckGo's Instant Answer endpoint.
 *  (The search engine's HTML results page challenges requests from an extension.) */
const browserSearch: SearchFn = async (query, kind) => {
  const [wiki, ddg] = await Promise.allSettled([wikiLookup(query, kind === 'lookup' ? 2 : 1), ddgInstant(query, 3)]);
  const out = [] as Awaited<ReturnType<SearchFn>>;
  if (ddg.status === 'fulfilled') out.push(...ddg.value);
  if (wiki.status === 'fulfilled') for (const r of wiki.value) if (!out.some((o) => o.url === r.url)) out.push(r);
  if (!out.length && wiki.status === 'rejected') throw wiki.reason;
  return out;
};
const STT_MODEL = 'onnx-community/moonshine-base-ONNX';

let ctx: AudioContext | null = null;
let stream: MediaStream | null = null;
let fileSource: AudioBufferSourceNode | null = null;
let engine: Engine | null = null;
let ear: Ear | null = null;
let brain: Brain | null = null;
let docs: DocIndex | null = null;
/** The two search switches in the J-me bar. The documents stay loaded either way; the switch decides whether a card searches them. */
let modes = { docs: true, web: true };
function applyModes(): void {
  if (!engine) return;
  (engine.opts as { fetchWeb: boolean; docs?: DocIndex }).fetchWeb = modes.web;
  (engine.opts as { fetchWeb: boolean; docs?: DocIndex }).docs = modes.docs && docs ? docs : undefined;
}
function setModes(m: { docs?: boolean; web?: boolean }): void {
  modes = { docs: m.docs !== false, web: m.web !== false };
  applyModes();
  const have = docs ? `${docs.names().length} files` : 'none chosen';
  status(`searching: ${[modes.docs ? `your documents (${have})` : '', modes.web ? 'the web' : ''].filter(Boolean).join(' + ') || 'nothing, both switches off'}`);
}
async function reloadDocs(): Promise<void> {
  try { docs = await loadDocIndex(); } catch (e) { docs = null; status('documents: ' + errText(e)); }
  applyModes();
  if (docs) status(`documents on hand: ${docs.names().length} files, ${docs.size} paragraphs`);
}
let ticker: ReturnType<typeof setInterval> | null = null;
let started = 0;
const clock = () => (Date.now() - started) / 1000;
configureRuntime(chrome.runtime.getURL('vendor/'));

const tell = (msg: Record<string, unknown>) => chrome.runtime.sendMessage({ target: 'sw', ...msg }).catch(() => {});
const event = (ev: EngineEvent) => { tell({ type: 'event', ev }); toBridge(ev); };
const status = (text: string) => event({ type: 'status', now: engine?.now ?? 0, text });

let brainPicking: Promise<Brain> | null = null;
let earLoading: Promise<void> | null = null;

// DOMException is not an Error in every realm, so read name/message off any object that has them.
const errText = (e: unknown): string => {
  if (e && typeof e === 'object' && 'message' in e) {
    const { name, message } = e as { name?: string; message?: string };
    return name && name !== 'Error' && !String(message).startsWith(name) ? `${name}: ${message}` : String(message);
  }
  return String(e);
};
/** The first frame of a stack, so a thrown TypeError names the line it came from. */
const where = (e: unknown): string => {
  const line = e instanceof Error && e.stack ? (e.stack.split('\n').find((l) => /\bat\b|@/.test(l)) ?? '') : '';
  return line ? ` [${line.trim().slice(0, 160)}]` : '';
};

let prepareChain: Promise<void> = Promise.resolve();

// ---- the bridge: every event to a local agent process, and its commands back ----
// A setting switches it on (the service worker passes the URL; this page has no storage).
let bridgeUrl: string | null = null;
let bridgeQueue: EngineEvent[] = [];
let bridgeTimer: ReturnType<typeof setTimeout> | null = null;
let bridgePolling = false;
let bridgeWarned = false;
function setBridge(url: string | null): void {
  if (url === bridgeUrl) return;
  bridgeUrl = url ? url.replace(/\/+$/, '') : null;
  bridgeWarned = false;
  if (bridgeUrl && !bridgePolling) void pollBridge();
}
function toBridge(ev: EngineEvent): void {
  if (!bridgeUrl) return;
  bridgeQueue.push(ev);
  if (bridgeTimer) return;
  bridgeTimer = setTimeout(async () => {
    bridgeTimer = null;
    const batch = bridgeQueue.splice(0);
    if (!bridgeUrl || !batch.length) return;
    try {
      await fetch(bridgeUrl + '/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ events: batch }) });
      bridgeWarned = false;
    } catch {
      if (!bridgeWarned) { bridgeWarned = true; status(`no agent bridge at ${bridgeUrl} (run: node engine/src/mcp.ts)`); }
    }
  }, 400);
}
async function pollBridge(): Promise<void> {
  bridgePolling = true;
  try {
    while (bridgeUrl) {
      let cmds: { type: string; text?: string; itemId?: string; by?: string }[] = [];
      try {
        const res = await fetch(bridgeUrl + '/commands?wait=25');
        cmds = (await res.json()) as typeof cmds;
      } catch {
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      for (const c of cmds) {
        if (!engine) continue;
        if (c.type === 'ask' && c.text) { engine.ask(c.text, c.by || 'an agent'); }
        else if (c.type === 'pin' && c.itemId) engine.pin(c.itemId);
        else if (c.type === 'unpin' && c.itemId) engine.unpin(c.itemId);
        else if (c.type === 'pause') engine.pause();
        else if (c.type === 'resume') void engine.resume();
      }
    }
  } finally {
    bridgePolling = false;
  }
}

/** Pick the brain, then load the ear to suit it; both stay in memory for the next switch-on.
 *  A request naming a brain order the current brain is not in picks again. Calls are
 *  serialized: two at once must never create two brains in one page. */
function prepare(brainOpts: Partial<BrainOptions>): Promise<void> {
  const next = prepareChain.catch(() => {}).then(() => prepareNow(brainOpts));
  prepareChain = next;
  return next;
}

async function prepareNow(brainOpts: Partial<BrainOptions>): Promise<void> {
  // No explicit order: the stored preference (chrome.storage.local.brainOrder), else the default.
  // The service worker passes the preference with every message; an offscreen document has no
  // chrome.storage in branded Chrome (only runtime messaging), so this read is best effort.
  if (!brainOpts.order) {
    try {
      const stored = (await chrome.storage?.local?.get('brainOrder'))?.brainOrder as unknown;
      if (Array.isArray(stored) && stored.length) brainOpts = { ...brainOpts, order: stored as BrainOptions['order'] };
    } catch {}
  }
  const wanted = brainOpts.order;
  if (brainPicking && wanted) {
    const current = await brainPicking.catch(() => null);
    if (current && !wanted.includes(current.kind)) { brainPicking = null; brain = null; }
  }
  if (!brainPicking) {
    status('choosing a brain');
    brainPicking = pickBrain({ ...brainOpts, onStatus: status }).catch((e) => { brainPicking = null; throw e; });
  }
  brain = await brainPicking;
  // WebLLM and the ORT WebGPU session cannot share the adapter; speech goes to wasm then.
  await loadEar(brain.kind === 'webllm' ? 'wasm' : 'auto');
}

async function loadEar(prefer: 'auto' | 'wasm'): Promise<void> {
  if (!ear) {
    ear = new Ear({
      vendorUrl: chrome.runtime.getURL('vendor/'),
      sttModel: STT_MODEL,
      sampleRate: SAMPLE_RATE,
      clock,
      onSegment: (seg) => void engine?.addSegment(seg),
      onStatus: status,
    });
  }
  if (!earLoading) earLoading = ear.load(prefer).catch((e) => { earLoading = null; throw e; });
  await earLoading;
  if ((ear.device === 'webgpu') !== (prefer === 'auto' && !!(navigator as unknown as { gpu?: unknown }).gpu)) {
    earLoading = ear.load(prefer).catch((e) => { earLoading = null; throw e; });
    await earLoading;
  }
}

interface StartMessage {
  streamId?: string;
  /** the microphone: a call in another app, or the room */
  mic?: boolean;
  title?: string;
  /** what the page says it is, read in the tab by the service worker */
  page?: { title?: string; author?: string; description?: string; url?: string };
  /** the agent bridge URL when the setting is on */
  bridge?: string | null;
  /** the search switches: your documents, the web */
  modes?: { docs?: boolean; web?: boolean };
  /** test path: a URL of a wav or mp3 to play through the ear instead of a tab */
  file?: string;
  brain?: Partial<BrainOptions>;
}

async function start(m: StartMessage): Promise<void> {
  await stop();
  if ('bridge' in m) setBridge(m.bridge ?? null);
  if (m.modes) modes = { docs: m.modes.docs !== false, web: m.modes.web !== false };
  started = Date.now();
  // Take the tab's audio FIRST: a stream id from chrome.tabCapture is single use and expires
  // within seconds, and the first click may spend minutes downloading models. Playing the stream
  // back right away also keeps the tab audible (capturing mutes it otherwise).
  ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  void ctx.resume().catch(() => {});
  let src: AudioNode;
  let playback = true;
  if (m.streamId) {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: m.streamId } } as unknown as MediaTrackConstraints,
      video: false,
    });
    src = ctx.createMediaStreamSource(stream);
    const track = stream.getAudioTracks()[0];
    if (track) track.onended = () => {
      status('the tab stopped sharing audio');
      void stop();
      tell({ type: 'stopped' });
    };
  } else if (m.mic) {
    // Echo cancellation off on purpose: the far end of a call comes through the speakers, and the
    // ear should hear both sides. Permission is granted once on the settings page (an offscreen
    // document cannot ask).
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: true },
        video: false,
      });
    } catch (e) {
      const name = e && typeof e === 'object' && 'name' in e ? String((e as { name: string }).name) : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') throw new Error('microphone not allowed: open the J-me settings page and allow it once');
      throw e;
    }
    src = ctx.createMediaStreamSource(stream);
    playback = false; // the room must not hear itself
    const track = stream.getAudioTracks()[0];
    if (track) track.onended = () => {
      status('the microphone stopped');
      void stop();
      tell({ type: 'stopped' });
    };
  } else if (m.file) {
    const buf = await ctx.decodeAudioData(await (await fetch(m.file)).arrayBuffer());
    fileSource = ctx.createBufferSource();
    fileSource.buffer = buf;
    fileSource.onended = () => {
      ear?.flush();
      status('file finished');
    };
    src = fileSource;
  } else {
    throw new Error('nothing to listen to');
  }
  if (playback) src.connect(ctx.destination);
  const mode = m.mic ? 'room' : 'media';
  const p = m.page ?? {};
  const title = p.title || m.title || '';
  const context = [title ? `Title: ${title}` : '', p.author ? `By: ${p.author}` : '', p.description ? `Description: ${p.description}` : '', p.url ? `URL: ${p.url}` : '']
    .filter(Boolean).join('\n');
  await reloadDocs();
  engine = new Engine({ mode, fetchWeb: modes.web, answerPrompts: true, search: browserSearch, ...(context ? { context } : {}), ...(modes.docs && docs ? { docs } : {}) });
  engine.on(event);
  event({ type: 'hello', mode, sessionId: new Date().toISOString(), now: 0, ...(title ? { title } : {}) });
  await prepare(m.brain ?? {});
  if (!engine) return; // stopped while loading
  engine.anticipator.opts.chat = brain!.chat;
  // Only a fast brain answers prompts itself; the others leave it to the "Ask your AI" button.
  (engine.opts as { answerPrompts: boolean }).answerPrompts = brain!.kind === 'ollama';
  if (ear) ear.flush();
  await ctx.audioWorklet.addModule('worklet.js');
  const node = new AudioWorkletNode(ctx, 'pcm-forwarder');
  node.port.onmessage = (e: MessageEvent<Float32Array>) => ear?.push(e.data);
  src.connect(node);
  if (fileSource) fileSource.start();
  ticker = setInterval(() => engine?.tick(clock()), 1000);
  status(`listening · ear on ${ear!.device} · brain: ${brain!.name}`);
}

async function stop(): Promise<void> {
  if (ticker) clearInterval(ticker);
  ticker = null;
  ear?.flush();
  if (fileSource) {
    try { fileSource.stop(); } catch {}
    fileSource = null;
  }
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  if (ctx) await ctx.close().catch(() => {});
  ctx = null;
  if (engine) { engine.reset(); event({ type: 'off', now: engine.now }); }
  engine = null;
}

interface Command { type: string; id?: string; text?: string; frontier?: FrontierSettings }

/** Answer one card with the user's frontier model. The settings travel with the request (the
 *  panel reads them from storage; this page has no storage of its own in branded Chrome). */
async function answerHere(id: string, f: FrontierSettings | undefined): Promise<void> {
  if (!engine) return;
  const it = engine.queue.snapshot().find((i) => i.id === id);
  if (!it) return;
  if (!f || (!f.key && f.provider !== 'custom')) { engine.setAnswer(id, 'No key yet: open J-me settings and add your API key under "Answer inside J-me".', 'frontier'); return; }
  engine.setAnswer(id, '…', 'frontier');
  try {
    const question = it.kind === 'prompt' ? it.text : `${it.text}\n\nWhat should I know about this?`;
    const fromDocs = (it.results ?? []).filter((r) => r.source === 'docs').slice(0, 3).map((r) => `- ${r.title}: ${(r.snippet || '').slice(0, 240)}`);
    const asked = fromDocs.length ? `${question}\n\nFrom my own documents (use them when they answer it, and say which):\n${fromDocs.join('\n')}` : question;
    const text = await frontierAnswer(f, asked, (it.anchor?.text ?? '').replace(/\s+/g, ' ').slice(0, 300));
    engine.setAnswer(id, text || '(no answer)', 'frontier');
  } catch (e) {
    engine.setAnswer(id, 'could not answer: ' + errText(e), 'frontier');
  }
}

function command(msg: Command): void {
  if (!engine) return;
  if (msg.type === 'pin' && msg.id) engine.pin(msg.id);
  else if (msg.type === 'unpin' && msg.id) engine.unpin(msg.id);
  else if (msg.type === 'pull' && msg.id) {
    const it = engine.pull(msg.id);
    if (it) event({ type: 'item', now: engine.now, item: it, change: 'pulled' });
  } else if (msg.type === 'ask' && msg.text) engine.ask(msg.text);
  else if (msg.type === 'answer' && msg.id) void answerHere(msg.id, msg.frontier);
  else if (msg.type === 'pause') engine.pause();
  else if (msg.type === 'resume') void engine.resume();
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (!msg || msg.target !== 'offscreen') return;
  if (msg.type === 'start') start(msg as StartMessage).then(() => reply({ ok: true }), (e: unknown) => { console.error('J-me could not start', e); status('could not start: ' + errText(e)); reply({ ok: false, error: errText(e) + where(e) }); });
  else if (msg.type === 'stop') stop().then(() => reply({ ok: true }));
  else if (msg.type === 'prepare') prepare((msg as { brain?: Partial<BrainOptions> }).brain ?? {}).then(() => reply({ ok: true, ear: ear?.device, brain: brain?.name }), (e: unknown) => reply({ ok: false, error: errText(e) }));
  else if (msg.type === 'ws') { command(msg.msg as Command); reply({ ok: true }); }
  else if (msg.type === 'bridge') { setBridge((msg as { url?: string | null }).url ?? null); reply({ ok: true }); }
  else if (msg.type === 'docs') reloadDocs().then(() => reply({ ok: true, files: docs?.names().length ?? 0 }));
  else if (msg.type === 'modes') { setModes(msg as { docs?: boolean; web?: boolean }); reply({ ok: true }); }
  else if (msg.type === 'chat') (async () => {
    try {
      const m = msg as { messages?: { role: 'system' | 'user'; content: string }[]; opts?: Record<string, unknown>; text?: string };
      const messages = (m.messages ?? [{ role: 'user', content: String(m.text) }]).map((x) => ({ ...x, content: x.content === '$SYSTEM' ? ANTICIPATOR_SYSTEM : x.content }));
      reply({ ok: true, text: await brain!.chat(messages, { maxTokens: 60, ...(m.opts ?? {}) }) });
    } catch (e) { reply({ ok: false, error: errText(e) }); }
  })();
  else if (msg.type === 'drain') (async () => { await ear?.drain(); await engine?.drain(); reply({ ok: true, items: engine?.queue.snapshot() ?? [], history: engine?.queue.history ?? [], segments: engine?.transcript.segments ?? [] }); })();
  else reply({ ok: false });
  return true;
});

// For a developer opening offscreen.html as a tab: the same functions, by hand from the console.
(globalThis as unknown as { __jme: unknown }).__jme = { prepare, start, stop, pipeline, pickBrain, loadEar, get engine() { return engine; }, get ear() { return ear; }, get brain() { return brain; } };
