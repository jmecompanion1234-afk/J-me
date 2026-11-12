// The bridge: J-me's live stream, on this machine, for agents and other tools.
//
// The extension posts every engine event here (a setting switches it on). The bridge keeps the
// current state (the live cards, the pinned ones, the last hour of transcript) and serves it
// over plain HTTP on 127.0.0.1, with an event stream for anything that wants to follow along,
// and a command queue the extension long-polls so an agent can ask, pin, pause and resume.
// Nothing leaves the machine. The MCP server (mcp.ts) sits on top of this.
//
//   node engine/src/bridge.ts [--port 8788]
//
//   POST /events        {events: EngineEvent[]}            the extension's feed
//   GET  /state         the current state as JSON
//   GET  /events        text/event-stream of every event (SSE)
//   POST /command       {type: ask|pin|unpin|pause|resume, text?, id?, by?}   from an agent
//   GET  /commands?wait=25   the extension's long-poll: pending commands, or [] after wait s
import http from 'node:http';
import type { EngineEvent, QueueItem, TranscriptSegment } from './types.ts';

export interface BridgeState {
  session: string | null;
  mode: string | null;
  title: string | null;
  listening: boolean;
  paused: boolean;
  status: string;
  /** seconds on the session clock */
  now: number;
  cards: QueueItem[];
  pinned: QueueItem[];
  /** cards that left the live queue (expired), newest last, capped */
  gone: QueueItem[];
  transcript: TranscriptSegment[];
  /** wall-clock ms of the last event */
  updatedAt: number;
}

export interface Command {
  id: number;
  type: 'ask' | 'pin' | 'unpin' | 'pause' | 'resume';
  text?: string;
  itemId?: string;
  by?: string;
  at: number;
}

const MAX_TRANSCRIPT_SEC = 3600;
const MAX_GONE = 200;
/** agent asks per minute: the human stream stays the human stream */
const ASK_RATE_PER_MIN = 6;

export class Bridge {
  state: BridgeState = { session: null, mode: null, title: null, listening: false, paused: false, status: '', now: 0, cards: [], pinned: [], gone: [], transcript: [], updatedAt: 0 };
  private commands: Command[] = [];
  private nextCommandId = 1;
  private waiters: ((cmds: Command[]) => void)[] = [];
  private sse = new Set<http.ServerResponse>();
  private listeners = new Set<(ev: EngineEvent) => void>();
  private askTimes: number[] = [];
  server: http.Server | null = null;

  /** Follow the stream in-process (the MCP server's "wait for the next card"). */
  on(l: (ev: EngineEvent) => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  ingest(ev: EngineEvent): void {
    const s = this.state;
    s.updatedAt = Date.now();
    if ('now' in ev && typeof ev.now === 'number') s.now = Math.max(s.now, ev.now);
    switch (ev.type) {
      case 'hello':
        s.session = ev.sessionId;
        s.mode = ev.mode;
        s.title = ev.title ?? null;
        s.listening = true;
        s.paused = false;
        s.now = 0;
        s.cards = [];
        s.pinned = [];
        s.transcript = [];
        break;
      case 'segment':
        s.transcript.push(ev.segment);
        while (s.transcript.length && s.transcript[0].t1 < s.now - MAX_TRANSCRIPT_SEC) s.transcript.shift();
        break;
      case 'queue':
        s.cards = ev.items;
        s.pinned = ev.items.filter((i) => i.state === 'pinned');
        break;
      case 'item':
        if (ev.change === 'expired') {
          s.gone.push(ev.item);
          while (s.gone.length > MAX_GONE) s.gone.shift();
        }
        break;
      case 'status':
        s.status = ev.text;
        break;
      case 'paused':
        s.paused = ev.paused;
        break;
      case 'off':
        s.listening = false;
        break;
    }
    for (const l of this.listeners) l(ev);
    const line = `data: ${JSON.stringify(ev)}\n\n`;
    for (const res of this.sse) res.write(line);
  }

  /** Queue a command for the extension. Agent asks are rate-limited and labelled. */
  command(c: Omit<Command, 'id' | 'at'>): { ok: true; id: number } | { ok: false; error: string } {
    if (c.type === 'ask') {
      const now = Date.now();
      this.askTimes = this.askTimes.filter((t) => now - t < 60_000);
      if (this.askTimes.length >= ASK_RATE_PER_MIN) return { ok: false, error: `rate limit: ${ASK_RATE_PER_MIN} asks a minute` };
      if (!c.text || !c.text.trim()) return { ok: false, error: 'ask needs text' };
      this.askTimes.push(now);
    }
    if ((c.type === 'pin' || c.type === 'unpin') && !c.itemId) return { ok: false, error: `${c.type} needs itemId` };
    const cmd: Command = { ...c, id: this.nextCommandId++, at: Date.now(), by: c.by || 'agent' };
    this.commands.push(cmd);
    const w = this.waiters.splice(0);
    if (w.length) {
      const batch = this.commands.splice(0);
      for (const f of w) f(batch);
    }
    return { ok: true, id: cmd.id };
  }

  /** The extension's long-poll. */
  take(waitMs: number): Promise<Command[]> {
    if (this.commands.length) return Promise.resolve(this.commands.splice(0));
    return new Promise((resolve) => {
      const done = (cmds: Command[]) => { clearTimeout(t); resolve(cmds); };
      const t = setTimeout(() => { this.waiters = this.waiters.filter((f) => f !== done); resolve([]); }, waitMs);
      this.waiters.push(done);
    });
  }

  listen(port = 8788, host = '127.0.0.1'): Promise<number> {
    const server = http.createServer((req, res) => this.handle(req, res));
    this.server = server;
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => resolve((server.address() as { port: number }).port));
    });
  }

  close(): void {
    for (const r of this.sse) r.end();
    this.server?.close();
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
    const json = (code: number, body: unknown) => { res.writeHead(code, { ...cors, 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    try {
      if (req.method === 'POST' && url.pathname === '/events') {
        const body = JSON.parse(await readBody(req)) as { events?: EngineEvent[] };
        for (const ev of body.events ?? []) this.ingest(ev);
        json(200, { ok: true });
      } else if (req.method === 'GET' && url.pathname === '/state') {
        json(200, this.state);
      } else if (req.method === 'GET' && url.pathname === '/events') {
        res.writeHead(200, { ...cors, 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
        res.write(`data: ${JSON.stringify({ type: 'snapshot', state: this.state })}\n\n`);
        this.sse.add(res);
        req.on('close', () => this.sse.delete(res));
      } else if (req.method === 'POST' && url.pathname === '/command') {
        const body = JSON.parse(await readBody(req)) as Partial<Command>;
        const type = body.type;
        if (!type || !['ask', 'pin', 'unpin', 'pause', 'resume'].includes(type)) { json(400, { ok: false, error: 'type must be ask, pin, unpin, pause or resume' }); return; }
        json(200, this.command({ type, text: body.text, itemId: body.itemId, by: body.by }));
      } else if (req.method === 'GET' && url.pathname === '/commands') {
        const wait = Math.min(30, Math.max(0, Number(url.searchParams.get('wait') ?? 0)));
        json(200, await this.take(wait * 1000));
      } else if (req.method === 'GET' && url.pathname === '/') {
        json(200, { name: 'J-me bridge', endpoints: ['POST /events', 'GET /state', 'GET /events (SSE)', 'POST /command', 'GET /commands?wait=25'] });
      } else {
        json(404, { ok: false, error: 'not found' });
      }
    } catch (e) {
      json(400, { ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// Standalone: `node engine/src/bridge.ts [--port N]`
if (process.argv[1] && /bridge\.ts$/.test(process.argv[1])) {
  const i = process.argv.indexOf('--port');
  const port = i >= 0 ? Number(process.argv[i + 1]) : 8788;
  const b = new Bridge();
  b.listen(port).then((p) => console.log(`J-me bridge on http://127.0.0.1:${p}  (switch "share with a local agent" on in the extension's settings)`), (e) => { console.error(e.message); process.exit(1); });
}
