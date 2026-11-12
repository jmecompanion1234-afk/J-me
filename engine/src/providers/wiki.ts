import type { SearchResult } from '../types.ts';

/**
 * Wikipedia provider: an open API with CORS, so it works from the browser extension as well
 * as from Node. Best for "lookup" items (a named person, thing, place, paper): one card with
 * the summary and the article link. Nothing but the query leaves the device.
 */
export async function wikiLookup(query: string, max = 2, timeoutMs = 8_000, lang = 'en'): Promise<SearchResult[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const u = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srlimit=${max}&format=json&origin=*&srsearch=` + encodeURIComponent(query);
    const res = await fetch(u, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`wikipedia ${res.status}`);
    const data = (await res.json()) as { query?: { search?: { title: string }[] } };
    const titles = (data.query?.search ?? []).map((s) => s.title);
    const out: SearchResult[] = [];
    for (const title of titles) {
      const r = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/` + encodeURIComponent(title.replace(/ /g, '_')), {
        signal: ctrl.signal,
        headers: { accept: 'application/json' },
      });
      if (!r.ok) continue;
      const s = (await r.json()) as { title?: string; extract?: string; content_urls?: { desktop?: { page?: string } }; type?: string; thumbnail?: { source: string }; originalimage?: { source: string } };
      if (s.type === 'disambiguation') continue;
      out.push({
        title: s.title ?? title,
        url: s.content_urls?.desktop?.page ?? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
        snippet: (s.extract ?? '').replace(/\s+/g, ' ').slice(0, 300),
        source: 'wikipedia',
        ...(s.thumbnail?.source ? { image: { thumb: s.thumbnail.source, url: s.originalimage?.source ?? s.thumbnail.source } } : {}),
      });
    }
    return out;
  } finally {
    clearTimeout(timer);
  }
}
