// J-me as a tool for agents: an MCP server over stdio, on top of the bridge.
//
//   node engine/src/mcp.ts [--port 8788]
//
// Starts the bridge itself when the port is free (one process does both), or talks to a bridge
// already running there. Claude Code:  claude mcp add jme -- node /path/to/J-me/engine/src/mcp.ts
// Tools: jme_state, jme_cards, jme_transcript, jme_ask, jme_pin, jme_unpin, jme_pause, jme_resume,
// jme_wait. Everything stays on this machine.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Bridge, type BridgeState, type Command } from './bridge.ts';
import type { EngineEvent, QueueItem } from './types.ts';

const i = process.argv.indexOf('--port');
const PORT = i >= 0 ? Number(process.argv[i + 1]) : 8788;
const log = (...a: unknown[]) => console.error('[jme-mcp]', ...a);

/** The bridge, in-process or over HTTP: the same three verbs either way. */
interface Client {
  state(): Promise<BridgeState>;
  command(c: Omit<Command, 'id' | 'at'>): Promise<{ ok: boolean; id?: number; error?: string }>;
  wait(pred: (ev: EngineEvent) => boolean, ms: number): Promise<EngineEvent | null>;
}

async function connect(): Promise<Client> {
  const local = new Bridge();
  try {
    await local.listen(PORT);
    log(`bridge started on http://127.0.0.1:${PORT}`);
    return {
      state: async () => local.state,
      command: async (c) => local.command(c),
      wait: (pred, ms) => new Promise((resolve) => {
        const off = local.on((ev) => { if (pred(ev)) { off(); clearTimeout(t); resolve(ev); } });
        const t = setTimeout(() => { off(); resolve(null); }, ms);
      }),
    };
  } catch (e) {
    if (!(e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'EADDRINUSE')) throw e;
    const base = `http://127.0.0.1:${PORT}`;
    log(`using the bridge already running at ${base}`);
    return {
      state: async () => (await fetch(`${base}/state`)).json() as Promise<BridgeState>,
      command: async (c) => (await fetch(`${base}/command`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(c) })).json() as Promise<{ ok: boolean; id?: number; error?: string }>,
      wait: async (pred, ms) => {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), ms);
        try {
          const res = await fetch(`${base}/events`, { signal: ctrl.signal });
          const reader = res.body!.getReader();
          const dec = new TextDecoder();
          let buf = '';
          for (;;) {
            const { value, done } = await reader.read();
            if (done) return null;
            buf += dec.decode(value, { stream: true });
            let k: number;
            while ((k = buf.indexOf('\n\n')) >= 0) {
              const chunk = buf.slice(0, k); buf = buf.slice(k + 2);
              const line = chunk.split('\n').find((l) => l.startsWith('data: '));
              if (!line) continue;
              const ev = JSON.parse(line.slice(6)) as { type: string };
              if (ev.type !== 'snapshot' && pred(ev as EngineEvent)) return ev as EngineEvent;
            }
          }
        } catch { return null; } finally { clearTimeout(t); }
      },
    };
  }
}

const card = (it: QueueItem) => ({
  id: it.id,
  kind: it.kind,
  text: it.text,
  why: it.why,
  state: it.state,
  score: Number(it.score.toFixed(2)),
  moment: it.anchor?.text ?? '',
  bornAtSec: it.born,
  links: (it.results ?? []).map((r) => ({ title: r.title, url: r.url, snippet: r.snippet })),
  answer: it.answer ?? null,
  pictures: (it.images ?? []).map((p) => ({ title: p.title, url: p.url, page: p.page })),
  videos: (it.videos ?? []).map((v) => ({ title: v.title, url: v.url, channel: v.channel, duration: v.duration })),
});

const text = (o: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(o, null, 2) }] });

const client = await connect();
const server = new McpServer({ name: 'jme', version: '0.6.0' });

server.registerTool('jme_state', {
  description: 'What J-me is doing right now: whether it is listening (and to what), paused, its status line, how many cards are live and pinned, how much transcript it holds.',
  inputSchema: {},
}, async () => {
  const s = await client.state();
  return text({ listening: s.listening, title: s.title, mode: s.mode, paused: s.paused, status: s.status, sessionClockSec: s.now, liveCards: s.cards.length, pinnedCards: s.pinned.length, transcriptSegments: s.transcript.length, transcriptSec: s.transcript.length ? s.transcript[s.transcript.length - 1].t1 - s.transcript[0].t0 : 0, updatedAt: s.updatedAt ? new Date(s.updatedAt).toISOString() : null });
});

server.registerTool('jme_cards', {
  description: 'The cards: live (the current queue, highest score first), pinned (starred by the person), or gone (left the queue). Each has the text, why it was raised, the moment in the transcript, links, pictures, videos and any answer.',
  inputSchema: { which: z.enum(['live', 'pinned', 'gone']).default('live').describe('live, pinned or gone') },
}, async ({ which }) => {
  const s = await client.state();
  const list = which === 'pinned' ? s.pinned : which === 'gone' ? s.gone : s.cards;
  return text(list.map(card));
});

server.registerTool('jme_transcript', {
  description: 'The transcript J-me heard, as timed segments (seconds on the session clock). sinceSec limits it to the last N seconds; omit for the last hour.',
  inputSchema: { sinceSec: z.number().min(1).max(3600).optional().describe('only the last N seconds') },
}, async ({ sinceSec }) => {
  const s = await client.state();
  const from = sinceSec ? s.now - sinceSec : -Infinity;
  const segs = s.transcript.filter((x) => x.t1 >= from);
  return text({ nowSec: s.now, segments: segs.map((x) => ({ t0: x.t0, t1: x.t1, text: x.text })), plain: segs.map((x) => x.text).join(' ') });
});

server.registerTool('jme_ask', {
  description: 'Put a question or search into the queue for the people listening: it appears as a card marked as asked by you, pinned, with links fetched. Rate-limited to 6 a minute so the human stream stays readable.',
  inputSchema: { text: z.string().min(2).max(300).describe('the question or search'), by: z.string().max(60).optional().describe('who is asking, shown on the card (default: agent)') },
}, async ({ text: t, by }) => text(await client.command({ type: 'ask', text: t, by })));

server.registerTool('jme_pin', { description: 'Star a card so it stops fading (by card id from jme_cards).', inputSchema: { id: z.string() } }, async ({ id }) => text(await client.command({ type: 'pin', itemId: id })));
server.registerTool('jme_unpin', { description: 'Take the star off a card; it fades from now.', inputSchema: { id: z.string() } }, async ({ id }) => text(await client.command({ type: 'unpin', itemId: id })));
server.registerTool('jme_pause', { description: 'Hold the cards still (the transcript keeps flowing).', inputSchema: {} }, async () => text(await client.command({ type: 'pause' })));
server.registerTool('jme_resume', { description: 'Let the cards run again; the brain catches up on what was said during the hold.', inputSchema: {} }, async () => text(await client.command({ type: 'resume' })));

server.registerTool('jme_wait', {
  description: 'Block until something happens, then return it: the next card that becomes ready (links fetched), the next card born, the next card pinned, or the next transcript segment. Up to 60 s; returns null on timeout.',
  inputSchema: { for: z.enum(['ready', 'born', 'pinned', 'segment']).default('ready'), timeoutSec: z.number().min(1).max(60).default(30) },
}, async ({ for: what, timeoutSec }) => {
  const ev = await client.wait((e) => (what === 'segment' ? e.type === 'segment' : e.type === 'item' && e.change === what), timeoutSec * 1000);
  if (!ev) return text(null);
  return text(ev.type === 'segment' ? { segment: ev.segment } : ev.type === 'item' ? { change: ev.change, card: card(ev.item) } : ev);
});

await server.connect(new StdioServerTransport());
log('ready');
