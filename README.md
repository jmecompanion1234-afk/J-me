# J-me

**A private, on-device "pull that up" for any conversation.**

J-me listens to the video, call or room, and keeps a short queue of the web searches and
AI prompts the conversation is about to need. Items fade as the talk moves on. Anything
still in the queue is one tap away, links already fetched. Like Jamie on the Joe Rogan
show: nobody asks him to prepare, but when someone says "pull that up," it is up.

- **Local.** Speech recognition and the model that anticipates what you'll want run on
  your own machine, inside the browser. Audio and transcript never leave it. The only
  thing that goes out is the lookup for items that earn one.
- **A switch, not a workflow.** Click the icon on a tab, the queue opens beside the page
  in the browser's side panel, as wide as you drag it. Click again to stop. Nothing to install but the extension. For a call in another app
  or the room, the side panel has a microphone switch.
- **Links, pictures, videos and questions.** Each card carries its web links, the
  pictures that go with it, and the videos, which run as two strips across the top of
  the panel as the talk moves. A video plays inside the panel when clicked.
  Questions the talk raises become cards with one button that opens them in your own
  AI (ChatGPT, Claude or Perplexity), with the moment baked in.
- **Any brain you like.** The extension finds the best one it can: Ollama if you run it,
  the browser's built-in model if it has one, else a small model in the browser itself.
  Every card also hands off to ChatGPT, Claude or Perplexity in your own account.
- **For the people watching too.** Run it over a finished episode and publish a
  companion page viewers open next to the video, synced to the player.

Status: early, working, rough edges. See [docs/HOW_TO_USE.md](docs/HOW_TO_USE.md).

## Install: the extension (Chrome or Edge, nothing else)

1. Download **[J-me-extension.zip](https://github.com/jmecompanion1234-afk/J-me/releases/latest/download/J-me-extension.zip)**
   (that link always gives the latest release) and unzip it. Or clone this repository;
   the folder is `extension/`.
2. Open `chrome://extensions` (Edge: `edge://extensions`), turn on **Developer mode**,
   press **Load unpacked**, pick the `extension` folder, and pin the J-me icon.
3. Click the icon on any tab with a video or call. The first time, J-me downloads its
   models in the background, once (about 100 MB for speech, about 1 GB for the brain
   unless the browser has a built-in model or Ollama is running). Then cards appear.
4. For Zoom, Teams or the room: right-click the icon, open the J-me panel, flip
   **Microphone**. Settings (which AI, which brain, the microphone permission) are
   behind ⚙ in that panel.

The brain, in order of preference: **Ollama** on this machine (the 7B model J-me was
tuned on; see below), the **browser's built-in model** (Chrome 138+, where available),
or **Qwen 2.5 3B inside the browser** through WebLLM on WebGPU, which works anywhere with
a GPU but is slow on integrated graphics (cards 30 to 45 seconds behind the talk). The
panel's status line says which one is running.

## The bigger brain: the developer install

Gives the extension the 7B brain and full web search, and adds the page switch (any
source, including the room, with a window that floats over anything), the phone as a
second screen, and the recorded-episode tools. You need [Node.js](https://nodejs.org) 24
or newer and [Ollama](https://ollama.com).

```
git clone https://github.com/jmecompanion1234-afk/J-me.git
cd J-me
npm install
npm run setup            # downloads the speech models (~250 MB), looks at the GPU,
                         # and pulls the brain that fits (7B with 6 GB+ of GPU memory, else 3B)
```

Then:

- **Windows:** double-click `J-me.cmd` (`J-me-shared.cmd` also lets a phone on the same Wi-Fi open the page).
- **macOS / Linux:** `./jme.sh` (`./jme.sh --shared` for the phone).

The queue page opens. Pick a source, flip the switch. With Ollama running, the extension
uses it too, automatically.

## What it looks like

A card appears a few seconds behind the talk, with the sentence that earned it. Open it
for the links. Star it to keep it. It fades when the conversation moves on and comes back
if the conversation does. Type a question of your own and it jumps the queue.

Run it over a recording instead (developer install):

```
node engine/src/main.ts --backtest samples/demo.txt                       # a 3-minute sample, dry run
python tools/yt_captions.py "https://www.youtube.com/watch?v=VIDEO_ID"   # needs youtube-transcript-api
node engine/src/main.ts --backtest samples/VIDEO_ID.json --fetch
node engine/src/main.ts --companion sessions/backtests/VIDEO_ID.map.json --youtube VIDEO_ID --title "Episode"
```

That writes a map of the whole episode's buffer and a companion page that follows the
video, which a host can review and publish for the audience.

## How it works

```
audio -> VAD -> on-device speech to text -> rolling transcript
      -> a small local model proposes what someone would want pulled up right now
      -> a queue that scores, dedupes, fetches for the confident ones, and decays
      -> the switch: browser overlay, page, phone as a second screen, companion page
```

In the extension, every stage runs in the browser: Silero VAD and Moonshine through
onnxruntime-web and transformers.js (WebGPU, or wasm on the CPU), the same engine core as
the Node version, and a brain from the list above. Lookups use Wikipedia and DuckDuckGo's
Instant Answer API; pictures come from Wikimedia Commons; videos from YouTube's own
results page, read the way a browser reads it. The Node engine adds Ollama, DuckDuckGo web search, and `--docs DIR`
to search a folder of your own notes for every item. Design notes in
[docs/SPEC.md](docs/SPEC.md).

## Layout

```
extension/         Chrome/Edge: toolbar switch, side panel (microphone), settings, on-page overlay
extension/src/     the in-browser engine (ear, brains, offscreen page), bundled by npm run build:ext
engine/src/        the core loop (Node + TypeScript, no build step), shared with the extension
ui/                the queue page (developer install)
scripts/           setup (models + Ollama) and the extension build
tools/             caption fetcher, extension test harness (Playwright)
samples/           a short transcript to try the backtest on
docs/              how to use, the design spec, the launch notes
```

Developing the extension: `npm install`, edit under `extension/src/` or `engine/src/`,
`npm run build:ext`, reload the extension. `node tools/ext_test.mjs FILE.wav --brain ollama`
plays a speech file through the whole pipeline in a Chromium with the extension loaded.

## Privacy

Nothing is sent anywhere except the lookups for staged items and the one-time model
downloads (Hugging Face for speech and the WebLLM brain; Chrome's own download for its
built-in model). There is no account, no telemetry, no server. Session logs from the
developer install stay in `sessions/` on your machine. The shared launchers open the page
to your local network only; do not use them on public Wi-Fi.

## License

MIT.
