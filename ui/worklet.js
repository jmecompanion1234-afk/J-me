// AudioWorklet: forwards mono float32 frames to the main thread in ~100 ms batches.
class PcmForwarder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = [];
    this.len = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      this.buf.push(new Float32Array(ch));
      this.len += ch.length;
      if (this.len >= 1600) {
        const out = new Float32Array(this.len);
        let off = 0;
        for (const b of this.buf) { out.set(b, off); off += b.length; }
        this.port.postMessage(out, [out.buffer]);
        this.buf = [];
        this.len = 0;
      }
    }
    return true;
  }
}
registerProcessor('pcm-forwarder', PcmForwarder);
