#!/usr/bin/env node
// Writes docs/support-content-review.md from the content files (src/content):
// every sentence of Reflect, Letters and Support, for the owner's tone review
// and the clinician review. Heavy pieces are marked. Never edit the document
// by hand: change the JSON and run `node scripts/content-review.js`
// (content.test.ts fails while the document is out of date).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, 'src/content', p), 'utf8'));
const mark = (x) => `${x.sensitivity === 'heavy' ? '**[heavy]** ' : ''}${x.reviewed ? '' : '☐ '}`;
const range = (r) => (r[0] === r[1] ? `${r[0]}` : `${r[0]}–${r[1]}`);

function build() {
  const out = [];
  const add = (...lines) => out.push(...lines);
  add(
    '# Reflect, Letters and Support: content for review',
    '',
    'Generated from `src/content` by `node scripts/content-review.js`. Do not edit by hand.',
    '',
    'For the owner (tone) and a clinician or psychologist (safety) before release. ☐ = not yet reviewed. **[heavy]** = about loss, the past, or the heaviest feelings: heavy Support pieces are not shown until reviewed (breathing, grounding and the support lines always are).',
    '',
    '**For the clinician, most of all:** the hard-feeling mode lines, the danger card and the phrases that bring it (`src/support/engine.ts`, `DANGER`), every **[heavy]** piece, the Low and Tense zones, the heaviest words (Depressed, Miserable, Helpless, Numb, Ashamed, Insignificant, Rage, Hateful), and the Deep reflection questions. Once a piece is approved, set its `reviewed` to true in its JSON file and run this script again.',
    '',
    'Intensity is the feeling sheet\'s 1 (a little) to 5 (very).',
    '',
  );

  // Reflect
  const themes = read('reflect/themes.json');
  const follow = read('reflect/followUps.json');
  add('## Reflect', '', '### Themes', '', '| Theme | Line | Opening | Closing | Questions |', '|---|---|---|---|---|');
  for (const t of themes) add(`| ${t.title} | ${t.line} | ${t.opening} | ${t.closing} | ${t.written ? 'written' : 'not yet'} |`);
  add('');
  for (const t of themes.filter((x) => x.written)) {
    const qs = read(`reflect/${t.id}.json`);
    add(`### ${t.title}`, '');
    for (const depth of ['light', 'medium', 'deep']) {
      add(`**${depth[0].toUpperCase()}${depth.slice(1)}**`, '');
      qs.filter((q) => q.depth === depth).forEach((q) => add(`- ${mark(q)}${q.text} _(${q.stage})_`));
      add('');
    }
  }
  add('### Follow-ups', '');
  for (const f of follow.followUps) add(`- ${mark(f)}${f.text}${f.themes.length ? ` _(${f.themes.join(', ')})_` : ''}`);
  add('', '### Closing and notes', '');
  for (const [k, v] of Object.entries(follow.closing)) add(`- ${k}: ${v}`);
  add('');

  // Letters
  const letters = read('letters/letters.json');
  add('## Letters to Myself', '');
  for (const k of letters.kinds) {
    add(`### ${k.title}`, '', k.line, '');
    k.starters.texts.forEach((s) => add(`- ${mark(k.starters)}${s}`));
    add('');
  }
  add('### Other words', '');
  for (const key of ['generalStarters', 'writeTip', 'hardFeelingTip', 'offer', 'offerRead', 'offerLater', 'offerNotNow', 'writtenOn', 'hideForNow', 'dontShowWhenIntense']) {
    const v = letters[key];
    add(`- ${key}: ${Array.isArray(v) ? v.join(' / ') : v}`);
  }
  add('');

  // Support
  add('## Support for this feeling', '');
  const kindTitle = { body: 'Body', mind: 'Mind', do: 'Do', connect: 'Connect', write: 'Write' };
  for (const zone of ['lively', 'calm', 'okay', 'tense', 'low']) {
    const z = read(`support/${zone}.json`);
    add(`### ${zone[0].toUpperCase()}${zone.slice(1)}`, '', '**Acknowledge**', '');
    z.acknowledge.forEach((a) => add(`- ${mark(a)}${a.text} _(intensity ${range(a.intensity)})_`));
    add('', '**Understand it**', '');
    z.understand.forEach((a) => add(`- ${mark(a)}${a.text}`));
    add('', '**Options**', '', '| Kind | Intensity | Title | What to do | Why this can help | Leads to |', '|---|---|---|---|---|---|');
    for (const o of z.options) {
      const to = o.tool ? `tool: ${o.tool}` : o.letter ? `letter: ${o.letter}` : o.support ? 'support lines' : o.prompt ? `write: "${o.prompt}"` : '';
      add(`| ${kindTitle[o.kind]} | ${range(o.intensity)} | ${mark(o)}${o.title} | ${o.text} | ${o.why} | ${to} |`);
    }
    add('');
  }
  const hard = read('support/hardMode.json');
  add('### Hard-feeling mode', '', 'Low, or Tense at high intensity: fewer words, breathing and grounding first, "Talk to someone" in view.', '');
  hard.lines.forEach((l) => add(`- ${mark(l)}${l.text}`));
  add(`- talkTitle: ${hard.talkTitle}`, `- talkLine: ${hard.talkLine}`, `- dangerTitle: ${hard.dangerTitle}`, `- dangerLine: ${hard.dangerLine}`, `- helped: ${Object.values(hard.helped).join(' / ')}`, `- checkInLater: ${hard.checkInLater}`, '');

  // Each of the 89 feeling words: its own acknowledgement and options, shown
  // before the zone's. Heavy words show only breathing, grounding and the
  // support lines until reviewed.
  const wheel = fs.readFileSync(path.join(root, 'src/data/feelingsWheel.ts'), 'utf8');
  const nameOf = (id) => (wheel.match(new RegExp(`id: '${id}', name: '([^']+)'`)) || [])[1] || id;
  add('### Each feeling word', '', "Its own lines come first; the zone's fill in. **[heavy]** words: only the options marked safe (breathing, grounding, support lines) are shown until review.", '');
  for (const zone of ['lively', 'calm', 'okay', 'tense', 'low']) {
    add(`#### ${zone[0].toUpperCase()}${zone.slice(1)}`, '');
    for (const w of read(`support/words/${zone}.json`)) {
      add(`**${nameOf(w.feelingId)}**${w.sensitivity === 'heavy' ? ' **[heavy]**' : ''}${w.written ? '' : ' (not written: falls back to the zone)'}`, '');
      w.acknowledge.forEach((a) => add(`- ${mark(a)}${a.text}`));
      for (const o of w.options) {
        const to = o.tool ? `tool: ${o.tool}` : o.letter ? `letter: ${o.letter}` : o.support ? 'support lines' : o.prompt ? `write: "${o.prompt}"` : '';
        add(`- ${mark(o)}${kindTitle[o.kind]}: **${o.title}**. ${o.text} _Why: ${o.why}_${to ? ` (${to})` : ''}`);
      }
      add('');
    }
  }
  return out.join('\n');
}

module.exports = { build };
if (require.main === module) {
  fs.writeFileSync(path.join(root, 'docs/support-content-review.md'), build());
  console.log('Wrote docs/support-content-review.md');
}
