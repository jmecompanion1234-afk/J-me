// The ear, in the browser: 16 kHz float32 PCM in, transcript segments out. Silero VAD
// (onnxruntime-web, wasm) cuts speech into utterances; Moonshine (transformers.js, WebGPU
// when the browser has it, wasm otherwise) transcribes each one. Nothing leaves the device:
// the models are fetched once from the Hugging Face hub and kept in the browser cache.
import * as ort from 'onnxruntime-web/webgpu';
import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import type { TranscriptSegment } from '../../engine/src/types.ts';

export interface EarOptions {
  /** extension URL of the folder holding the VAD model and the ORT wasm files */
  vendorUrl: string;
  /** Hugging Face model id for Moonshine */
  sttModel: string;
  sampleRate: number;
  clock: () => number;
  onSegment: (seg: TranscriptSegment) => void;
  onStatus: (text: string) => void;
}

const FRAME = 512;
const CONTEXT = 64;

/** Point both runtime handles at the wasm files the extension ships; no CDN. */
export function configureRuntime(vendorUrl: string): void {
  ort.env.wasm.wasmPaths = vendorUrl;
  ort.env.wasm.numThreads = 1;
  env.backends.onnx.wasm!.wasmPaths = vendorUrl;
  env.backends.onnx.wasm!.numThreads = 1;
  env.allowLocalModels = false;
  env.useBrowserCache = true;
}

export class Ear {
  private o: EarOptions;
  private vad: ort.InferenceSession | null = null;
  private state: ort.Tensor = new ort.Tensor('float32', new Float32Array(2 * 128), [2, 1, 128]);
  private context = new Float32Array(CONTEXT);
  private sr: ort.Tensor;
  private stt: AutomaticSpeechRecognitionPipeline | null = null;
  device = 'wasm';
  private pending: Float32Array[] = [];
  private pendingLen = 0;
  /** One chain for every model run: onnxruntime-web (asyncify) does not allow concurrent runs,
   *  so VAD frames and transcriptions take turns. Frames buffer while an utterance is decoded. */
  private chain: Promise<void> = Promise.resolve();
  // utterance under construction
  private speech: Float32Array[] = [];
  private inSpeech = false;
  private silenceFrames = 0;
  private preroll: Float32Array[] = [];
  private readonly threshold = 0.5;
  private readonly minSilence: number;
  private readonly minSpeech: number;
  private readonly maxSpeech: number;
  private readonly prerollFrames = 8; // ~0.25 s

  constructor(o: EarOptions) {
    this.o = o;
    this.sr = new ort.Tensor('int64', new BigInt64Array([BigInt(o.sampleRate)]), []);
    const fps = o.sampleRate / FRAME;
    this.minSilence = Math.round(0.6 * fps);
    this.minSpeech = Math.round(0.3 * fps);
    this.maxSpeech = Math.round(18 * fps);
  }

  /** Load both models. `prefer` 'wasm' keeps speech off the GPU (when another model owns it:
   *  WebLLM loading on the same adapter breaks the ORT WebGPU session). Safe to await again. */
  async load(prefer: 'auto' | 'wasm' = 'auto'): Promise<void> {
    const wantGpu = prefer === 'auto' && !!(navigator as unknown as { gpu?: unknown }).gpu;
    if (this.vad && this.stt && (this.device === 'webgpu') === wantGpu) return;
    configureRuntime(this.o.vendorUrl);
    if (!this.vad) {
      this.o.onStatus('loading the voice detector');
      this.vad = await ort.InferenceSession.create(this.o.vendorUrl + 'silero_vad_v5.onnx', { executionProviders: ['wasm'] });
    }
    if (this.stt) { await this.stt.dispose(); this.stt = null; }
    const webgpu = wantGpu;
    this.device = webgpu ? 'webgpu' : 'wasm';
    this.o.onStatus(`loading speech recognition (${this.device}); the first time downloads it once`);
    let lastPct = -1;
    const progress = (p: { status?: string; file?: string; progress?: number }) => {
      if (p.status === 'progress' && p.file && p.progress != null && /onnx$/.test(p.file)) {
        const pct = Math.floor(p.progress / 5) * 5;
        if (pct === lastPct) return;
        lastPct = pct;
        this.o.onStatus(`downloading ${p.file.split('/').pop()} ${pct}%`);
      }
    };
    try {
      this.stt = await pipeline('automatic-speech-recognition', this.o.sttModel, {
        device: this.device as 'webgpu' | 'wasm',
        dtype: webgpu ? 'fp32' : 'q8',
        progress_callback: progress,
      });
    } catch (e) {
      if (!webgpu) throw e;
      this.o.onStatus('WebGPU failed for speech, using wasm: ' + (e as Error).message);
      this.device = 'wasm';
      this.stt = await pipeline('automatic-speech-recognition', this.o.sttModel, { device: 'wasm', dtype: 'q8', progress_callback: progress });
    }
    this.o.onStatus(`ear ready (speech on ${this.device})`);
  }

  /** Feed PCM at the configured sample rate. Frames are processed in order, asynchronously. */
  push(samples: Float32Array): void {
    this.pending.push(samples);
    this.pendingLen += samples.length;
    while (this.pendingLen >= FRAME) {
      const buf = new Float32Array(FRAME);
      let off = 0;
      while (off < FRAME) {
        const head = this.pending[0];
        const take = Math.min(head.length, FRAME - off);
        buf.set(head.subarray(0, take), off);
        off += take;
        if (take === head.length) this.pending.shift();
        else this.pending[0] = head.subarray(take);
      }
      this.pendingLen -= FRAME;
      this.chain = this.chain.then(() => this.frame(buf)).catch((e) => this.o.onStatus('vad: ' + (e as Error).message));
    }
  }

  /** Close the open utterance (source stopped). */
  flush(): void {
    this.chain = this.chain.then(() => {
      if (this.inSpeech) this.endUtterance();
    });
  }

  /** Resolves when every pushed frame has been judged and every utterance transcribed. */
  async drain(): Promise<void> {
    await this.chain;
    await this.chain;
  }

  private async frame(f: Float32Array): Promise<void> {
    if (!this.vad) return;
    const withContext = new Float32Array(CONTEXT + FRAME);
    withContext.set(this.context, 0);
    withContext.set(f, CONTEXT);
    this.context = f.slice(-CONTEXT);
    const out = await this.vad.run({ input: new ort.Tensor('float32', withContext, [1, withContext.length]), state: this.state, sr: this.sr });
    this.state = out.stateN as ort.Tensor;
    const p = (out.output as ort.Tensor).data[0] as number;
    if (p >= this.threshold) {
      if (!this.inSpeech) {
        this.inSpeech = true;
        this.speech = [...this.preroll];
      }
      this.silenceFrames = 0;
      this.speech.push(f);
      if (this.speech.length >= this.maxSpeech) this.endUtterance();
    } else if (this.inSpeech) {
      this.speech.push(f);
      if (++this.silenceFrames >= this.minSilence) this.endUtterance();
    }
    this.preroll.push(f);
    if (this.preroll.length > this.prerollFrames) this.preroll.shift();
  }

  private endUtterance(): void {
    const frames = this.speech;
    const voiced = frames.length - this.silenceFrames;
    this.inSpeech = false;
    this.silenceFrames = 0;
    this.speech = [];
    if (voiced < this.minSpeech) return;
    const samples = new Float32Array(frames.reduce((a, b) => a + b.length, 0));
    let off = 0;
    for (const b of frames) {
      samples.set(b, off);
      off += b.length;
    }
    const t1 = this.o.clock();
    const t0 = Math.max(0, t1 - samples.length / this.o.sampleRate);
    this.chain = this.chain.then(() => this.transcribe(samples, t0, t1)).catch((e) => this.o.onStatus('stt: ' + (e as Error).message));
  }

  private async transcribe(samples: Float32Array, t0: number, t1: number): Promise<void> {
    if (!this.stt) return;
    const started = Date.now();
    const r = (await this.stt(samples)) as { text: string } | { text: string }[];
    const text = (Array.isArray(r) ? r.map((x) => x.text).join(' ') : r.text).trim();
    if (!text) return;
    this.o.onSegment({ t0, t1, text });
    this.o.onStatus(`stt ${(t1 - t0).toFixed(1)} s audio in ${Date.now() - started} ms`);
  }
}
