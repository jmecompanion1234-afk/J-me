// Shared types for the J-me engine. Times are seconds on the session clock:
// wall-clock seconds since session start in live mode, transcript seconds in replay.

export type Mode = 'room' | 'media';

export interface TranscriptSegment {
  /** start time, seconds on the session clock */
  t0: number;
  /** end time, seconds on the session clock */
  t1: number;
  text: string;
  /** optional speaker label from the transcript file */
  speaker?: string;
}

export type ItemKind = 'search' | 'prompt' | 'lookup' | 'media';

export type ItemState = 'candidate' | 'staged' | 'ready' | 'pinned' | 'pulled' | 'expired';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  /** which provider produced it: 'web' or 'docs' */
  source: string;
  /** a picture that goes with it (Wikipedia lead image), when the provider has one */
  image?: { thumb: string; url: string };
}

/** A video for the video strip: a YouTube id, its thumbnail and page. */
export interface VideoResult {
  id: string;
  title: string;
  url: string;
  thumb: string;
  channel: string;
  duration: string;
  source: string;
}

/** A picture for the image strip: a thumbnail, the full file, and the page that credits it. */
export interface ImageResult {
  title: string;
  thumb: string;
  url: string;
  page: string;
  source: string;
}

export interface QueueItem {
  id: string;
  kind: ItemKind;
  text: string;
  why: string;
  /** the transcript moment that spawned it */
  anchor: { t0: number; t1: number; text: string; terms: string[] };
  /** anticipator confidence 0..1 */
  confidence: number;
  score: number;
  state: ItemState;
  /** last time the item itself was mentioned again in the transcript */
  touched: number;
  /** how many times the speakers came back to it after it was born */
  recurrences: number;
  born: number;
  /** when it left the live queue, if it has */
  died?: number;
  peak: number;
  results?: SearchResult[];
  /** pictures for the strip, fetched with the results */
  images?: ImageResult[];
  /** videos for the strip, fetched with the results */
  videos?: VideoResult[];
  /** prompt answers and summaries land here */
  answer?: string;
  /** which providers answered */
  sources?: string[];
}

export interface Candidate {
  kind: ItemKind;
  text: string;
  why: string;
  confidence: number;
}

export interface DecayParams {
  /** seconds; time constant of the recency term */
  tau: number;
  wRecency: number;
  wTopical: number;
  /** score an item must hold to be staged (a fetch is spent) */
  stageAt: number;
  /** anticipator confidence at or above which an item may stage at birth;
   *  below it, the item must recur in the transcript first */
  stageConf: number;
  /** score below which the item expires */
  floorAt: number;
  /** max items in the live queue */
  cap: number;
}

export const DEFAULT_DECAY: Record<Mode, DecayParams> = {
  room: { tau: 90, wRecency: 0.6, wTopical: 0.4, stageAt: 0.5, stageConf: 0.8, floorAt: 0.2, cap: 12 },
  media: { tau: 240, wRecency: 0.6, wTopical: 0.4, stageAt: 0.5, stageConf: 0.8, floorAt: 0.2, cap: 12 },
};

/** Events the engine emits to UIs and to the session log. */
export type EngineEvent =
  | { type: 'hello'; mode: Mode; sessionId: string; now: number; title?: string }
  | { type: 'segment'; segment: TranscriptSegment }
  | { type: 'queue'; now: number; items: QueueItem[] }
  | { type: 'item'; now: number; item: QueueItem; change: 'born' | 'staged' | 'ready' | 'expired' | 'pinned' | 'pulled' | 'touched' }
  | { type: 'status'; now: number; text: string }
  | { type: 'error'; now: number; text: string };
