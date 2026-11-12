// Talk to the J-me MCP server the way an agent runtime does: spawn it over stdio, list the
// tools, call a few. Feeds the bridge a fake session first so the tools have something to say.
//   node tools/mcp_probe.mjs [port]
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'node:path';

const port = Number(process.argv[2] || 8799);
const transport = new StdioClientTransport({ command: process.execPath, args: [path.resolve('engine/src/mcp.ts'), '--port', String(port)], stderr: 'pipe' });
transport.stderr?.on('data', (d) => process.stderr.write('  [server] ' + d));
const client = new Client({ name: 'probe', version: '0.0.0' });
await client.connect(transport);

const tools = await client.listTools();
console.log('tools:', tools.tools.map((t) => t.name).join(', '));

// A fake session into the bridge, as the extension would send it.
const base = `http://127.0.0.1:${port}`;
const post = (events) => fetch(`${base}/events`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ events }) });
await post([
  { type: 'hello', mode: 'media', sessionId: 'probe', now: 0, title: 'Probe episode' },
  { type: 'segment', segment: { t0: 0, t1: 4, text: 'So the Antikythera mechanism was found in 1901.' } },
  { type: 'queue', now: 5, items: [{ id: 'c1', kind: 'lookup', text: 'Antikythera mechanism', why: 'named', anchor: { t0: 0, t1: 4, text: 'found in 1901', terms: [] }, confidence: 0.9, score: 0.9, state: 'ready', touched: 4, recurrences: 0, born: 4, peak: 0.9, results: [{ title: 'Antikythera mechanism', url: 'https://en.wikipedia.org/wiki/Antikythera_mechanism', snippet: 'An ancient Greek device', source: 'wikipedia' }] }] },
  { type: 'status', now: 5, text: 'listening · probe' },
]);

const call = async (name, args = {}) => { const r = await client.callTool({ name, arguments: args }); const t = r.content?.[0]?.text ?? ''; console.log(`\n${name}(${JSON.stringify(args)}) ->`, t.length > 400 ? t.slice(0, 400) + '…' : t); return t; };
await call('jme_state');
await call('jme_cards', { which: 'live' });
await call('jme_transcript', { sinceSec: 60 });
await call('jme_ask', { text: 'When was it found?', by: 'probe-agent' });
// The extension's side: the command should be waiting in the long-poll.
const cmds = await (await fetch(`${base}/commands?wait=1`)).json();
console.log('\nthe extension would receive:', JSON.stringify(cmds));
// jme_wait: fire a "ready" item while it waits.
setTimeout(() => post([{ type: 'item', now: 9, change: 'ready', item: { id: 'c2', kind: 'search', text: 'Antikythera shipwreck 1901', why: 'said', anchor: { t0: 0, t1: 4, text: 'found in 1901', terms: [] }, confidence: 0.8, score: 0.8, state: 'ready', touched: 8, recurrences: 0, born: 8, peak: 0.8, results: [] } }]), 500);
await call('jme_wait', { for: 'ready', timeoutSec: 5 });
await client.close();
console.log('\nmcp ok');
