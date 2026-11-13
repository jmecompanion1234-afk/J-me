# Session 2026-11-13: your documents (0.8.0) and the two search switches (0.8.1)

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

## Records

J-me records live only here, in `docs/SPEC.md` §9b, `docs/NEXT.md` and `docs/LAUNCH.md`,
plus the `project_jme_*` memory files. Nothing about J-me goes in any other repo.
