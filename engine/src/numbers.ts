// The calculator. Spoken figures are checked against each other, deterministically, with no
// model involved: parts of a whole that add past 100%, a stated change that does not match its
// own before-and-after, a fraction whose stated percentage is wrong, a "doubled" that did not.
// Conservative on purpose: a false flag costs trust, a missed one costs nothing.

export interface NumberIssue {
  /** the claim, as said */
  claim: string;
  /** the arithmetic, plainly */
  calc: string;
}

const SMALL: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const SCALE: Record<string, number> = { hundred: 100, thousand: 1e3, k: 1e3, million: 1e6, m: 1e6, billion: 1e9, b: 1e9, trillion: 1e12 };

/** Spoken numbers to digits: "twenty five percent" -> "25%", "2.5 million" -> "2500000". */
export function normalizeNumbers(text: string): string {
  let s = text.replace(/(\d),(\d{3})\b/g, '$1$2');
  // Digits with a scale word first ("2.5 million", "300k"), so a lone "million" below is not
  // turned into a number before this rule sees it.
  s = s.replace(/(\d+(?:\.\d+)?)\s*(hundred|thousand|million|billion|trillion|k|m|b)\b/gi, (_, n: string, sc: string) => String(Math.round(Number(n) * SCALE[sc.toLowerCase()])));
  // Number words, possibly hyphenated: "twenty-five", "one hundred and fifty thousand". A lone
  // scale word ("a million reasons") is not a number.
  s = s.replace(/\b((?:(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion)(?:[-\s]+(?:and[-\s]+)?)?)+)\b/gi, (m: string) => {
    const words = m.toLowerCase().split(/[-\s]+/).filter((w) => w && w !== 'and');
    if (!words.some((w) => w in SMALL)) return m;
    let total = 0, cur = 0;
    for (const w of words) {
      if (w in SMALL) cur += SMALL[w];
      else if (w === 'hundred') cur = (cur || 1) * 100;
      else if (w in SCALE) { total += (cur || 1) * SCALE[w]; cur = 0; }
      else return m;
    }
    return String(total + cur) + (/\s$/.test(m) ? ' ' : '');
  });
  s = s.replace(/(\d+(?:\.\d+)?)\s*(?:percent|per cent|pct)\b/gi, '$1%');
  return s;
}

const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));
const near = (a: number, b: number, tolPoints: number, tolRel = 0.1): boolean => Math.abs(a - b) <= Math.max(tolPoints, Math.abs(b) * tolRel);

/** Split into sentences, generously (transcripts have weak punctuation). */
const sentences = (text: string): string[] => text.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter((x) => x.length > 8);

export function findNumberIssues(text: string): NumberIssue[] {
  const out: NumberIssue[] = [];
  for (const raw of sentences(text)) {
    const s = normalizeNumbers(raw);
    const lower = s.toLowerCase();

    // 1. Parts of one whole that add past 100%. Only percentages that are NOT "N% of <something>"
    //    (those describe different wholes: "60% of men and 70% of women" is fine), and only when
    //    the sentence reads as a breakdown (is/are/was/were/made up/consists/split/breaks down).
    if (/\b(is|are|was|were|made up|consists?|consisting|split|breaks? down|broken down|divided|composed|comprised)\b/.test(lower) &&
        !/\b(up|down|increase|decrease|grew|fell|rose|dropped|more|less|higher|lower|likely|chance|probability|odds|than|growth|rate)\b/.test(lower)) {
      const parts: number[] = [];
      const re = /(\d+(?:\.\d+)?)%(?!\s*(?:of|more|less|higher|lower|up|down))/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(s))) parts.push(Number(m[1]));
      // "35% of the fragments are gearing, 50% are plates, 30% are inscriptions": the one "N% of
      // the <whole> are" opens the breakdown and names the whole the bare percentages share. Only
      // when it is the only "of" phrase (two of them are two wholes) and it is followed by bare parts.
      const ofs = s.match(/(\d+(?:\.\d+)?)%\s*of\b/g) ?? [];
      const whole = /(\d+(?:\.\d+)?)%\s*of\s+(?:the|these|those|all|all the|all of the|our|its|their|his|her)\s+[\w' -]{1,40}?\s+(?:is|are|was|were)\b/.exec(s);
      if (ofs.length === 1 && whole && parts.length >= 1) parts.unshift(Number(whole[1]));
      if (parts.length >= 2) {
        const sum = parts.reduce((a, b) => a + b, 0);
        if (sum > 100.5) out.push({ claim: raw, calc: `${parts.map(fmt).join('% + ')}% = ${fmt(sum)}%. Parts of one whole cannot add to more than 100%.` });
      }
    }

    // 2. "from A to B" with a stated percentage change in the same sentence.
    {
      const m = /from\s+\$?(\d+(?:\.\d+)?)\s*(%?)\s+(?:to|up to|down to)\s+\$?(\d+(?:\.\d+)?)/.exec(s);
      const p = /(\d+(?:\.\d+)?)%\s*(increase|decrease|rise|drop|jump|fall|growth|gain|loss|more|less|higher|lower|up|down)|\b(up|down|increase[sd]?|decrease[sd]?|grew|fell|rose|dropped|jumped)\s+(?:by\s+)?(\d+(?:\.\d+)?)%/.exec(s);
      if (m && p) {
        const a = Number(m[1]), b = Number(m[3]);
        const stated = Number(p[1] ?? p[4]);
        if (a > 0) {
          const actual = ((b - a) / a) * 100;
          if (!near(Math.abs(actual), stated, 3)) out.push({ claim: raw, calc: `From ${fmt(a)}${m[2]} to ${fmt(b)}${m[2]} is a ${fmt(Math.abs(actual))}% ${actual >= 0 ? 'increase' : 'decrease'}, not ${fmt(stated)}%.` });
        }
      }
    }

    // 3. "A out of B" (or "A of the B") with a stated percentage.
    {
      const m = /\b(\d+(?:\.\d+)?)\s+(?:out of|of the|of every|in every|in)\s+(\d+(?:\.\d+)?)\b/.exec(s);
      const p = /(\d+(?:\.\d+)?)%/.exec(s);
      if (m && p && Number(m[2]) > 0) {
        const actual = (Number(m[1]) / Number(m[2])) * 100;
        const stated = Number(p[1]);
        if (Number(m[1]) <= Number(m[2]) && !near(actual, stated, 2)) out.push({ claim: raw, calc: `${fmt(Number(m[1]))} out of ${fmt(Number(m[2]))} is ${fmt(actual)}%, not ${fmt(stated)}%.` });
      }
    }

    // 4. doubled / tripled / halved / "N times" against a from-to.
    {
      const m = /from\s+\$?(\d+(?:\.\d+)?)\s*%?\s+(?:to|up to|down to)\s+\$?(\d+(?:\.\d+)?)/.exec(s);
      const w = /\b(doubled|tripled|quadrupled|halved|(\d+(?:\.\d+)?)\s*(?:x|times)\b)/.exec(lower);
      if (m && w) {
        const a = Number(m[1]), b = Number(m[2]);
        const factor = w[1] === 'doubled' ? 2 : w[1] === 'tripled' ? 3 : w[1] === 'quadrupled' ? 4 : w[1] === 'halved' ? 0.5 : Number(w[2]);
        if (a > 0 && factor > 0) {
          const actual = b / a;
          if (!near(actual, factor, 0.15, 0.1)) out.push({ claim: raw, calc: `${fmt(a)} to ${fmt(b)} is ${fmt(actual)}×, not ${w[1] === 'halved' ? 'half' : fmt(factor) + '×'}.` });
        }
      }
    }
  }
  return out;
}

/** Does this text carry a figure worth checking (a percentage, a count, a price, a year, a ratio)? */
export function hasFigure(text: string): boolean {
  const s = normalizeNumbers(text);
  return /\d/.test(s) && /(\d+(?:\.\d+)?%|\$\s?\d|\b\d{4}\b|\b\d+(?:\.\d+)?\s*(?:x|times|out of|in every|per)\b|\b\d{2,}\b)/.test(s);
}
