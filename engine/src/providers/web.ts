import type { SearchResult } from '../types.ts';

/**
 * Web search provider. DuckDuckGo's HTML endpoint needs no key. This is the one place in the
 * engine that talks to the public internet, and only for items that crossed the staging threshold.
 */
export async function webSearch(query: string, max = 5, timeoutMs = 10_000): Promise<SearchResult[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query), {
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) J-me/0.0.1',
        accept: 'text/html',
      },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`duckduckgo ${res.status}`);
    const html = await res.text();
    // 202 with no results is the engine's bot challenge page, not an empty answer.
    if (res.status === 202 && !/result__a/.test(html)) throw new Error('duckduckgo challenge (202)');
    return parseDdg(html, max);
  } finally {
    clearTimeout(timer);
  }
}

export function parseDdg(html: string, max: number): SearchResult[] {
  const out: SearchResult[] = [];
  const blocks = html.split(/<div[^>]+class="[^"]*\bresult\b[^"]*"/).slice(1);
  for (const b of blocks) {
    const a = b.match(/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    const snip = b.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div|span)>/);
    let url = decodeEntities(a[1]);
    const m = url.match(/[?&]uddg=([^&]+)/);
    if (m) url = decodeURIComponent(m[1]);
    if (url.startsWith('//')) url = 'https:' + url;
    out.push({
      title: strip(a[2]),
      url,
      snippet: snip ? strip(snip[1]) : '',
      source: 'web',
    });
    if (out.length >= max) break;
  }
  return out;
}

function strip(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}
