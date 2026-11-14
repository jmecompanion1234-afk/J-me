# Session 2026-11-13: your documents (0.8.0), the two search switches (0.8.1), spoken cues (0.9.0)

## What was built

- **0.8.0, your own documents.** The settings page reads a chosen folder once into
  IndexedDB; the offscreen page builds a BM25 index from it; every card searches the
  documents first and shows a hit as a green paragraph block; the brain is told which
  documents are on hand. Released by the maintainer as v0.8.0.
- **0.8.1, the two search switches.** The maintainer: "give it a toggle for rag mode and one for
  internet mode". Two pills in the J-me bar, 📄 docs and 🌐 web, also on the settings page.
  They are stored (`searchDocs`, `searchWeb`), sent with `start`, and forwarded live as a
  `modes` message, so a flip takes effect on the next card. The local answer and "Answer
  here" now see the matching document paragraphs and are asked to name the document.
- **`samples/docs/`**: four short exhibit-team files that go with the demo transcript (two
  friends on the Antikythera mechanism): exhibit notes, the Library of Alexandria panel
  draft, minutes of 1 November, a reading list. Choose that folder in settings to try it.
- **Harness**: `--docs [DIR]` seeds a folder, `--modes docs,web` sets the switches,
  `--shots DIR` saves side-panel screenshots as it runs and opens a card with a document
  hit for the last one.

## Test, both switches on, Ollama qwen2.5:7b

Demo transcript (2:28), `samples/docs` seeded, Playwright Chromium:

| measure | result |
|---|---|
| cards live at the end | 12 |
| cards carrying a document paragraph | 12 of 12 |
| web results, pictures, videos | present on the lookups and searches |
| nodes kept across ticks | 12/12 cards, 16/16 pictures |

Hits were the right ones: the Clickspring card pulled the reading list and the minutes
(the video loop permission), the games-dial card pulled the exhibit notes, the Library of
Alexandria cards pulled the panel draft. The first screenshot run showed the two pills lit
in the bar beside the pause button.

The second screenshot run, after the answer-from-documents change, was stopped by the
Claude Code memory monitor while the machine was low on memory (the maintainer's own Chrome held
8 GB across 33 processes). The Node replay of the same transcript with `--docs samples/docs
--fetch` ran clean afterwards, and the type check passes. The screenshots for the Skool
thread wait for a rerun.

## 0.9.0: spoken cues

The maintainer, after watching a big podcast's host ask a guest to text them an image: a trigger
phrase like "Let's ask Perplexity X" that turns the next question into a prompt, and "pull up
an image of so and so" that queues pictures. Built as `engine/src/cues.ts`: ask <AI> …,
pull up / show me a picture of …, what does … look like, pull up a video of …, and a
sentence-opening pull up / look up the …. A cue fires on its segment, ahead of the brain, and
the card is pinned; the Ask button goes to the AI that was named; a picture cue gets eight
pictures and no videos. Twenty sentences in `tools/cues_check.mjs` (14 fire, 6 must stay
quiet). The calculator also learned that one "N% of the <whole> are" opening a breakdown
shares the whole with the bare percentages after it.

### The spoken demo

`samples/cues.txt` is a scripted two-voice episode with every cue in it, and
`tools/tts_sample.ps1` speaks it with Windows text-to-speech (David and Zira, 2:51). Run
through the extension with documents and web on, Ollama brain:

| what was said | what happened |
|---|---|
| "Let's ask Perplexity whether the Antikythera mechanism really predicted eclipses" | prompt card pinned the same second, Ask Perplexity button, answer citing "What it did (antikythera-notes.md)" |
| "pull up an image of the Saros dial" | picture card pinned, nine pictures, three document blocks |
| "35% of the fragments are gearing, 50% are case plates, and 30% are inscriptions" | red calculator card at the top: 35 + 50 + 30 = 115% |
| "Pull up a picture of Michael Wright's model" | picture card, nine pictures |
| "Pull up a video of Clickspring cutting the gears" | video card, six videos, no pictures |
| "Ask ChatGPT how a device from 100 BC would have been used" | prompt card, Ask ChatGPT button |
| "Pull up the 2006 Nature paper on the mechanism" | lookup card, the reading list's entry on it |

All six cues fired on their own segment; 12 cards live at the end, every one carrying a
document paragraph; 12/12 cards and 16/16 pictures kept across ticks. Six screenshots in
`sessions/shots/` (gitignored) for the Skool thread.

Known limits seen in the run: the speech model heard "Saros" as "sorrows", so the Commons
pictures for that card were off (the document blocks were right, because they matched
"dial"); Commons is literal, so "Michael Wright's model" brought the Wright brothers. A
picture cue would do better with the page's title added to the picture query.

## Security sweep of the public repo

Asked for after the names came out: is there a key, a `.env`, or anything personal anywhere.
Checked the whole history of the public branch (every commit, every path that ever existed),
the working tree including gitignored files, the three release zips kept locally, the git
config, the dependencies and the GitHub repo settings.

- No API key, token, password or private key in any commit, file or zip. `npm audit`: 0.
- The one GitHub secret-scanning alert (2026-11-11) is `Mistral3ForConditionalGeneration`,
  a class name in the bundled transformers library, resolved as a false positive on the day.
- Every commit and tag is authored by the repo's no-reply identity. No deploy keys, webhooks
  or Actions secrets. No source maps in the bundle. Build paths do not appear in the zips.
- Only local-state file is `jme.local.json` (the Ollama model name), gitignored. `sessions/`
  (gitignored) holds full transcripts of what J-me heard, in plain text, on the device.
- Two leftovers in the 0.1.0 how-to, gone since 0.2.0 but still in history: a local folder
  path and a LAN address. Added to the history rewrite that removes the names.
- Open, product side: the local agent bridge (off by default) answers any origin with no
  token, so a web page open in the same browser could read the live state while it is on;
  and since 0.9.0 the answer-inside-J-me request carries up to three document snippets, which
  `frontier.ts` and the how-to do not yet say. Both for the next release.

## Records

J-me records live only here, in `docs/SPEC.md` §9b, `docs/NEXT.md` and `docs/LAUNCH.md`,
plus the `project_jme_*` memory files. Nothing about J-me goes in any other repo.
