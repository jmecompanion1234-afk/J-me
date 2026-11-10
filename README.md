# J-me

**A private, on-device "pull that up" for any conversation.**

J-me listens to the video, call or room, and keeps a short queue of the web searches and
AI prompts the conversation is about to need. Items fade as the talk moves on. Anything
still in the queue is one tap away, links already fetched. Like Jamie on the Joe Rogan
show: nobody asks him to prepare, but when someone says "pull that up," it is up.

- **Local.** Speech recognition and the model that anticipates what you'll want run on
  your own machine. Audio and transcript never leave it. The only thing that goes out is
  the web search for items that earn one.
- **A switch, not a workflow.** Click the icon on a tab, the queue appears on the page.
  Click again to stop.
- **Any model you like.** The brain is local by default. Every item also carries a prompt
  with the moment baked in, ready to hand to ChatGPT, Claude or Perplexity in your own
  account.
- **For the people watching too.** Run it over a finished episode and publish a
  companion page viewers open next to the video, synced to the player.

Status: early, working, rough edges. Windows is the daily driver; macOS and Linux
launchers are included but less exercised. See [docs/HOW_TO_USE.md](docs/HOW_TO_USE.md).

## Install

You need [Node.js](https://nodejs.org) 24 or newer and [Ollama](https://ollama.com).
A GPU with about 6 GB of memory makes it feel instant; without one, use `--small`.

```
git clone https://github.com/jmecompanion1234-afk/J-me.git
cd J-me
npm install
npm run setup            # downloads the speech models (~250 MB) and pulls the brain
                         # npm run setup -- --small   for machines without a GPU
```

Then:

- **Windows:** double-click `J-me.cmd` (`J-me-shared.cmd` also lets a phone on the same Wi-Fi open the page).
- **macOS / Linux:** `./jme.sh` (`./jme.sh --shared` for the phone).

The queue page opens. Pick a source, flip the switch.

### The browser switch

Put the switch in the toolbar and the queue on the page itself. In Chrome or Edge, open
`chrome://extensions`, turn on **Developer mode**, press **Load unpacked**, pick the
`extension` folder, and pin the J-me icon. Click it on any tab with a video or call.

## What it looks like

A card appears a few seconds behind the talk, with the sentence that earned it. Open it
for the links. Star it to keep it. It fades when the conversation moves on and comes back
if the conversation does. Type a question of your own and it jumps the queue.

Run it over a recording instead:

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
      -> the switch: page, browser overlay, phone as a second screen, companion page
```

Speech: Silero VAD and Moonshine through sherpa-onnx. Brain: Qwen 2.5 through Ollama,
swappable with `--model`. Search: DuckDuckGo, no key. Optional: `--docs DIR` also searches
a folder of your own notes for every item. Design notes in [docs/SPEC.md](docs/SPEC.md).

## Layout

```
engine/src/        the core loop (Node + TypeScript, no build step)
ui/                the queue page
extension/         Chrome/Edge: toolbar switch, tab-audio ear, on-page overlay
scripts/setup.mjs  model download + Ollama check
tools/             caption fetcher for the recorded-episode path
samples/           a short transcript to try the backtest on
docs/              how to use, the design spec, the launch notes
```

## Privacy

Nothing is sent anywhere except the web search for staged items. There is no account, no
telemetry, no server. Session logs stay in `sessions/` on your machine. The shared
launchers open the page to your local network only; do not use them on public Wi-Fi.

## License

MIT.
