import { createRequire } from 'node:module';
import path from 'node:path';
import type { TranscriptSegment } from '../types.ts';

const require = createRequire(import.meta.url);

/**
 * Live source: 16 kHz mono float32 PCM comes in (from the browser over WebSocket), Silero VAD
 * cuts it into utterances, Moonshine transcribes each one on this device. One instance per
 * connected microphone.
 */
export interface LiveOptions {
  modelsDir: string;
  sampleRate: number;
  numThreads: number;
  onSegment: (seg: TranscriptSegment) => void;
  /** returns the session clock in seconds */
  clock: () => number;
  onStatus?: (text: string) => void;
}

interface SherpaModule {
  Vad: new (cfg: unknown, bufferSec: number) => {
    acceptWaveform(s: Float32Array): void;
    isEmpty(): boolean;
    front(): { start: number; samples: Float32Array };
    pop(): void;
    flush(): void;
  };
  OfflineRecognizer: new (cfg: unknown) => {
    createStream(): { acceptWaveform(w: { samples: Float32Array; sampleRate: number }): void };
    decode(s: unknown): void;
    getResult(s: unknown): { text: string };
  };
}

let shared: { rec: InstanceType<SherpaModule['OfflineRecognizer']>; sherpa: SherpaModule } | null = null;

function loadShared(modelsDir: string, numThreads: number): NonNullable<typeof shared> {
  if (shared) return shared;
  const sherpa = require('sherpa-onnx-node') as SherpaModule;
  const m = path.join(modelsDir, 'sherpa-onnx-moonshine-base-en-int8');
  const rec = new sherpa.OfflineRecognizer({
    modelConfig: {
      moonshine: {
        preprocessor: path.join(m, 'preprocess.onnx'),
        encoder: path.join(m, 'encode.int8.onnx'),
        uncachedDecoder: path.join(m, 'uncached_decode.int8.onnx'),
        cachedDecoder: path.join(m, 'cached_decode.int8.onnx'),
      },
      tokens: path.join(m, 'tokens.txt'),
      numThreads,
      provider: 'cpu',
      debug: 0,
    },
  });
  shared = { rec, sherpa };
  return shared;
}

export class LiveSource {
  private vad;
  private rec;
  private pending: Float32Array[] = [];
  private pendingLen = 0;
  private readonly chunk = 512;
  busy = false;
  private o: LiveOptions;

  constructor(o: LiveOptions) {
    this.o = o;
    const { rec, sherpa } = loadShared(o.modelsDir, o.numThreads);
    this.rec = rec;
    this.vad = new sherpa.Vad(
      {
        sileroVad: {
          model: path.join(o.modelsDir, 'silero_vad.onnx'),
          threshold: 0.5,
          minSilenceDuration: 0.6,
          minSpeechDuration: 0.3,
          maxSpeechDuration: 18,
          windowSize: 512,
        },
        sampleRate: o.sampleRate,
        numThreads: 1,
        provider: 'cpu',
        debug: 0,
      },
      30,
    );
  }

  /** Feed PCM float32 samples at the configured sample rate. */
  push(samples: Float32Array): void {
    this.pending.push(samples);
    this.pendingLen += samples.length;
    while (this.pendingLen >= this.chunk) {
      const buf = new Float32Array(this.chunk);
      let off = 0;
      while (off < this.chunk) {
        const head = this.pending[0];
        const take = Math.min(head.length, this.chunk - off);
        buf.set(head.subarray(0, take), off);
        off += take;
        if (take === head.length) this.pending.shift();
        else this.pending[0] = head.subarray(take);
      }
      this.pendingLen -= this.chunk;
      this.vad.acceptWaveform(buf);
    }
    this.drainSegments();
  }

  /** Force out whatever speech is buffered (mic stopped). */
  flush(): void {
    this.vad.flush();
    this.drainSegments();
  }

  private drainSegments(): void {
    while (!this.vad.isEmpty()) {
      const seg = this.vad.front();
      this.vad.pop();
      const dur = seg.samples.length / this.o.sampleRate;
      const t1 = this.o.clock();
      const t0 = Math.max(0, t1 - dur);
      const started = Date.now();
      const stream = this.rec.createStream();
      stream.acceptWaveform({ samples: seg.samples, sampleRate: this.o.sampleRate });
      this.rec.decode(stream);
      const text = this.rec.getResult(stream).text.trim();
      if (text) {
        this.o.onSegment({ t0, t1, text });
        this.o.onStatus?.(`stt ${dur.toFixed(1)} s audio in ${Date.now() - started} ms`);
      }
    }
  }
}
