import { promises as fs } from 'node:fs';
import type { TranscriptSegment } from '../types.ts';

/**
 * Transcript file parsers for replay and backtest. Supported:
 *  - SRT and WebVTT (.srt, .vtt)
 *  - JSON: an array of {t0|start, t1|end, text, speaker?} (seconds)
 *  - timestamped text: lines beginning with [h:mm:ss] or mm:ss, as YouTube and most
 *    podcast transcript sites export; untimed plain text is paced at a speaking rate.
 */
export async function loadTranscript(file: string): Promise<TranscriptSegment[]> {
  const raw = (await fs.readFile(file, 'utf8')).replace(/^﻿/, '');
  const lower = file.toLowerCase();
  let segs: TranscriptSegment[];
  if (lower.endsWith('.json')) segs = parseJson(raw);
  else if (lower.endsWith('.srt') || lower.endsWith('.vtt') || /-->/.test(raw)) segs = parseCues(raw);
  else segs = parseTimestampedText(raw);
  return coalesce(segs);
}

function parseJson(raw: string): TranscriptSegment[] {
  const data = JSON.parse(raw) as unknown;
  const arr = Array.isArray(data) ? data : (data as { segments?: unknown[] }).segments ?? [];
  const out: TranscriptSegment[] = [];
  for (const x of arr) {
    const o = x as Record<string, unknown>;
    const t0 = num(o.t0 ?? o.start);
    const t1 = num(o.t1 ?? o.end);
    const text = typeof o.text === 'string' ? o.text.trim() : '';
    if (t0 === null || !text) continue;
    out.push({ t0, t1: t1 ?? t0 + estimate(text), text, speaker: typeof o.speaker === 'string' ? o.speaker : undefined });
  }
  return out;
}

function parseCues(raw: string): TranscriptSegment[] {
  const out: TranscriptSegment[] = [];
  const re = /(\d{1,2}:)?(\d{1,2}):(\d{2})[.,](\d{1,3})\s*-->\s*(\d{1,2}:)?(\d{1,2}):(\d{2})[.,](\d{1,3})[^\n]*\n([\s\S]*?)(?=\n\s*\n|\n*$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const t0 = hms(m[1], m[2], m[3], m[4]);
    const t1 = hms(m[5], m[6], m[7], m[8]);
    const body = m[9]
      .split('\n')
      .filter((l) => !/^\d+$/.test(l.trim()))
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!body) continue;
    const sp = body.match(/^([A-Z][A-Za-z .'-]{0,30}):\s+(.*)$/);
    out.push(sp ? { t0, t1, text: sp[2], speaker: sp[1] } : { t0, t1, text: body });
  }
  return out;
}

function parseTimestampedText(raw: string): TranscriptSegment[] {
  const lines = raw.split(/\r?\n/);
  const out: TranscriptSegment[] = [];
  const stamp = /^\s*\[?\(?((\d{1,2}):)?(\d{1,2}):(\d{2})\)?\]?\s*[-–:]?\s*(.*)$/;
  let pending: { t0: number; text: string; speaker?: string } | null = null;
  let anyStamp = false;
  for (const line of lines) {
    const m = line.match(stamp);
    if (m) {
      anyStamp = true;
      if (pending) out.push({ t0: pending.t0, t1: pending.t0, text: pending.text, speaker: pending.speaker });
      const t0 = hms(m[2] ? m[2] + ':' : undefined, m[3], m[4], '0');
      const rest = m[5].trim();
      const sp = rest.match(/^([A-Z][A-Za-z .'-]{0,30}):\s+(.*)$/);
      pending = sp ? { t0, text: sp[2], speaker: sp[1] } : { t0, text: rest };
    } else if (pending && line.trim()) {
      pending.text += ' ' + line.trim();
    } else if (!anyStamp && line.trim()) {
      out.push({ t0: 0, t1: 0, text: line.trim() });
    }
  }
  if (pending) out.push({ t0: pending.t0, t1: pending.t0, text: pending.text, speaker: pending.speaker });
  if (!anyStamp) {
    // Untimed text: pace it at ~2.6 words per second.
    let t = 0;
    for (const s of out) {
      s.t0 = t;
      t += estimate(s.text);
      s.t1 = t;
    }
    return out;
  }
  // Stamped lines have only a start; end = next start (or estimated).
  for (let i = 0; i < out.length; i++) {
    const next = out[i + 1];
    out[i].t1 = next && next.t0 > out[i].t0 ? next.t0 : out[i].t0 + estimate(out[i].text);
  }
  return out;
}

/** Merge very short cues into sentence-sized segments so the anticipator sees phrases. */
function coalesce(segs: TranscriptSegment[], minWords = 12): TranscriptSegment[] {
  const out: TranscriptSegment[] = [];
  let cur: TranscriptSegment | null = null;
  for (const s of segs) {
    if (!s.text.trim()) continue;
    if (cur && cur.speaker === s.speaker && cur.text.split(/\s+/).length < minWords && s.t0 - cur.t1 < 2) {
      cur.text += ' ' + s.text;
      cur.t1 = s.t1;
    } else {
      if (cur) out.push(cur);
      cur = { ...s };
    }
  }
  if (cur) out.push(cur);
  return out;
}

function hms(h: string | undefined, m: string, s: string, frac: string): number {
  const hh = h ? parseInt(h, 10) : 0;
  return hh * 3600 + parseInt(m, 10) * 60 + parseInt(s, 10) + parseInt(frac.padEnd(3, '0').slice(0, 3), 10) / 1000;
}

function estimate(text: string): number {
  return Math.max(1, text.split(/\s+/).length / 2.6);
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : null;
}
