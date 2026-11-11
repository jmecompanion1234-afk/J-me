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
let ticker: ReturnType<typeof setInterval> | null = null;
let started = 0;
const clock = () => (Date.now() - started) / 1000;
configureRuntime(chrome.runtime.getURL('vendor/'));

const tell = (msg: Record<string, unknown>) => chrome.runtime.sendMessage({ target: 'sw', ...msg }).catch(() => {});
const event = (ev: EngineEvent) => tell({ type: 'event', ev });
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
  /** test path: a URL of a wav or mp3 to play through the ear instead of a tab */
  file?: string;
  brain?: Partial<BrainOptions>;
}

async function start(m: StartMessage): Promise<void> {
  await stop();
  started = Date.now();
  // Take the tab's audio FIRST: a stream id from chrome.tabCapture is single use and expires
  // within seconds, and the first click may spend minutes downloading models. Playing the stream
  // back right away also keeps the tab audible (capturing mutes it otherwise).
  ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  void ctx.resume().catch(() => {});
  let src: AudioNode;
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
  src.connect(ctx.destination);
  engine = new Engine({ mode: 'media', fetchWeb: true, answerPrompts: true, search: browserSearch });
  engine.on(event);
  event({ type: 'hello', mode: 'media', sessionId: new Date().toISOString(), now: 0 });
  await prepare(m.brain ?? {});
  if (!engine) return; // stopped while loading
  engine.anticipator.opts.chat = brain!.chat;
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
  if (engine) engine.reset();
  engine = null;
}

interface Command { type: string; id?: string; text?: string }

function command(msg: Command): void {
  if (!engine) return;
  if (msg.type === 'pin' && msg.id) engine.pin(msg.id);
  else if (msg.type === 'pull' && msg.id) {
    const it = engine.pull(msg.id);
    if (it) event({ type: 'item', now: engine.now, item: it, change: 'pulled' });
  } else if (msg.type === 'ask' && msg.text) engine.ask(msg.text);
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (!msg || msg.target !== 'offscreen') return;
  if (msg.type === 'start') start(msg as StartMessage).then(() => reply({ ok: true }), (e: unknown) => { console.error('J-me could not start', e); status('could not start: ' + errText(e)); reply({ ok: false, error: errText(e) + where(e) }); });
  else if (msg.type === 'stop') stop().then(() => reply({ ok: true }));
  else if (msg.type === 'prepare') prepare((msg as { brain?: Partial<BrainOptions> }).brain ?? {}).then(() => reply({ ok: true, ear: ear?.device, brain: brain?.name }), (e: unknown) => reply({ ok: false, error: errText(e) }));
  else if (msg.type === 'ws') { command(msg.msg as Command); reply({ ok: true }); }
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
