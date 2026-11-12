import type { VideoResult } from '../types.ts';

/**
 * Video provider: YouTube's own results page, read the way a browser reads it. Keyless; the
 * page carries its data as JSON (`ytInitialData`) and every result is a `videoRenderer`.
 * From the extension this needs the youtube.com host permission; from Node it just works.
 * Thumbnails come from the stable `i.ytimg.com/vi/<id>/mqdefault.jpg` form.
 */
export async function youtubeSearch(query: string, max = 4, timeoutMs = 10_000): Promise<VideoResult[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch('https://www.youtube.com/results?search_query=' + encodeURIComponent(query), {
      signal: ctrl.signal,
      headers: { 'accept-language': 'en-US,en;q=0.8' },
    });
    if (!res.ok) throw new Error(`youtube ${res.status}`);
    const html = await res.text();
    const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
    if (!m) throw new Error('youtube: no result data on the page');
    const data = JSON.parse(m[1]) as unknown;
    const out: VideoResult[] = [];
    const seen = new Set<string>();
    const walk = (o: unknown): void => {
      if (out.length >= max || !o || typeof o !== 'object') return;
      const v = (o as { videoRenderer?: Record<string, unknown> }).videoRenderer;
      if (v && typeof v.videoId === 'string' && !seen.has(v.videoId)) {
        seen.add(v.videoId);
        const runs = (x: unknown): string => ((x as { runs?: { text: string }[] })?.runs ?? []).map((r) => r.text).join('');
        const title = runs(v.title) || (v.title as { simpleText?: string })?.simpleText || '';
        if (title) {
          out.push({
            id: v.videoId,
            title,
            url: `https://www.youtube.com/watch?v=${v.videoId}`,
            thumb: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
            channel: runs(v.ownerText) || runs(v.longBylineText),
            duration: (v.lengthText as { simpleText?: string })?.simpleText ?? '',
            source: 'youtube',
          });
        }
        return;
      }
      if (Array.isArray(o)) for (const x of o) walk(x);
      else for (const k of Object.keys(o as object)) walk((o as Record<string, unknown>)[k]);
    };
    walk(data);
    return out;
  } finally {
    clearTimeout(timer);
  }
}
