import type { Candidate, Mode } from './types.ts';
import { ollamaChat, type Chat } from './brain.ts';

/**
 * The anticipator asks a small local LLM what someone in the room would want pulled up
 * right now. Only the transcript window and the current queue texts are sent, and only to
 * the brain on this device: Ollama by default, or whatever `chat` is plugged in.
 */
export interface AnticipatorOptions {
  host: string;
  model: string;
  maxItems: number;
  timeoutMs: number;
  /** the brain; when absent, Ollama at `host` with `model` */
  chat?: Chat;
}

export const DEFAULT_ANTICIPATOR: AnticipatorOptions = {
  host: 'http://127.0.0.1:11434',
  model: 'qwen2.5:7b',
  maxItems: 3,
  timeoutMs: 60_000,
};

export function brainOf(opts: AnticipatorOptions): Chat {
  return opts.chat ?? ollamaChat(opts.host, opts.model);
}

export const ANTICIPATOR_SYSTEM = `You are the producer sitting beside a live conversation, like Jamie on a podcast.
You never speak. You prepare what the people talking are about to want pulled up.

Given the most recent transcript, propose up to N items. Each item is one of:
- "search": a short web search query (3 to 8 words) for a fact, number, date, article or definition being discussed or disputed.
- "lookup": a specific named thing (person, company, paper, book, product, place, law) worth having a card for.
- "prompt": a question for an AI assistant, phrased as the question: a claim just made that is worth checking ("Is it true that ..."), two claims that conflict, a term used in a way that needs explaining here, or a "what if" someone posed.
- "media": a specific video, clip, scene, chart, talk, interview, performance or image someone referenced or would want to see ("that interview where...", "the clip of...", "the scene in..."). Name the thing so a video search finds it.

Rules:
- Only propose what the conversation itself makes relevant RIGHT NOW. Skip small talk.
- Be concrete. Every item names a specific thing: a person, title, organization, number, date, quote, term, event, law, product or place that was actually said. Nothing generic.
- Strongly prefer items someone would plausibly say "pull that up" about: a contested fact, a name nobody can quite remember, a statistic, a date, a book or paper, "what was that called", "look that up".
- Never propose: "clip of <speaker> discussing <topic>", "compare <speaker>'s views with ...", "summarize what <speaker> said", "history of <broad topic>", "context for ...". Those are filler. A "media" item exists only when a specific clip, scene, chart, photo or timestamp was referenced by the speakers.
- A "prompt" item names the claim it checks ("Is it true that the Antikythera mechanism predicted eclipses?"), never "fact-check this" or "explain the discussion". One per call at most.
- Do not repeat anything already in the queue (given). Do not propose near-duplicates.
- "why" is one short clause quoting or paraphrasing the moment that earned the item.
- confidence is 0 to 1: how likely someone wants it within the next minute. Reserve 0.8+ for things that were named explicitly and matter to the point being made.
- If nothing is worth staging, return an empty list. Empty is a good answer.

Respond with JSON only: {"items":[{"kind":"search","text":"...","why":"...","confidence":0.7}]}`;

export class Anticipator {
  opts: AnticipatorOptions;
  constructor(opts: AnticipatorOptions = DEFAULT_ANTICIPATOR) {
    this.opts = opts;
  }

  async propose(windowText: string, queueTexts: string[], mode: Mode): Promise<Candidate[]> {
    if (windowText.trim().length < 20) return [];
    const user =
      `Mode: ${mode === 'media' ? 'listening to media (podcast/video/lecture)' : 'conversation in the room'}\n` +
      `N: ${this.opts.maxItems}\n` +
      `Already in queue:\n${queueTexts.length ? queueTexts.map((t) => `- ${t}`).join('\n') : '(empty)'}\n\n` +
      `Most recent transcript:\n"""\n${windowText}\n"""`;
    const raw = await brainOf(this.opts)(
      [
        { role: 'system', content: ANTICIPATOR_SYSTEM },
        { role: 'user', content: user },
      ],
      { json: true, temperature: 0.3, maxTokens: 600, timeoutMs: this.opts.timeoutMs },
    );
    return parseCandidates(raw, this.opts.maxItems);
  }
}

/** Answer a "prompt" item over the recent transcript, locally. Plain text, short. */
export async function answerPrompt(opts: AnticipatorOptions, prompt: string, windowText: string): Promise<string> {
  const raw = await brainOf(opts)(
    [
      {
        role: 'system',
        content:
          'You answer a question about a live conversation using only the transcript given and general knowledge. ' +
          'Four sentences at most. If the transcript does not settle it, say what is known and what is not.',
      },
      { role: 'user', content: `Transcript:\n"""\n${windowText}\n"""\n\nQuestion: ${prompt}` },
    ],
    { temperature: 0.2, maxTokens: 300, timeoutMs: opts.timeoutMs },
  );
  return raw.trim();
}

const QUESTION = /\?\s*$|^(is|are|was|were|does|do|did|can|could|would|should|what|why|how|who|when|where|which)\b/i;
const FILLER = /^(history of|context (for|of|about)|overview of|background (on|of)|clip (of|from)|wikipedia page|compare |comparison of|summar(y|ize)|explain (how|why|the)|discussion (of|about)|the (role|impact|importance|significance) of)/i;

/**
 * Small local models love generic "compare X's views" and "clip of Y discussing Z" items.
 * The prompt forbids them; this is the backstop. A prompt must read as a question.
 */
export function isFiller(kind: Candidate['kind'], text: string, confidence: number): boolean {
  if (FILLER.test(text.trim())) return true;
  if (kind === 'prompt' && (confidence < 0.6 || !QUESTION.test(text))) return true;
  if (kind === 'media' && confidence < 0.6) return true;
  return false;
}

export function parseCandidates(raw: string, max: number): Candidate[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return [];
    try {
      parsed = JSON.parse(m[0]);
    } catch {
      return [];
    }
  }
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { items?: unknown }).items)
      ? (parsed as { items: unknown[] }).items
      : [];
  const kinds = new Set(['search', 'lookup', 'prompt', 'media']);
  const out: Candidate[] = [];
  for (const x of list) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const text = typeof o.text === 'string' ? o.text.trim() : typeof o.query === 'string' ? o.query.trim() : '';
    if (!text) continue;
    const kind = typeof o.kind === 'string' && kinds.has(o.kind) ? (o.kind as Candidate['kind']) : 'search';
    const conf = Math.max(0, Math.min(1, typeof o.confidence === 'number' ? o.confidence : Number(o.confidence) || 0.5));
    if (isFiller(kind, text, conf)) continue;
    // One question per call: small brains hand back three near-identical ones otherwise.
    if (kind === 'prompt' && out.some((c) => c.kind === 'prompt')) continue;
    out.push({ kind, text, why: typeof o.why === 'string' ? o.why : '', confidence: conf });
    if (out.length >= max) break;
  }
  return out;
}
