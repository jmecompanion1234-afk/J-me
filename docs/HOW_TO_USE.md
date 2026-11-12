# How to use J-me

J-me listens to whatever is playing or being said, and keeps a short queue of the
searches and questions the conversation is about to need. Items fade as the talk moves
on. Anything still in the queue is one tap away, with the links already fetched.

There are three ways to switch it on. The first needs nothing installed but the extension.

Every card carries three things: the web links, an **Ask ChatGPT** (or Claude, or
Perplexity) button that opens the question in your own AI with the moment baked in, and
the pictures that feed the strip across the top of the panel. Purple-edged cards are
questions the talk raised, for your AI rather than a search.

## 1. The browser switch (the one to use)

Works in Chrome and Edge, on any tab: YouTube, a podcast site, a web call. Everything
runs inside the browser: the ear, the brain and the queue. There is no program to start.

**Loading the extension, once.** Unzip the release (or clone the repository). In Chrome
open `chrome://extensions` (Edge: `edge://extensions`), turn on **Developer mode** (top
right), press **Load unpacked**, and choose the `extension` folder. Pin the J-me icon to
the toolbar. Right after install J-me downloads its models in the background, once:
about 100 MB for speech and, unless the browser has a built-in model or Ollama is running,
about 1 GB for the brain. Give it a few minutes on first install.

Then, every time:

1. On the tab with the video or call, click the yellow **J-me** icon in the toolbar.
   The badge reads **ON** and J-me opens in the browser's side panel, beside the page.
   Drag the panel's edge to make it as wide as you like, half the screen if you want.
   The panel's status line names the ear and the brain in use. (Settings can add a small
   panel on the page itself, which follows the video into fullscreen.)
2. Watch. Cards appear a few seconds to half a minute behind the talk, depending on the
   brain, and fade as it moves on.
   - Tap a card to open its links.
   - Star a card to keep it from fading.
   - Type in the Ask bar to jump the queue with your own question.
   - The on-page panel, when enabled: drag it by its title bar, the dash collapses it,
     the × hides it, and it follows the player into fullscreen.
3. Click the icon again to stop.

The tab keeps playing out loud the whole time.

**A call in another app, or the room: the microphone.** Right-click the J-me icon and
choose **Open the J-me panel**. The side panel has a **Microphone** switch; flip it and
J-me listens to the mic instead of a tab, with the cards in the panel. For Zoom or Teams
on the desktop this hears you directly and the others through your speakers, so you can
check yourself as you go. Chrome asks for the microphone once, on the settings page (⚙
in the panel, or the extension's Options). The panel also shows the cards while a tab is
being listened to, if you prefer it to the overlay.

**Settings** (⚙ in the panel): which AI the cards hand off to, the microphone
permission, and which brain to use.

**Which brain.** J-me picks the best brain it can find, in this order:

1. **Ollama on this machine**, when it is running with a model pulled (the developer
   install below gives you this: the 7B brain, the one J-me was tuned on).
2. **The browser's built-in model** (Chrome 138 or newer on a machine Chrome judges
   able to run it; Chrome downloads it once).
3. **A small model inside the browser** (Qwen 2.5 1.5B through WebLLM, on the GPU
   through WebGPU). The fallback that works anywhere with WebGPU. Slower and simpler
   than the others: expect cards 15 to 40 seconds behind the talk.

To force one, pick it on the settings page.

**Web lookups in the browser** use Wikipedia and DuckDuckGo's Instant Answer API, both
open; **pictures** come from Wikimedia Commons and the Wikipedia article's own image.
The developer install also runs full web searches.

## 2. The page switch (any source, including the room; needs the developer install)

1. Double-click `J-me.cmd`. The queue page opens at http://localhost:8787.
2. Pick a source:
   - **Media**: one tab, window or screen. The browser asks which; tick "share audio".
   - **The room**: the laptop microphone.
   - **Speakers and mic**: everything coming out of the speakers plus the room. Pick
     "Entire screen" and tick "Share system audio". Good for a call in Zoom or Teams.
3. Flip the switch on. The status next to the name reads "listening".
4. Press **Float** to pop J-me out into a small window that stays on top of everything.
   Drag it over the video. Closing it puts J-me back on the page.
5. Flip the switch off when done. Flipping on again starts a fresh queue.

## 3. The phone or tablet as a second screen (developer install)

The laptop listens; the phone shows the same queue live.

1. On the laptop, start J-me by way 2 with `J-me-shared.cmd`.
2. On the phone, on the same Wi-Fi, open **http://<laptop address>:8787** in the
   browser (`ipconfig` on the laptop shows the "IPv4 Address" of the Wi-Fi adapter).
3. The queue follows the laptop. Tap to pull up, star to pin, type to ask.

The phone cannot listen on its own yet: browsers only allow the microphone on a secure
connection. Anyone on the same Wi-Fi can open that page while the engine is running.
Fine at home; do not run it on public Wi-Fi.

## 4. A recorded episode (for podcasters and lecturers; developer install)

Run J-me over a finished recording's captions and publish a companion page viewers open
next to the episode. This is still command-line, developer shape:

```
python tools/yt_captions.py "https://www.youtube.com/watch?v=VIDEO_ID"
node engine/src/main.ts --backtest samples/VIDEO_ID.json --fetch
node engine/src/main.ts --companion sessions/backtests/VIDEO_ID.map.json --youtube VIDEO_ID --title "Episode"
```

Open `sessions/backtests/VIDEO_ID.companion.html`, press play, and the queue follows the
video. Review mode on that page lets the host drop or keep items and export the result.

## What is running where

- **The extension** runs the ear (Silero voice detection and Moonshine speech
  recognition, on the GPU through WebGPU or on the CPU), the queue, and a brain, all in
  the browser. Audio and transcript never leave the machine.
- **The developer install** (`npm run setup`, `J-me.cmd`) adds the Node engine with the
  7B brain through Ollama, the page switch, the phone screen and the recorded-episode
  tools. When it is installed and Ollama is running, the extension uses that brain too.
- The only things that go out are the lookups for items that earn one (Wikipedia,
  DuckDuckGo), and the one-time model downloads.

## When something is off

- **The status line says "downloading" or "loading" for a long time.** First run. The
  models are 100 MB to 1 GB. Leave the tab; the panel updates as it goes.
- **"no brain".** The browser has no WebGPU and no built-in model, and Ollama is not
  running. Use Chrome or Edge on a machine with a GPU, or do the developer install.
- **Nothing appears for a long time.** The first cards take about 15 seconds of speech,
  plus the brain's thinking time (a second with Ollama on a GPU, up to 40 with the
  in-browser model). Check the status line in the panel.
- **The badge shows "!"** after a click: hover the icon, the tooltip says why.
- **"microphone not allowed".** Open the settings page (⚙ in the panel) and press
  *Allow the microphone*. Chrome remembers it.
- **No pictures for a card.** Wikimedia had nothing for that phrase. Named things and
  places get pictures; abstract questions mostly do not.
- **Odd cards** (a sung rhythm taken as a title, a name misheard): the model heard it
  that way. Star what matters, let the rest fade.
