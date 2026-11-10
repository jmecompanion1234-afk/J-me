# How to use J-me

J-me listens to whatever is playing or being said, and keeps a short queue of the
searches and questions the conversation is about to need. Items fade as the talk moves
on. Anything still in the queue is one tap away, with the links already fetched.

There are three ways to switch it on. All three feed the same engine on the laptop.

## 1. The browser switch (the one to use for videos and calls)

Works in Chrome and Edge on the laptop, on any tab: YouTube, a podcast site, a web call.

1. Start the engine: double-click `J-me.cmd` in the J-me folder. A small window
   titled "J-me engine" opens and stays minimized. Leave it.
2. On the tab with the video or call, click the yellow **J-me** icon in the toolbar.
   The badge reads **ON** and a J-me panel appears in the corner of the page.
3. Watch. Cards appear a few seconds behind the talk and fade as it moves on.
   - Tap a card to open its links.
   - Star a card to keep it from fading.
   - Type in the Ask bar to jump the queue with your own question.
   - Drag the panel by its title bar. The dash collapses it, the × hides it.
   - If the player goes fullscreen, the panel comes along.
4. Click the icon again to stop.

The tab keeps playing out loud the whole time.

**Loading the extension, once.** In Chrome open `chrome://extensions` (Edge:
`edge://extensions`), turn on **Developer mode** (top right), press **Load unpacked**,
and choose the `extension` folder inside your J-me clone. Pin the J-me icon
to the toolbar. If the badge shows **!** after a click, hover the icon: the tooltip says
why, usually that the engine is not running.

## 2. The page switch (any source, including the room)

1. Double-click `J-me.cmd`. The queue page opens at http://localhost:8787.
2. Pick a source:
   - **Media**: one tab, window or screen. The browser asks which; tick "share audio".
   - **The room**: the laptop microphone.
   - **Speakers and mic**: everything coming out of the speakers plus the room. Pick
     "Entire screen" and tick "Share system audio". Good for a call or a watch-along.
3. Flip the switch on. The status next to the name reads "listening".
4. Press **Float** to pop J-me out into a small window that stays on top of everything.
   Drag it over the video. Closing it puts J-me back on the page.
5. Flip the switch off when done. Flipping on again starts a fresh queue.

## 3. The phone or tablet as a second screen

The laptop listens; the phone shows the same queue live.

1. On the laptop, start J-me by way 1 or way 2.
2. On the phone, on the same Wi-Fi, open **http://<your computer's LAN address>:8787** in the browser.
   (That is the laptop's address on the home network. If the laptop is on a different
   network, run `ipconfig` on it and use the "IPv4 Address" of the Wi-Fi adapter.)
3. The queue follows the laptop. Tap to pull up, star to pin, type to ask.

The phone cannot listen on its own yet: browsers only allow the microphone on a secure
connection, and the phone app is not built. The switch on the phone's page will say
"audio failed"; ignore it and use the laptop as the ear.

Anyone on the same Wi-Fi can open that page while the engine is running. Fine at home;
do not run it on public Wi-Fi.

## 4. A recorded episode (for podcasters and lecturers)

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

- **The engine** (the "J-me engine" window) does the listening: speech to text, the
  anticipator model, the queue, the web lookups. It runs on the laptop. Ollama must be
  running with the `qwen2.5:7b` model pulled.
- **The switch** is whichever front end you use: the extension panel, the page, or the
  phone. They all show the same queue.
- Audio, transcript and the model never leave the laptop. The only thing that goes out
  is the web search for items that earn one.

## When something is off

- **Nothing appears for a long time.** The first cards take about 15 seconds of speech.
  Check the engine window is open and that Ollama is running.
- **"engine not running"** in the panel: double-click `J-me.cmd`, then click the switch
  again.
- **"no audio in that share"**: the picker gave a window without audio. Pick the tab
  itself, or "Entire screen" with the audio box ticked.
- **Odd cards** (a sung rhythm taken as a title, a name misheard): the model heard it
  that way. Star what matters, let the rest fade.
