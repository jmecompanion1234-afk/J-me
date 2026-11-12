import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import type { EngineEvent, Mode } from './types.ts';
import { Engine, type EngineOptions } from './engine.ts';
import { LiveSource } from './sources/live.ts';
import { SessionLog, newSessionId } from './session_log.ts';
import { LocalDocs } from './providers/localdocs.ts';

export interface ServeOptions {
  port: number;
  host: string;
  uiDir: string;
  modelsDir: string;
  sessionsDir: string;
  mode: Mode;
  docsDir?: string;
  /** brain, window and cadence; mode and docs come from the fields above */
  engine?: Partial<EngineOptions>;
  log: (line: string) => void;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

/**
 * Phase A server: serves the UI, takes microphone PCM over WebSocket, broadcasts engine
 * events to every connected page. One engine, one session, many screens.
 */
export async function serve(o: ServeOptions): Promise<void> {
  const sessionId = newSessionId(o.mode);
  const log = new SessionLog(o.sessionsDir, sessionId);
  let docs: LocalDocs | undefined;
  if (o.docsDir) {
    docs = new LocalDocs(o.docsDir);
    const n = await docs.index();
    o.log(`local docs: ${n} chunks indexed from ${o.docsDir}`);
  }
  const engine = new Engine({ ...(o.engine ?? {}), mode: o.mode, docs });
  const started = Date.now();
  const clock = () => (Date.now() - started) / 1000;
  const sockets = new Set<WebSocket>();
  const broadcast = (ev: EngineEvent) => {
    const s = JSON.stringify(ev);
    for (const ws of sockets) if (ws.readyState === ws.OPEN) ws.send(s);
  };
  engine.on((ev) => {
    log.write(ev);
    if (ev.type !== 'queue') o.log(describe(ev));
    broadcast(ev);
  });
  setInterval(() => engine.tick(clock()), 1000).unref();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    let file = url.pathname === '/' ? '/index.html' : url.pathname;
    file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
    const full = path.join(o.uiDir, file);
    if (!full.startsWith(o.uiDir)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = await fs.readFile(full);
      res.writeHead(200, { 'content-type': MIME[path.extname(full)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });

  const wss = new WebSocketServer({ server });
  wss.on('connection', (ws) => {
    sockets.add(ws);
    let live: LiveSource | null = null;
    ws.send(JSON.stringify({ type: 'hello', mode: o.mode, sessionId, now: clock() } satisfies EngineEvent));
    ws.send(JSON.stringify({ type: 'queue', now: clock(), items: engine.queue.snapshot() } satisfies EngineEvent));
    for (const s of engine.transcript.window(clock(), 120)) ws.send(JSON.stringify({ type: 'segment', segment: s } satisfies EngineEvent));
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        if (!live) {
          live = new LiveSource({
            modelsDir: o.modelsDir,
            sampleRate: 16000,
            numThreads: 4,
            clock,
            onSegment: (seg) => void engine.addSegment(seg),
            onStatus: (t) => engine.status(t),
          });
          engine.status('microphone connected');
        }
        const buf = data as Buffer;
        live.push(new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)));
        return;
      }
      let msg: { type: string; id?: string; text?: string };
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (msg.type === 'pin' && msg.id) engine.pin(msg.id);
      else if (msg.type === 'unpin' && msg.id) engine.unpin(msg.id);
      else if (msg.type === 'pull' && msg.id) {
        const it = engine.pull(msg.id);
        if (it) ws.send(JSON.stringify({ type: 'item', now: clock(), item: it, change: 'pulled' } satisfies EngineEvent));
      } else if (msg.type === 'ask' && msg.text) engine.ask(msg.text);
      else if (msg.type === 'pause') engine.pause();
      else if (msg.type === 'resume') void engine.resume();
      else if (msg.type === 'start') {
        // The switch flipped on: a new listen starts from an empty queue.
        engine.reset();
        engine.status('listening');
      } else if (msg.type === 'stop') {
        live?.flush();
        engine.status('microphone stopped');
      }
    });
    ws.on('close', () => {
      sockets.delete(ws);
      live?.flush();
    });
  });

  await new Promise<void>((resolve) => server.listen(o.port, o.host, resolve));
  o.log(`J-me listening at http://localhost:${o.port}  (session ${sessionId}, log ${log.file})`);
}

function describe(ev: EngineEvent): string {
  switch (ev.type) {
    case 'segment':
      return `  [${ev.segment.t0.toFixed(0)}s] ${ev.segment.text}`;
    case 'item':
      return `  ${ev.change.padEnd(7)} ${ev.item.kind.padEnd(6)} ${ev.item.text}  (score ${ev.item.score.toFixed(2)})`;
    case 'status':
      return `  · ${ev.text}`;
    case 'error':
      return `  ! ${ev.text}`;
    default:
      return `  ${ev.type}`;
  }
}
