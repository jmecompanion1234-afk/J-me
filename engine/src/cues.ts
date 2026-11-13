/**
 * Spoken cues: the "Jamie, pull that up" moment, heard in the conversation itself. Nothing is
 * typed. A host says "let's ask Perplexity whether…" and the question becomes a prompt card
 * handed to that AI; "pull up a picture of the Saros dial" queues pictures of it; "pull up a
 * video of Clickspring" queues videos; "pull up the 2006 Nature paper" is a lookup. The cue
 * fires the moment the segment lands, ahead of the anticipator, and the card is pinned.
 *
 * Conservative on purpose: a cue needs the verb AND the object, so "look up at the sky" and
 * "pull up a chair" do not fire. The speech model mishears names ("cloud" for Claude), so the
 * service words include the usual mishearings.
 */
export type CueService = 'chatgpt' | 'claude' | 'perplexity';
export type CueKind = 'ask' | 'images' | 'videos' | 'lookup';
export interface Cue {
  kind: CueKind;
  /** the question or subject; empty when the cue ended the sentence (the next segment carries it) */
  text: string;
  service?: CueService;
  /** the words that triggered it, for the card's "why" */
  phrase: string;
}

const SERVICE = '(perplexity|perplexitie|chat\\s?gpt|chat g p t|chatgbt|claude|cloud|clod|claud)';
const LEAD = "(?:let'?s|lets|can (?:you|we)|could (?:you|we)|why don'?t (?:you|we)|go ahead and|j-?me|jamie|jaime|jaimie|hey)?[,\\s]*";
const ASK = new RegExp(`\\b${LEAD}ask ${SERVICE}\\b[,:.!?]?\\s*(.*)$`, 'i');
const PICTURE = /\b(?:pull (?:up|that up)|bring up|show (?:me|us|them|everyone)|put up|get (?:me|us)|find (?:me|us)|throw up|let'?s see|look up|google)\b[^.?!]{0,16}?\b(?:an?|some|the|a few|a couple of)?\s*(?:image|picture|photo|photograph|pic|shot)s?\s+(?:of|for)\s+(.+)$/i;
const LOOK_LIKE = /\bwhat (?:does|did|do|would) (.+?) look(?:s|ed)? like\b/i;
const VIDEO = /\b(?:pull (?:up|that up)|bring up|show (?:me|us|them|everyone)|put up|get (?:me|us)|find (?:me|us)|throw up|let'?s see|let'?s watch|look up|play)\b[^.?!]{0,16}?\b(?:an?|some|the|a few|that)?\s*(?:video|clip|footage|trailer)s?\s+(?:of|for|from|where)\s+(.+)$/i;
// The bare lookup is the loosest cue, so it must open the sentence (an instruction, not a report
// of one: "he asked me to bring up…" stays quiet) and name a thing, not "a chair" or "at the ceiling".
const LOOKUP = /^(?:(?:jamie|jaime|j-?me|hey|okay|ok|so|and|alright|now)[,\s]+)*(?:pull up|bring up|look up)\s+(?!(?:a|an|at|some|that|it|this|him|her|them|those|these|your|my|his|our|what|where|how)\b)(.+)$/i;

function serviceOf(word: string): CueService {
  const w = word.toLowerCase().replace(/\s+/g, '');
  if (w.startsWith('perplex')) return 'perplexity';
  if (w.startsWith('chat')) return 'chatgpt';
  return 'claude';
}

/** Trim the captured text to the request itself: stop at the sentence end or a conjunction, drop the politeness. */
export function cleanCue(s: string): string {
  let t = s.trim();
  t = t.split(/[.?!;]/)[0];
  t = t.split(/,?\s+(?:and then|and|but|so|because|which|you know|right|okay|ok)\s+/i)[0];
  t = t.replace(/\b(?:please|for me|for us|real quick|really quick|right now|right here|here|on the screen|on screen)\b/gi, ' ');
  t = t.replace(/^(?:to|if|whether|about)\s+/i, (m) => (/^(?:if|whether)/i.test(m) ? m : ''));
  t = t.replace(/\s+/g, ' ').replace(/^[,:\s]+|[,:\s]+$/g, '');
  return t.slice(0, 140);
}

/** One cue per sentence; a cue that ends its sentence takes the next sentence as its text. */
export function findCues(text: string): Cue[] {
  const out: Cue[] = [];
  const sentences = text.replace(/\s+/g, ' ').trim().split(/(?<=[.?!])\s+/).filter(Boolean);
  for (let i = 0; i < sentences.length; i++) {
    const cue = cueIn(sentences[i]);
    if (!cue) continue;
    if (!cue.text && i + 1 < sentences.length) {
      const next = cleanCue(sentences[i + 1]);
      if (next) { cue.text = next; i++; }
    }
    out.push(cue);
  }
  return out;
}

function cueIn(t: string): Cue | null {
  const ask = t.match(ASK);
  if (ask) return { kind: 'ask', service: serviceOf(ask[1]), text: cleanCue(ask[2] ?? ''), phrase: ask[0].slice(0, ask[0].length - (ask[2] ?? '').length).trim() };
  const pic = t.match(PICTURE);
  if (pic) {
    const text = cleanCue(pic[1]);
    return text ? { kind: 'images', text, phrase: pic[0].slice(0, pic[0].length - pic[1].length).trim() } : null;
  }
  const look = t.match(LOOK_LIKE);
  if (look) {
    const text = cleanCue(look[1]);
    return text && text.split(' ').length <= 8 ? { kind: 'images', text, phrase: 'what does it look like' } : null;
  }
  const vid = t.match(VIDEO);
  if (vid) {
    const text = cleanCue(vid[1]);
    return text ? { kind: 'videos', text, phrase: vid[0].slice(0, vid[0].length - vid[1].length).trim() } : null;
  }
  const lk = t.match(LOOKUP);
  if (lk) {
    const text = cleanCue(lk[1]);
    return text && text.split(' ').length >= 2 ? { kind: 'lookup', text, phrase: lk[0].slice(0, lk[0].length - lk[1].length).trim() } : null;
  }
  return null;
}
