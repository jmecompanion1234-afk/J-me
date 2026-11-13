import type { DecayParams, EngineEvent, ImageResult, ItemKind, Mode, QueueItem, SearchResult, TranscriptSegment, VideoResult } from './types.ts';
import { DEFAULT_DECAY } from './types.ts';
import { Transcript } from './transcript.ts';
import { Queue } from './queue.ts';
import { Anticipator, answerPrompt, DEFAULT_ANTICIPATOR, type AnticipatorOptions } from './anticipator.ts';
import { webSearch } from './providers/web.ts';
import { wikiLookup } from './providers/wiki.ts';
import { commonsImages } from './providers/images.ts';
import { youtubeSearch } from './providers/video.ts';
import { findNumberIssues, hasFigure } from './numbers.ts';
import type { DocSearch } from './providers/docindex.ts';

export interface EngineOptions {
  mode: Mode;
  decay?: Partial<DecayParams>;
  anticipator?: Partial<AnticipatorOptions>;
  /** seconds of transcript the anticipator sees */
  windowSec: number;
  /** seconds of transcript time between anticipator calls */
  anticipateEvery: number;
  /** spend web calls on staged items (off in a dry backtest) */
  fetchWeb: boolean;
  /** answer prompt items with the local model when staged */
  answerPrompts: boolean;
  /** the person's own documents; searched first for every card */
  docs?: DocSearch;
  /** the web lookup for a staged item; default: Wikipedia card for lookups plus a DuckDuckGo search */
  search?: SearchFn;
  /** pictures for the image strip, fetched with the results (off in a dry backtest) */
  fetchImages: boolean;
  /** the image lookup; default: Wikimedia Commons */
  images?: ImageFn;
  /** videos for the video strip, fetched with the results (off in a dry backtest) */
  fetchVideos: boolean;
  /** the video lookup; default: YouTube's results page */
  videos?: VideoFn;
  /** what is playing, for the brain: the page's title, author and description */
  context?: string;
}

export type SearchFn = (query: string, kind: ItemKind) => Promise<SearchResult[]>;
export type ImageFn = (query: string, kind: ItemKind) => Promise<ImageResult[]>;
export const defaultImages: ImageFn = (query) => commonsImages(query, 4);
export type VideoFn = (query: string, kind: ItemKind) => Promise<VideoResult[]>;
export const defaultVideos: VideoFn = (query, kind) => youtubeSearch(query, kind === 'media' ? 6 : 3);

/** The Node default. A named thing gets its Wikipedia card first; everything gets the web.
 *  Either may fail (offline, a search engine challenge): the other still answers. */
export const defaultSearch: SearchFn = async (query, kind) => {
  const [wiki, web] = await Promise.allSettled([
    kind === 'lookup' ? wikiLookup(query, 2) : Promise.resolve([] as SearchResult[]),
    webSearch(query, 5),
  ]);
  const out: SearchResult[] = [];
  if (wiki.status === 'fulfilled') out.push(...wiki.value);
  if (web.status === 'fulfilled') out.push(...web.value);
  if (!out.length && kind !== 'lookup') out.push(...(await wikiLookup(query, 1).catch(() => [] as SearchResult[])));
  if (!out.length && web.status === 'rejected') throw web.reason;
  return out;
};

export const DEFAULT_ENGINE: EngineOptions = {
  mode: 'room',
  windowSec: 60,
  anticipateEvery: 15,
  fetchWeb: true,
  answerPrompts: true,
  fetchImages: true,
  fetchVideos: true,
};

/**
 * The core loop, independent of where transcript segments come from and of how time passes.
 * Live mode feeds wall-clock segments and ticks once a second; backtest feeds a file and
 * advances the clock itself.
 */
export class Engine {
  readonly opts: EngineOptions;
  readonly transcript = new Transcript();
  readonly queue: Queue;
  readonly anticipator: Anticipator;
  now = 0;
  private listeners: ((ev: EngineEvent) => void)[] = [];
  private lastAnticipate = -Infinity;
  private anticipating: Promise<void> | null = null;
  private pendingFetches = new Set<Promise<void>>();
  /** when the queue was paused (the transcript keeps flowing), or null */
  pausedAt: number | null = null;
  stats = { anticipatorCalls: 0, anticipatorMs: 0, candidates: 0, fetches: 0 };

  constructor(opts: Partial<EngineOptions> = {}) {
    this.opts = { ...DEFAULT_ENGINE, ...opts };
    this.queue = new Queue({ ...DEFAULT_DECAY[this.opts.mode], ...(this.opts.decay ?? {}) });
    this.anticipator = new Anticipator({ ...DEFAULT_ANTICIPATOR, ...(this.opts.anticipator ?? {}) });
    this.queue.on((ev) => this.emit(ev));
    this.queue.onStage = (item) => this.stage(item);
  }

  on(l: (ev: EngineEvent) => void): void {
    this.listeners.push(l);
  }

  private emit(ev: EngineEvent): void {
    for (const l of this.listeners) l(ev);
  }

  status(text: string): void {
    this.emit({ type: 'status', now: this.now, text });
  }

  /** A fresh listen: everything live goes to history, the transcript empties, the queue shows empty. */
  reset(): void {
    this.queue.close(this.now);
    this.transcript.segments.length = 0;
    this.lastAnticipate = -Infinity;
    this.emit({ type: 'queue', now: this.now, items: [] });
  }

  /** Feed one transcript segment. Returns the anticipator promise if one was started. */
  addSegment(seg: TranscriptSegment): Promise<void> | null {
    this.transcript.add(seg);
    this.now = Math.max(this.now, seg.t1);
    this.emit({ type: 'segment', segment: seg });
    this.checkNumbers(seg);
    if (this.pausedAt === null && this.now - this.lastAnticipate >= this.opts.anticipateEvery && !this.anticipating) {
      this.lastAnticipate = this.now;
      this.anticipating = this.anticipate().finally(() => (this.anticipating = null));
      return this.anticipating;
    }
    return null;
  }

  /** Advance the clock and rescore. Held still while paused: the transcript still arrives. */
  tick(now: number): void {
    this.now = Math.max(this.now, now);
    if (this.pausedAt !== null) return;
    this.queue.tick(this.now, this.transcript.windowTerms(this.now, this.opts.windowSec), (t) => this.transcript.termsSince(t));
    this.emit({ type: 'queue', now: this.now, items: this.queue.snapshot() });
  }

  /** Hold the queue (no decay, no new cards) while the transcript keeps flowing, so the cards
   *  can be read and dug into. */
  pause(): void {
    if (this.pausedAt !== null) return;
    this.pausedAt = this.now;
    this.emit({ type: 'paused', now: this.now, paused: true });
    this.status('paused: the cards hold still, the transcript keeps going');
  }

  /** Let it run again, and catch up: the brain reads what was said during the pause. */
  resume(): Promise<void> | null {
    if (this.pausedAt === null) return null;
    const held = Math.max(0, this.now - this.pausedAt);
    this.pausedAt = null;
    this.queue.shift(held);
    this.emit({ type: 'paused', now: this.now, paused: false });
    this.emit({ type: 'queue', now: this.now, items: this.queue.snapshot() });
    if (held < 10) return null;
    this.status(`catching up on ${Math.round(held)} s`);
    this.lastAnticipate = this.now;
    // Everything said during the pause (capped), and room for more items than a normal pass.
    this.anticipating = this.anticipate(Math.min(held + 10, 600), Math.min(8, this.anticipator.opts.maxItems + 3)).finally(() => (this.anticipating = null));
    return this.anticipating;
  }

  /** The calculator: a segment whose own numbers contradict each other becomes a card at once,
   *  no model involved. The last two segments are checked together (a sentence can span a cut). */
  private lastChecked = '';
  private checkNumbers(seg: TranscriptSegment): void {
    const prev = this.transcript.segments[this.transcript.segments.length - 2];
    const texts = [seg.text, prev ? `${prev.text} ${seg.text}` : ''].filter(Boolean);
    for (const text of texts) {
      for (const issue of findNumberIssues(text)) {
        const key = issue.calc;
        if (this.lastChecked === key) continue;
        this.lastChecked = key;
        const [item] = this.queue.admit([{ kind: 'math', text: `Do the numbers add up? ${issue.claim.slice(0, 140)}`, why: 'the calculator', confidence: 1 }], [prev, seg].filter((x): x is TranscriptSegment => !!x), this.now);
        if (item) {
          item.answer = issue.calc;
          item.sources = ['calculator'];
          this.queue.pin(item.id, this.now); // a flag stays up until the person takes it down
          this.status('⚠ the numbers do not add up');
        }
      }
    }
  }

  async anticipate(windowSec = this.opts.windowSec, maxItems?: number): Promise<void> {
    const at = this.now;
    const window = this.transcript.window(at, windowSec);
    const text = this.transcript.windowText(at, windowSec);
    const queued = this.queue.snapshot().map((i) => i.text);
    const t0 = Date.now();
    try {
      const names = this.opts.docs?.ready ? this.opts.docs.names() : [];
      const context = [this.opts.context ?? '', names.length ? `Documents on hand (the person's own files; when the talk touches what one likely contains, propose a lookup in its terms): ${names.slice(0, 30).join(', ')}${names.length > 30 ? ` and ${names.length - 30} more` : ''}` : ''].filter(Boolean).join('\n');
      const cands = await this.anticipator.propose(text, queued, this.opts.mode, context || undefined, maxItems);
      this.stats.anticipatorCalls++;
      this.stats.anticipatorMs += Date.now() - t0;
      this.stats.candidates += cands.length;
      this.status(`thought of ${cands.length} idea${cands.length === 1 ? '' : 's'} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      // Anchor on the last ~20 s: that is the moment that earned the items.
      const anchor = window.filter((s) => s.t1 >= at - 20);
      // A spoken figure is a priority: it stages without waiting for a recurrence.
      for (const c of cands) if (c.kind !== 'prompt' && hasFigure(c.text)) c.confidence = Math.max(c.confidence, 0.85);
      // A file name is not a card: small brains echo the "documents on hand" list.
      const lowerNames = new Set(names.map((n) => n.toLowerCase()));
      const kept = cands.filter((c) => !lowerNames.has(c.text.toLowerCase()) && !/[\/].*\.\w{2,5}$|\.(md|txt|html?|json|csv|markdown)$/i.test(c.text));
      this.queue.admit(kept, anchor.length ? anchor : window, at);
    } catch (e) {
      this.emit({ type: 'error', now: at, text: `anticipator: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  /** Spend the network/LLM call for an item that crossed the staging threshold. */
  private stage(item: QueueItem): void {
    const p = (async () => {
      const results: SearchResult[] = [];
      const sources: string[] = [];
      try {
        if (this.opts.docs?.ready) {
          const r = this.opts.docs.search(item.text, 3);
          if (r.length) {
            results.push(...r);
            sources.push('docs');
          }
        }
        // A prompt is answered by the local brain (when allowed) AND searched, so the card has
        // links even where the brain is slow; the "ask your AI" button needs nothing fetched.
        const jobs: Promise<void>[] = [];
        if (item.kind === 'math') {
          // The calculator already answered; nothing to fetch.
          item.results = [];
          item.images = [];
          item.videos = [];
          item.sources = ['calculator'];
          this.queue.markReady(item.id, this.now);
          return;
        }
        if (item.kind === 'prompt' && this.opts.answerPrompts) {
          jobs.push((async () => {
            item.answer = await answerPrompt(this.anticipator.opts, item.text, this.transcript.windowText(this.now, 180));
            sources.push('local-llm');
          })());
        }
        if (this.opts.fetchWeb) {
          this.stats.fetches++;
          jobs.push((async () => {
            const found = await (this.opts.search ?? defaultSearch)(item.text, item.kind);
            results.push(...found);
            for (const r of found) if (!sources.includes(r.source)) sources.push(r.source);
          })());
        }
        const images: ImageResult[] = [];
        if (this.opts.fetchImages && this.opts.fetchWeb && item.kind !== 'prompt') {
          jobs.push((this.opts.images ?? defaultImages)(item.text, item.kind).then((found) => { images.push(...found); }, () => {}));
        }
        const videos: VideoResult[] = [];
        if (this.opts.fetchVideos && this.opts.fetchWeb && item.kind !== 'prompt') {
          jobs.push((this.opts.videos ?? defaultVideos)(item.text, item.kind).then((found) => { videos.push(...found); }, () => {}));
        }
        const settled = await Promise.allSettled(jobs);
        // The Wikipedia card's own picture leads the strip when there is one.
        for (const r of results) if (r.image && !images.some((i) => i.url === r.image!.url)) images.unshift({ title: r.title, thumb: r.image.thumb, url: r.image.url, page: r.url, source: r.source });
        item.results = results;
        item.images = images;
        item.videos = videos;
        if (videos.length && !sources.includes('youtube')) sources.push('youtube');
        item.sources = sources;
        const failed = settled.find((x): x is PromiseRejectedResult => x.status === 'rejected');
        if (failed && !results.length && !item.answer && !videos.length) throw failed.reason;
      } catch (e) {
        this.emit({ type: 'error', now: this.now, text: `stage "${item.text}": ${e instanceof Error ? e.message : String(e)}` });
        item.results = results;
        item.sources = sources;
      }
      this.queue.markReady(item.id, this.now);
    })();
    this.pendingFetches.add(p);
    p.finally(() => this.pendingFetches.delete(p));
  }

  /** A typed or spoken question from the operator: jumps the queue, pinned. */
  ask(text: string, by = 'the operator'): QueueItem | undefined {
    const [item] = this.queue.admit([{ kind: 'prompt', text, why: `asked by ${by}`, confidence: 1 }], this.transcript.window(this.now, 20), this.now);
    if (item) {
      this.queue.pin(item.id, this.now);
      this.stage(item);
    }
    return item;
  }

  pin(id: string): void {
    this.queue.pin(id, this.now);
  }

  unpin(id: string): void {
    this.queue.unpin(id, this.now);
  }

  /** An answer produced outside the stage path (a frontier model, on request). */
  setAnswer(id: string, answer: string, source: string): void {
    const it = this.queue.snapshot().find((i) => i.id === id);
    if (!it) return;
    it.answer = answer;
    it.sources = [...(it.sources ?? []).filter((s) => s !== source), source];
    this.emit({ type: 'item', now: this.now, item: it, change: 'ready' });
    this.emit({ type: 'queue', now: this.now, items: this.queue.snapshot() });
  }

  pull(id: string): QueueItem | undefined {
    return this.queue.pull(id, this.now);
  }

  /** Wait for in-flight anticipator and fetches (backtest end). */
  async drain(): Promise<void> {
    if (this.anticipating) await this.anticipating;
    await Promise.all([...this.pendingFetches]);
  }
}
