# Session log: 2026-11-11 to 11-12, launch day

What was built, ruled, measured and left open, in order. The spec (`docs/SPEC.md`) carries the
design reasoning; this is the day's record. J-me is a separate project from anything else on
this machine and keeps its own records here.

## Releases, in order

| Version | What |
|---|---|
| 0.2.0 | Everything in the browser: Silero VAD + Moonshine ear, the engine, a brain picked from Ollama / Chrome built-in / WebLLM. Public push blocked by a secret-scan false positive on a transformers.js class name; cleared by hand. |
| 0.2.0 fixes | Two bugs only a real click in real Chrome could show: an offscreen document has no `chrome.storage` in branded Chrome; a tab-capture stream id expires in seconds, so the stream is taken before the models load. |
| 0.3.0 | Prompt cards with an "Ask ChatGPT / Claude / Perplexity" hand-off; the picture strip (Wikimedia Commons + Wikipedia lead image); the side panel with the microphone switch; the settings page. |
| 0.3.1 | Cards and pictures render in place (no flicker); the icon opens the side panel as the big view; the on-page panel becomes a setting. Then: open the side panel synchronously on the click (an await spends the gesture). |
| 0.4.0 | The video cue: a video strip (YouTube's results page parsed, keyless), an embedded player in the side panel, the media item kind made real. |
| 0.4.1 | The page's title, author and description are read on start and given to the brain as context. |
| 0.4.2 | The star toggles off again (unpin, with a fresh moment). |
| 0.5.0 | Answers inside the card with the user's own key (OpenAI, Anthropic, or any OpenAI-compatible server such as Ollama); the AI hand-off opens in a window beside the video. |
| 0.5.1 | Pause: the cards hold still, the transcript keeps flowing, resume catches the brain up on what was said. |
| 0.5.2 | The on-page panel appears only when no side panel is actually showing. |
| 0.6.0 | The agent bridge (`engine/src/bridge.ts`) and the MCP server (`engine/src/mcp.ts`): nine tools, docs/AGENTS.md. |
| 0.6.1 | Links open in a reader window on the right half of the screen, the video window tiled to the left. |
| 0.7.0 | The calculator (`engine/src/numbers.ts`): contradictory figures become a math card with the arithmetic, no model; spoken figures get priority as searches. |
| 0.7.1 | A math card looks like a flag: red, pinned on arrival, at the top, the title bar flashes. |

Public repo: https://github.com/jmecompanion1234-afk/J-me. The direct download link
(`releases/latest/download/J-me-extension.zip`) always serves the newest release.

## Rulings (the maintainer)

- "ok lets try 2 with 1 and 3 as backup": everything in the extension; a hosted page and a
  one-file tray installer are the backups, untouched.
- Build order after the first post: video cue first, then gameplan music/lyrics and the
  internal RAG (`docs/NEXT.md`). Then, out of order because the community asked for it in
  spirit: the bridge and the MCP server before the RAG.
- Framing for the public: students, lecturers, podcasters, journalists, interviewers; fair,
  instant fact-checking of the content and of yourself. The Rogan/Jamie origin stays one line.
- Name contingency: keep J-me; drop the comparison line first if anyone objects; the backup
  name is **Ribbethole** (frog + rabbit hole; no existing use found). Facker was considered
  and set aside.
- Commit identity: the J-me account's no-reply address, never the gmail. The public history
  was re-authored once to fix this.

## Measured

- Moonshine on WebGPU: about 0.1 s of compute per second of speech; 41/41 utterances correct
  on the 148 s demo in the harness.
- Ollama 7B: cards a few seconds behind the talk. WebLLM 3B on the laptop's integrated
  graphics: 30 to 45 s behind (Chromium on Windows ignores the fast-GPU request).
- The calculator's unit cases: 4 of 4 fallacies caught, 0 false flags on 7 true sentences.
- Real tests by the maintainer: tab capture on YouTube, the built-in Chrome brain ("looks great"), the
  microphone on a real phone call ("pulled up useful links about what we were talking
  about"), the side panel, the pause, answer-inside with Ollama, the calculator.

## The first public post

Posted 2026-11-11 to the AI-builders community on Skool (paid,
Claude Code / Codex builders). First comments from the owner: "Dude this is fuckin
genius", "I love this", setting it up to run in a live call, will file issues and PRs.
`CONTRIBUTING.md` was added that night. Issues are enabled on the repo.

## Open

- Reports from the thread: the first issues and PRs; the microphone on a live call by
  someone else; pictures on YouTube pages (a page's content policy can block images drawn
  by the on-page panel; the side panel never has that problem).
- Music and lyric inference, and the internal RAG, as gameplanned in `docs/NEXT.md`. Order
  to be decided by what the thread asks for first.
- The Chrome Web Store listing (one-click install) once the first feedback round is in.
- A Mac test; Firefox; the phone build. All collaborator-shaped.

## Traps worth remembering (also in CONTRIBUTING.md)

- Branded Chrome refuses `--load-extension` even with the kill-switch flag; only Playwright's
  Chromium loads the extension from the command line, and it has no built-in model.
- A persistent test profile can keep a stale service worker after `sw.js` changes; use a
  fresh profile directory.
- Playwright's Chromium ignores the fake-microphone flags here; a mic test means playing the
  wav through the speakers into the real mic.
- GitHub's secret scanner flags a 32-character class name inside the minified transformers.js
  bundle as a Mistral key; it is a false positive to approve once.
