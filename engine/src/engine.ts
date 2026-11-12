import type { DecayParams, EngineEvent, ImageResult, ItemKind, Mode, QueueItem, SearchResult, TranscriptSegment, VideoResult } from './types.ts';
import { DEFAULT_DECAY } from './types.ts';
import { Transcript } from './transcript.ts';
import { Queue } from './queue.ts';
import { Anticipator, answerPrompt, DEFAULT_ANTICIPATOR, type AnticipatorOptions } from './anticipator.ts';
import { webSearch } from './providers/web.ts';
import { wikiLookup } from './providers/wiki.ts';
import { commonsImages } from './providers/images.ts';
import { youtubeSearch } from './providers/video.ts';
import type { LocalDocs } from './providers/localdocs.ts';

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
  docs?: LocalDocs;
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
    if (this.now - this.lastAnticipate >= this.opts.anticipateEvery && !this.anticipating) {
      this.lastAnticipate = this.now;
      this.anticipating = this.anticipate().finally(() => (this.anticipating = null));
      return this.anticipating;
    }
    return null;
  }

  /** Advance the clock and rescore. */
  tick(now: number): void {
    this.now = Math.max(this.now, now);
    this.queue.tick(this.now, this.transcript.windowTerms(this.now, this.opts.windowSec), (t) => this.transcript.termsSince(t));
    this.emit({ type: 'queue', now: this.now, items: this.queue.snapshot() });
  }

  async anticipate(): Promise<void> {
    const at = this.now;
    const window = this.transcript.window(at, this.opts.windowSec);
    const text = this.transcript.windowText(at, this.opts.windowSec);
    const queued = this.queue.snapshot().map((i) => i.text);
    const t0 = Date.now();
    try {
      const cands = await this.anticipator.propose(text, queued, this.opts.mode, this.opts.context);
      this.stats.anticipatorCalls++;
      this.stats.anticipatorMs += Date.now() - t0;
      this.stats.candidates += cands.length;
      this.status(`thought of ${cands.length} idea${cands.length === 1 ? '' : 's'} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      // Anchor on the last ~20 s: that is the moment that earned the items.
      const anchor = window.filter((s) => s.t1 >= at - 20);
      this.queue.admit(cands, anchor.length ? anchor : window, at);
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
  ask(text: string): QueueItem | undefined {
    const [item] = this.queue.admit([{ kind: 'prompt', text, why: 'asked by the operator', confidence: 1 }], this.transcript.window(this.now, 20), this.now);
    if (item) {
      this.queue.pin(item.id, this.now);
      this.stage(item);
    }
    return item;
  }

  pin(id: string): void {
    this.queue.pin(id, this.now);
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
