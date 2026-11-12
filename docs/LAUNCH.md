# Launch notes

Status: draft, 2026-11-10. J-me is a useful tool first; the launch is about getting it into
hands and finding out which of hosts, viewers or students keep using it. Not a business
launch. Rulings from the maintainer: open source (MIT), local model, first to market matters, no
patent.

## 1. Before anything is public

- [ ] Own GitHub repository, public, MIT. Name check: "J-me" is free as a repo name;
      there is an unrelated product called Jamie (meetjamie.ai, a meeting notetaker).
      Keep the name, do not describe J-me as a notetaker.
- [ ] Third-party content out of the tree and out of history (the Lex Fridman captions
      were replaced with `samples/demo.txt`, our own writing; publish from a fresh
      history so the old file is not in the public repo).
- [ ] `npm run setup` tested on a clean machine, ideally one Windows and one Mac.
- [ ] A 60-second screen recording: a podcast tab, click the icon, cards appear, one is
      opened, one is starred, the icon is clicked off. No narration needed; captions
      on the recording are enough.
- [ ] README install path works from a `git clone` by someone who has never seen it.
- [x] Release `v0.1.0` tagged, with a zipped `extension/` attached for people who do not
      want to clone.
- [x] Release `v0.2.0`: the extension runs everything in the browser (2026-11-10). The
      zip is the product now; the clone is the developer path. The maintainer's ruling: "lets try
      2 with 1 and 3 as backup" (2 = everything in the extension, 1 = a hosted page,
      3 = a one-file tray installer).
- [x] Real tab capture works in the maintainer's Chrome 157 (2026-11-11, after two fixes only a real
      click could find: no `chrome.storage` in an offscreen document, and the tab stream
      must be taken before the models load). The brain was Ollama because it was running.
- [ ] Release `v0.3.0` (2026-11-11): prompt cards with the "Ask your AI" hand-off, the
      picture strip, the side panel with the microphone switch, the settings page.
      the maintainer's test in his Chrome: a Zoom call with the microphone on, and whether the
      pictures load on YouTube (a page's own content policy can block images drawn by
      the overlay; the side panel never has that problem).
- [ ] the maintainer tests the built-in Chrome brain by hand (quit Ollama first, or set
      `brainOrder` to `['builtin']`); the harness cannot, branded Chrome ignores
      unpacked extensions from the command line.

## 2. Where, in order

1. **GitHub** is the home. Everything links back to it.
2. **Hacker News, "Show HN".** The audience that will install a Node + Ollama tool and
   tell you exactly what is wrong with it. Post on a weekday morning US time.
3. **r/LocalLLaMA.** Local-first, private-by-default, any-model is their whole thing.
   The post should name the models and the hardware it was tuned on.
4. **r/selfhosted** and **r/privacy**, a few days later, with what changed from the first
   round of feedback.
5. **r/podcasting** and podcast-producer communities, with the companion page angle:
   run it over your episode, publish the page for your listeners.
6. **Chrome Web Store** listing for the extension. As of v0.2.0 the install story is one
   click (nothing else to install), so this moves up as soon as the first round of
   feedback is in. One-time developer registration; review takes days. The listing
   points at GitHub for the developer install.

Skip Product Hunt for now; it rewards launch theatre over users.

## 3. The one-paragraph description (use everywhere, keep consistent)

> J-me is a private, on-device "pull that up" for any conversation. It listens to the
> video, call or room, and keeps a short queue of the web searches and AI prompts the
> talk is about to need. Items fade as the conversation moves on; anything still in the
> queue is one tap away with the links already fetched. Speech recognition and the
> anticipating model run locally; nothing leaves your machine except the searches you let
> it run. Click the icon on a tab and the queue appears on the page. Run it over a
> finished episode and it writes a companion page your viewers open next to the video.

## 4. Draft: Show HN

**Title:** Show HN: J-me, a local "pull that up" buffer that listens to any video or call

**Body:**

I built a local-first version of Jamie from the Joe Rogan show. It listens to whatever
is playing in a tab (or the room) and keeps a short queue of the searches and questions
the conversation is about to need. Cards appear a few seconds behind the talk with the
sentence that earned them, links already fetched, and fade as the topic moves on. Click a
card for the links; star it to keep it; type your own question and it jumps the queue.

Everything runs on your machine: Silero VAD + Moonshine for speech, Qwen 2.5 7B via
Ollama as the "what would someone want pulled up right now" model, DuckDuckGo for the
fetch. Only the searches leave the box.

Two things I think are different from the "AI listens to your meeting" products:

- It is a switch on a tab, not an app you operate. A Chrome/Edge extension captures the
  tab's audio and draws the queue on the page itself.
- It also works over a recording: feed it an episode's captions and it writes a map of
  the whole buffer plus a companion page synced to the YouTube player, which a host can
  review and publish for viewers. Each item carries a prompt with the moment baked in,
  ready to hand to ChatGPT, Claude or Perplexity in the viewer's own account.

The interesting part to tune turned out to be the decay rule: a fresh item's recency is
1, so a score-only gate stages everything; items now need either high confidence or a
recurrence (the room coming back to the topic) before a fetch is spent. On a 2.4-hour
podcast it produced about 35 items per 10 minutes with a median lifetime of 3 minutes.

Rough edges: Windows is the daily driver, 7B needs a GPU (there is a --small path), the
phone is a second screen only for now. MIT. Would love to hear what you'd want pulled
up that it missed.

https://github.com/jmecompanion1234-afk/J-me

## 5. Draft: r/LocalLLaMA

**Title:** J-me: a local "pull that up" queue for any video or call (Moonshine + Qwen 2.5 via Ollama, MIT)

**Body:**

Built a thing I wanted: an on-device producer that listens to whatever I'm watching or
whoever I'm talking to, and keeps a decaying queue of the lookups the conversation is
about to need. Like Jamie on Rogan, but it never leaves the laptop.

Stack: Silero VAD + Moonshine base (sherpa-onnx, CPU, ~30x realtime), Qwen 2.5 7B through
Ollama for anticipation (structured JSON out, ~6 s a call on a 3070 8 GB), DuckDuckGo
HTML for fetch, BM25 over a local folder if you point it at your notes. Node 24 runs the
TypeScript directly, no build step. `--model` takes any Ollama model; 3B works on CPU
with a quality cost.

The switch is a Chrome/Edge extension (tab capture -> offscreen page -> local engine ->
overlay on the page) or a plain page that can float on top of anything. Phone on the same
Wi-Fi is a second screen.

It also runs over a transcript and writes a buffer map + a companion page synced to the
YouTube player, with a prompt per item ready for whatever model the viewer uses.

Things I'd like help with: a better dedupe than term overlap (four phrasings of the
same debate come out as four items), the prompt/media item kinds are currently gated out
of existence by the confidence floor, and a Mac test.

MIT: https://github.com/jmecompanion1234-afk/J-me

## 6. Posted

- 2026-11-11: the Skool community of AI architects (first public post). Framed for
  students, lecturers, podcasters, journalists, interviewers; brain ladder minimal to
  frontier; built-in Chrome brain described as wired, untested; ended with a call for
  feature requests and collaborators, and three planned features (music/lyric inference,
  video cue, internal RAG for meetings). Watch the thread for the first reports.

## 7. After the first week

Watch who comes back. Hosts: the product is the companion and its publishing. Viewers:
the extension. Students: lectures. The engine is the same under all three. Decide then.
