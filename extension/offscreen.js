// J-me offscreen page: the ear. Takes the captured tab audio, keeps it audible, streams
// 16 kHz PCM to the local engine over WebSocket, and relays engine events back.
let ws = null, ctx = null, stream = null;

const tell = (msg) => chrome.runtime.sendMessage({ target: 'sw', ...msg }).catch(() => {});

async function start({ streamId, engine }) {
  await stop();
  stream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
    video: false,
  });
  ctx = new AudioContext({ sampleRate: 16000 });
  await ctx.audioWorklet.addModule('worklet.js');
  const src = ctx.createMediaStreamSource(stream);
  // Capturing a tab mutes it for the user unless the capturer plays it back.
  src.connect(ctx.destination);
  const node = new AudioWorkletNode(ctx, 'pcm-forwarder');
  src.connect(node);

  const sock = new WebSocket(engine);
  sock.binaryType = 'arraybuffer';
  try {
    await new Promise((resolve, reject) => {
      sock.onopen = resolve;
      sock.onerror = () => reject(new Error('engine not reachable'));
    });
  } catch (e) {
    await stop();
    throw e;
  }
  ws = sock;
  ws.send(JSON.stringify({ type: 'start' }));
  ws.onmessage = (e) => tell({ type: 'event', ev: JSON.parse(e.data) });
  ws.onclose = () => { if (ws === sock) { ws = null; tell({ type: 'engine-down' }); } };
  node.port.onmessage = (e) => { if (ws && ws.readyState === 1) ws.send(e.data); };
  stream.getAudioTracks()[0].onended = () => tell({ type: 'engine-down' });
}

async function stop() {
  const w = ws; ws = null;
  if (w && w.readyState === 1) { try { w.send(JSON.stringify({ type: 'stop' })); } catch {} }
  if (w) w.close();
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  if (ctx) await ctx.close().catch(() => {});
  ctx = null;
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || msg.target !== 'offscreen') return;
  if (msg.type === 'start') start(msg).then(() => reply({ ok: true }), (e) => reply({ ok: false, error: e.message }));
  else if (msg.type === 'stop') stop().then(() => reply({ ok: true }));
  else if (msg.type === 'ws') { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg.msg)); reply({ ok: true }); }
  else reply({ ok: false });
  return true;
});
