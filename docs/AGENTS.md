# J-me for agents

J-me produces a live, structured stream on your machine: the transcript as timed segments,
and cards being born, fetched, pinned, answered and let go. The **bridge** exposes that
stream locally, and the **MCP server** turns it into tools any agent runtime speaks
(Claude Code, Codex, Cursor, Cortext, anything that loads MCP servers). Nothing leaves the
machine. The person still only clicks the icon.

## Switch it on

1. In the extension's settings (⚙ in the side panel): tick **Share with a local agent**.
   It points at `http://127.0.0.1:8788` by default.
2. Run the MCP server. It starts the bridge itself:

```
node engine/src/mcp.ts
```

   Or run just the bridge, for HTTP clients: `node engine/src/bridge.ts`.

3. Register it with your agent runtime. Claude Code:

```
claude mcp add jme -- node C:/path/to/J-me/engine/src/mcp.ts
```

   Any runtime that reads an MCP config file:

```json
{ "mcpServers": { "jme": { "command": "node", "args": ["C:/path/to/J-me/engine/src/mcp.ts"] } } }
```

Needs Node 24 or newer (it runs the TypeScript directly). The extension starts sending the
moment you click the icon; the bridge keeps the last hour of transcript and every live card.

## The tools

| Tool | What it does |
|---|---|
| `jme_state` | listening or not, to what, paused, status line, counts |
| `jme_cards` | `live`, `pinned` or `gone` cards: text, why, the moment, links, pictures, videos, answer |
| `jme_transcript` | the timed segments, optionally only the last N seconds, plus a plain-text join |
| `jme_ask` | put a question or search into the queue; it appears as a card marked "asked by <you>", pinned, links fetched. 6 a minute. |
| `jme_pin` / `jme_unpin` | star a card, or let it fade |
| `jme_pause` / `jme_resume` | hold the cards still; resume catches the brain up |
| `jme_wait` | block until the next card is ready, born or pinned, or the next segment arrives (up to 60 s) |

## The HTTP bridge, for anything that is not MCP

```
GET  /state                 the current state as JSON
GET  /events                text/event-stream of every engine event (starts with a snapshot)
POST /command               {"type":"ask","text":"...","by":"my-agent"}  also pin/unpin (itemId), pause, resume
```

`POST /events` is the extension's own feed; `GET /commands?wait=25` is its long-poll. You
can post events yourself (a transcript from another source) and J-me's agents-side readers
will not know the difference, but the cards only come from a running J-me.

## Things worth building on it

- **The follow-up list.** When the call ends, `jme_cards pinned` with the moment and the
  links already fetched. The sentence that earned each one is right there.
- **A star as a trigger.** `jme_wait for=pinned` in a loop: the person stars "send Dave the
  Q3 numbers" and the agent does it.
- **An agent that listens too.** `jme_transcript sinceSec=120` every minute, decide, and
  `jme_ask` what the humans should see. The queue becomes a shared surface between the
  people on the call and the agents working for them. Agent asks are labelled and
  rate-limited so the human stream stays the human stream; the pause button is the
  human's override.
- **The person's documents.** When they have chosen a folder in settings, a card's `links`
  include hits with `source: "docs"`: the paragraph from their own file. An agent can quote
  it back with the file name.
- **The meeting record.** `jme_transcript` plus `jme_cards gone` at the end gives a
  timeline of what was said and what was worth pulling up when.

## Rules for well-behaved agents

- Ask only what the people listening would want to see. A card is a tap on the shoulder.
- Say who is asking (`by`). It shows on the card.
- Do not pin on their behalf unless they asked you to.
- The transcript is the person's conversation. Keep it on their machine unless they say
  otherwise.
