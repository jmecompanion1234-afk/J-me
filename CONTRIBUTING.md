# Contributing

Thanks for poking at it. J-me is MIT and small on purpose. Rules that keep it that way:

- **It is a switch, not an app you operate.** No commands for the person using it. If a
  feature needs a menu, it is probably the wrong shape.
- **Local first.** Audio and transcript never leave the machine. The only things that go
  out are the lookups for cards that earned one, and whatever the person explicitly hands
  to their own AI.
- **Honest status lines.** Whatever the panel says is happening is what is happening.

## The dev loop

```
npm install
npm run build:ext          # bundles extension/src + engine/src into extension/offscreen.js
npm run check              # tsc for the engine and the extension
```

Load `extension/` unpacked at `chrome://extensions`, press reload after each build. The
engine (`engine/src/`) runs in Node 24 directly, no build step; `node engine/src/main.ts
--backtest samples/demo.txt` is a dry run over a sample transcript.

The harness plays a speech file through the whole pipeline in Playwright's Chromium:

```
npx playwright install chromium
node tools/ext_test.mjs demo.wav --brain ollama --seconds 60 [--mic] [--pause]
```

(Any 16 kHz mono wav works; branded Chrome refuses command-line extensions, so it is
Playwright's Chromium, which has no built-in model.) Use a fresh `--profile DIR` after
changing `sw.js`; a persistent profile can keep the old service worker.

Two traps worth knowing: an offscreen document in branded Chrome has no `chrome.storage`,
so everything the offscreen page needs travels in the message; and a tab-capture stream
id expires in seconds, so the stream is taken before the models load.

## Where things are

```
engine/src/        the core loop: transcript, anticipator (the brain prompt), queue (decay), providers
extension/src/     the in-browser ear (VAD + Moonshine), the brains (Ollama, built-in, WebLLM), frontier.ts
extension/         sw.js (the switches), overlay.js (the panel, both modes), panel/options pages
engine/src/bridge.ts, mcp.ts   the local agent bridge and the MCP server on top of it (docs/AGENTS.md)
docs/SPEC.md       the design and its history; docs/NEXT.md what is planned
```

## Pull requests

One change per PR, with what you saw before and after (a harness run or a screenshot of the
panel). If it touches the brain prompt, include a before/after on the same recording. Keep
commits free of personal email addresses if you care about that; the repo uses the
account's no-reply address.
