// Small lexical helpers. v0 topic similarity is term overlap; embeddings come later
// behind the same two functions.

const STOP = new Set((
  'a an the and or but if then so of to in on at by for from with about as into like through after over ' +
  'between out against during without before under around among is are was were be been being am do does did ' +
  'doing have has had having i me my we our you your he him his she her it its they them their what which who ' +
  'whom this that these those there here where when why how all any both each few more most other some such no ' +
  'nor not only own same than too very can will just dont don should now also really kind sort yeah yes okay ok ' +
  'right know think mean like going get got gonna wanna thing things lot say said says one two uh um oh well'
).split(/\s+/));

export function terms(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().split(/[^a-z0-9']+/)) {
    const w = raw.replace(/^'+|'+$/g, '').replace(/'s$/, '');
    if (w.length < 3 || STOP.has(w)) continue;
    out.push(w);
  }
  return out;
}

export function uniqueTerms(text: string): string[] {
  return [...new Set(terms(text))];
}

/** Jaccard-style overlap in [0, 1], weighted toward the smaller set so a short query
 *  fully contained in a long window still scores high. */
export function overlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sb = new Set(b);
  let hits = 0;
  for (const t of new Set(a)) if (sb.has(t)) hits++;
  return hits / Math.min(new Set(a).size, sb.size);
}

export function normalizeQuery(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function hashId(text: string): string {
  // FNV-1a, 32-bit, hex. Stable ids for dedupe across restarts.
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const h = Math.floor(m / 60);
  const mm = (h ? m % 60 : m).toString().padStart(h ? 2 : 1, '0');
  return (h ? `${h}:` : '') + `${mm}:${sec.toString().padStart(2, '0')}`;
}
