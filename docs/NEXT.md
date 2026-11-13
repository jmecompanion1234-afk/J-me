# Next: the two features announced as planned

Status: gameplan, 2026-11-11. The maintainer's order after the first public post: video cue first
(built, v0.4.0), then these two. Each is a feature-request thread first; nothing here has a
date. J-me is a useful tool, not a business: judge each step by what it does for a student,
a host, a lecturer, a journalist.

## 1. Music and lyric inference

**The ask.** A song plays, or someone hums or sings a line, and J-me pulls up the track and
its lyrics.

**What is actually possible on-device, in order of difficulty.**

1. **"There is music here."** A small audio classifier (YAMNet-class, runs on wasm) flags
   music versus speech. Cheap, and it also stops the speech model from transcribing a
   chorus as a sentence. Half a day. Do this first regardless.
2. **Lyrics as the query.** When music is flagged and the speech model still hears words,
   treat the words as lyrics: search them quoted, prefer lyric sites and YouTube. Moonshine
   is a speech model, so sung lyrics come out rough; a Whisper-small pass on the flagged
   stretch does better and is already available in the same runtime. The card reads
   "Sounds like: <title> by <artist>" with the video strip doing the rest. Two to three
   days, and it works for most songs with words. No fingerprint database needed.
3. **Fingerprinting a recording.** Identifying a song from its sound alone (Shazam-style)
   needs a fingerprint index of the world's music. The open indexes (AcoustID /
   Chromaprint) cover a fraction and need a server round trip of the fingerprint, which
   breaks the local rule only mildly (a fingerprint is not audio) but depends on a third
   party. Possible as an opt-in provider; not the default. A week, mostly plumbing.
4. **Humming and singing a melody.** Query-by-humming is a research problem with no
   usable open model. Out of scope. Say so when asked.

**Where it goes in the code.** A `music` item kind (or `media` with a `music` flag), a
classifier stage in `extension/src/ear.ts` ahead of the VAD, a `lyrics` provider, and the
same strips. The companion page gets a "music in this episode" row for free.

**Collaborator-shaped pieces.** The classifier integration; a lyric-site provider that
respects the sites; a test set of ten songs with and without words.

## 2. Internal RAG for inter-organizational meetings

**The ask.** In a meeting, J-me pulls up the relevant paragraph of our own documents
(contracts, specs, minutes, the wiki), not a web page.

**What exists.** The Node engine already does the single-organization version: point it at
a folder (`--docs DIR`) and every item is also searched against those files with a plain
keyword index (BM25), results marked `docs`. It is not in the extension.

**The plan, in steps that are each useful on their own.**

1. **The extension reads a folder.** DONE 2026-11-13 (v0.8.0): the settings page reads
   the chosen folder once (text, markdown, HTML, JSON, CSV; no PDF yet) and stores the
   text in IndexedDB; the offscreen page builds the same BM25 index the Node engine uses
   (`engine/src/providers/docindex.ts`); every card gets `docs` results above the web
   ones; the brain is told which documents are on hand. Still to do in this step: PDF
   (a wasm reader) and re-reading a changed folder without choosing it again.
2. **Semantic, still local.** A small embedding model in the same runtime
   (transformers.js has several) so "the indemnity clause" finds the paragraph that
   never says "indemnity". Two days. Worth it once step 1 shows people use it.
3. **Meeting sets.** A named set of documents per meeting (this client, this project),
   chosen when the microphone switch goes on. A day.
4. **Inter-organizational.** Two companies on one call, each with their own private set,
   each seeing cards from their own documents only, and optionally a shared set both
   contributed to. Nothing leaves either machine: each side runs its own J-me over its
   own folder. The only "shared" thing is a folder both agreed to put files in. That
   keeps the local rule intact and avoids building a server. The design question is who
   can see which card, and that is a conversation to have with the people who would use
   it before any code. Do not start here.

**Where it goes in the code.** `engine/src/providers/localdocs.ts` grows an embedding
option; `extension/src/docs.ts` indexes in the browser; `options.html` gets the folder
picker and the sets; cards show the `docs` source first.

**Collaborator-shaped pieces.** The in-browser PDF reader; the embedding index; a
privacy review of step 4 by someone who runs meetings between companies.

## Order

Music step 1 (the classifier) and RAG step 1 (the folder) are each a few days and each
useful alone. Do RAG step 1 first if the community's reports lean toward meetings, music
step 1 if they lean toward podcasts and content. Everything past that waits for a request.
