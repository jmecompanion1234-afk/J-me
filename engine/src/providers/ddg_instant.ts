import type { SearchResult } from '../types.ts';

/**
 * DuckDuckGo Instant Answer API: the official, keyless endpoint. It answers named topics with
 * an abstract and a source link, and stays silent on generic queries. Works from the browser.
 */
export async function ddgInstant(query: string, max = 3, timeoutMs = 8_000): Promise<SearchResult[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.duckduckgo.com/?format=json&no_html=1&skip_disambig=1&q=' + encodeURIComponent(query), { signal: ctrl.signal });
    if (!res.ok) throw new Error(`duckduckgo api ${res.status}`);
    const d = (await res.json()) as {
      Heading?: string;
      AbstractText?: string;
      AbstractURL?: string;
      Results?: { Text?: string; FirstURL?: string }[];
      RelatedTopics?: { Text?: string; FirstURL?: string }[];
    };
    const out: SearchResult[] = [];
    if (d.AbstractURL && d.AbstractText) out.push({ title: d.Heading || query, url: d.AbstractURL, snippet: d.AbstractText.slice(0, 300), source: 'duckduckgo' });
    for (const r of [...(d.Results ?? []), ...(d.RelatedTopics ?? [])]) {
      if (out.length >= max) break;
      if (!r.FirstURL || !r.Text || /duckduckgo\.com\/c\//.test(r.FirstURL)) continue;
      const [title, ...rest] = r.Text.split(' - ');
      out.push({ title: title.trim(), url: r.FirstURL, snippet: rest.join(' - ').trim().slice(0, 300), source: 'duckduckgo' });
    }
    return out;
  } finally {
    clearTimeout(timer);
  }
}
