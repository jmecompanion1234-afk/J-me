// The spoken cues against sentences a host actually says, and sentences that must NOT fire.
//   node tools/cues_check.mjs
import { findCues } from '../engine/src/cues.ts';

const fire = [
  ["Let's ask Perplexity whether the Antikythera mechanism really predicted eclipses.", 'ask', 'perplexity', 'whether the Antikythera mechanism really predicted eclipses'],
  ["Jamie, ask ChatGPT how many gears survived.", 'ask', 'chatgpt', 'how many gears survived'],
  ["can you ask Claude what the Saros cycle is, real quick", 'ask', 'claude', 'what the Saros cycle is'],
  ["ask cloud if the library of alexandria burned in one night", 'ask', 'claude', 'if the library of alexandria burned in one night'],
  ["Pull up an image of the Saros dial.", 'images', undefined, 'the Saros dial'],
  ["Jamie pull up a picture of Michael Wright's model, please", 'images', undefined, "Michael Wright's model"],
  ["show me some photos of the shipwreck at Antikythera and then we'll move on", 'images', undefined, 'the shipwreck at Antikythera'],
  ["what does the Antikythera mechanism look like", 'images', undefined, 'the Antikythera mechanism'],
  ["pull up the video of Clickspring cutting the gears", 'videos', undefined, 'Clickspring cutting the gears'],
  ["let's watch the clip of the Cardiff CT scan", 'videos', undefined, 'the Cardiff CT scan'],
  ["pull up the 2006 Nature paper on it", 'lookup', undefined, 'the 2006 Nature paper on it'],
  ["Let's ask Perplexity.", 'ask', 'perplexity', ''],
  ["Let's ask Perplexity. Did the mechanism predict eclipses?", 'ask', 'perplexity', 'Did the mechanism predict eclipses'],
  ["Okay, pull up the Cardiff CT scan paper from 2006.", 'lookup', undefined, 'the Cardiff CT scan paper from 2006'],
];
const quiet = [
  'I had to look up at the ceiling for a second.',
  'Pull up a chair, man.',
  'They asked everyone to pull that up on their phones.',
  'He asked me to bring up the thing from last week.',
  'That looks like a picture of a sunset.',
  'We should ask him about it.',
];
let bad = 0;
for (const [s, kind, service, text] of fire) {
  const c = findCues(s)[0];
  const ok = c && c.kind === kind && c.service === service && c.text === text;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${JSON.stringify(s)} -> ${c ? `${c.kind}${c.service ? '/' + c.service : ''} ${JSON.stringify(c.text)}` : 'nothing'}`);
}
for (const s of quiet) {
  const c = findCues(s)[0];
  if (c) bad++;
  console.log(`${c ? 'FAIL' : 'ok  '} quiet ${JSON.stringify(s)}${c ? ` -> ${c.kind} ${JSON.stringify(c.text)}` : ''}`);
}
console.log(bad ? `${bad} wrong` : `all ${fire.length + quiet.length} right`);
process.exit(bad ? 1 : 0);
