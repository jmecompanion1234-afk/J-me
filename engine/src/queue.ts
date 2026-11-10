import type { Candidate, DecayParams, EngineEvent, QueueItem, TranscriptSegment } from './types.ts';
import { hashId, normalizeQuery, overlap, uniqueTerms } from './text.ts';

export type QueueListener = (ev: EngineEvent) => void;

/**
 * The live queue: a priority list of anticipated items whose score decays with time and
 * recovers when the conversation returns to the topic. See SPEC.md section 5.
 */
export class Queue {
  readonly live = new Map<string, QueueItem>();
  readonly history: QueueItem[] = [];
  private listeners: QueueListener[] = [];
  /** fires when an item crosses the staging threshold; the caller fetches */
  onStage: ((item: QueueItem) => void) | null = null;
  params: DecayParams;

  constructor(params: DecayParams) {
    this.params = params;
  }

  on(l: QueueListener): void {
    this.listeners.push(l);
  }

  private emit(ev: EngineEvent): void {
    for (const l of this.listeners) l(ev);
  }

  /** Add anticipator output anchored at the transcript moment that produced it. */
  admit(cands: Candidate[], anchor: TranscriptSegment[], now: number): QueueItem[] {
    const anchorText = anchor.map((s) => s.text).join(' ');
    const anchorTerms = uniqueTerms(anchorText);
    const t0 = anchor.length ? anchor[0].t0 : now;
    const t1 = anchor.length ? anchor[anchor.length - 1].t1 : now;
    const born: QueueItem[] = [];
    for (const c of cands) {
      const norm = normalizeQuery(c.text);
      if (norm.length < 3) continue;
      const id = hashId(`${c.kind}:${norm}`);
      const existing = this.live.get(id) ?? this.nearDuplicate(norm);
      if (existing) {
        // Two near-duplicates in the same call are one item, not a recurrence.
        if (born.includes(existing)) continue;
        // The anticipator proposed it again from later speech: that is a recurrence.
        existing.touched = now;
        existing.recurrences++;
        existing.confidence = Math.max(existing.confidence, c.confidence);
        existing.anchor.terms = [...new Set([...existing.anchor.terms, ...anchorTerms])];
        this.emit({ type: 'item', now, item: existing, change: 'touched' });
        continue;
      }
      const item: QueueItem = {
        id,
        kind: c.kind,
        text: c.text.trim(),
        why: c.why.trim(),
        anchor: { t0, t1, text: anchorText.slice(0, 400), terms: anchorTerms },
        confidence: Math.max(0, Math.min(1, c.confidence)),
        score: 0,
        state: 'candidate',
        touched: now,
        recurrences: 0,
        born: now,
        peak: 0,
      };
      this.live.set(id, item);
      born.push(item);
      this.emit({ type: 'item', now, item, change: 'born' });
    }
    return born;
  }

  private nearDuplicate(norm: string): QueueItem | undefined {
    const qt = uniqueTerms(norm);
    for (const it of this.live.values()) {
      if (overlap(qt, uniqueTerms(it.text)) >= 0.8) return it;
    }
    return undefined;
  }

  /**
   * One scoring tick. `windowTerms` are the terms of the recent transcript window (drives the
   * topical term); `termsSince(t)` gives the terms spoken after `t` (drives recurrence, so the
   * speech that spawned an item can never count as the room coming back to it).
   */
  tick(now: number, windowTerms: string[], termsSince: (t: number) => string[]): void {
    const p = this.params;
    for (const it of this.live.values()) {
      if (it.state === 'pinned') {
        it.score = 1;
        continue;
      }
      const topical = overlap(it.anchor.terms, windowTerms);
      // The item itself named again in speech after its last touch: a recurrence.
      if (now - it.touched > 5) {
        const later = termsSince(it.touched + 2);
        if (later.length && overlap(uniqueTerms(it.text), later) >= 0.5) {
          it.touched = now;
          it.recurrences++;
          this.emit({ type: 'item', now, item: it, change: 'touched' });
        }
      }
      const recency = Math.exp(-(now - it.touched) / p.tau);
      // Confidence scales the whole score: a weak guess starts lower and leaves sooner.
      const weight = 0.5 + 0.5 * it.confidence;
      it.score = Math.max(0, Math.min(1, (p.wRecency * recency + p.wTopical * topical) * weight));
      it.peak = Math.max(it.peak, it.score);
    }
    // Stage what earned a fetch: a confident guess, or any guess the room came back to.
    for (const it of this.live.values()) {
      if (it.state === 'candidate' && it.score >= p.stageAt && (it.confidence >= p.stageConf || it.recurrences > 0)) {
        it.state = 'staged';
        this.emit({ type: 'item', now, item: it, change: 'staged' });
        this.onStage?.(it);
      }
    }
    // Expire by floor, then by cap.
    const sorted = [...this.live.values()].sort((a, b) => b.score - a.score);
    for (let i = 0; i < sorted.length; i++) {
      const it = sorted[i];
      if (it.state === 'pinned') continue;
      if (it.score < p.floorAt || i >= p.cap) this.expire(it, now);
    }
  }

  private expire(it: QueueItem, now: number): void {
    it.state = 'expired';
    it.died = now;
    this.live.delete(it.id);
    this.history.push(it);
    this.emit({ type: 'item', now, item: it, change: 'expired' });
  }

  markReady(id: string, now: number): void {
    const it = this.live.get(id);
    if (!it) return;
    // A pinned item keeps its pin; it still announces that its results arrived.
    if (it.state === 'staged') it.state = 'ready';
    else if (it.state !== 'pinned') return;
    this.emit({ type: 'item', now, item: it, change: 'ready' });
  }

  pin(id: string, now: number): void {
    const it = this.live.get(id);
    if (!it) return;
    it.state = 'pinned';
    this.emit({ type: 'item', now, item: it, change: 'pinned' });
  }

  pull(id: string, now: number): QueueItem | undefined {
    const it = this.live.get(id);
    if (!it) return undefined;
    this.emit({ type: 'item', now, item: it, change: 'pulled' });
    return it;
  }

  snapshot(): QueueItem[] {
    return [...this.live.values()].sort((a, b) => b.score - a.score);
  }

  /** Flush everything still live at session end into history. */
  close(now: number): void {
    for (const it of [...this.live.values()]) {
      it.died = now;
      this.live.delete(it.id);
      this.history.push(it);
    }
  }
}
