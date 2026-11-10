import type { TranscriptSegment } from './types.ts';
import { uniqueTerms } from './text.ts';

/** Rolling transcript with time-window queries. */
export class Transcript {
  readonly segments: TranscriptSegment[] = [];

  add(seg: TranscriptSegment): void {
    this.segments.push(seg);
  }

  /** Segments whose end lies within the last `seconds` before `now`. */
  window(now: number, seconds: number): TranscriptSegment[] {
    const from = now - seconds;
    const out: TranscriptSegment[] = [];
    for (let i = this.segments.length - 1; i >= 0; i--) {
      const s = this.segments[i];
      if (s.t1 < from) break;
      out.push(s);
    }
    return out.reverse();
  }

  windowText(now: number, seconds: number): string {
    return this.window(now, seconds).map((s) => (s.speaker ? `${s.speaker}: ${s.text}` : s.text)).join('\n');
  }

  windowTerms(now: number, seconds: number): string[] {
    return uniqueTerms(this.window(now, seconds).map((s) => s.text).join(' '));
  }

  /** Terms of everything spoken after time `t` (segments that start after it). */
  termsSince(t: number): string[] {
    const out: string[] = [];
    for (let i = this.segments.length - 1; i >= 0; i--) {
      const s = this.segments[i];
      if (s.t0 <= t) break;
      out.push(s.text);
    }
    return uniqueTerms(out.join(' '));
  }

  get end(): number {
    return this.segments.length ? this.segments[this.segments.length - 1].t1 : 0;
  }
}
