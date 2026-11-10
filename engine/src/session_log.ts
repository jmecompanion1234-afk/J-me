import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import path from 'node:path';
import type { EngineEvent } from './types.ts';

/** Append-only JSONL log of everything the engine saw and decided, one file per session.
 *  This is the data the decay rule gets tuned from. Stays on the device. */
export class SessionLog {
  private stream: WriteStream;
  readonly file: string;

  constructor(dir: string, sessionId: string) {
    mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, `${sessionId}.jsonl`);
    this.stream = createWriteStream(this.file, { flags: 'a' });
  }

  write(ev: EngineEvent): void {
    this.stream.write(JSON.stringify({ at: new Date().toISOString(), ...ev }) + '\n');
  }

  close(): Promise<void> {
    return new Promise((resolve) => this.stream.end(resolve));
  }
}

export function newSessionId(prefix = 'session'): string {
  return `${prefix}_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
}
