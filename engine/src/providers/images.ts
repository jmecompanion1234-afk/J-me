import type { ImageResult } from '../types.ts';

/**
 * Image provider: Wikimedia Commons search. Keyless, CORS-open (`origin=*`), no bot challenge,
 * and the pictures come with a page to credit. Good for named things and places; thin for
 * abstract queries, which is fine: an empty strip is better than a wrong one.
 */
export async function commonsImages(query: string, max = 4, timeoutMs = 8_000): Promise<ImageResult[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const u =
      'https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6' +
      `&gsrlimit=${max * 2}&prop=imageinfo&iiprop=url|mime&iiurlwidth=360&format=json&origin=*` +
      '&gsrsearch=' + encodeURIComponent(`filetype:bitmap ${query}`);
    const res = await fetch(u, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`commons ${res.status}`);
    const data = (await res.json()) as {
      query?: { pages?: Record<string, { title: string; index?: number; imageinfo?: { url: string; thumburl?: string; descriptionurl?: string; mime?: string }[] }> };
    };
    const pages = Object.values(data.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const out: ImageResult[] = [];
    for (const p of pages) {
      const ii = p.imageinfo?.[0];
      if (!ii || !/^image\/(jpeg|png|gif|webp)$/.test(ii.mime ?? '')) continue;
      out.push({
        title: p.title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, ''),
        thumb: ii.thumburl ?? ii.url,
        url: ii.url,
        page: ii.descriptionurl ?? ii.url,
        source: 'commons',
      });
      if (out.length >= max) break;
    }
    return out;
  } finally {
    clearTimeout(timer);
  }
}
