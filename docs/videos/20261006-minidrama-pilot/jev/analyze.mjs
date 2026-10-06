// Applies the Hanmadi thresholds (confidence >= 0.85, chosen probability >= 0.90) and compares controls.
import fs from 'node:fs';
const live = JSON.parse(fs.readFileSync(new URL('live-results.json', import.meta.url)));
const controls = JSON.parse(fs.readFileSync(new URL('controls.json', import.meta.url)));
const req = JSON.parse(fs.readFileSync(new URL('request.json', import.meta.url)));
const answers = live.events.find(e => e.event === 'response').body.answers;
const rows = Object.entries(answers).map(([id, a]) => {
  const [line, check] = id.split('_');
  const p = a.probabilities[a.choice];
  const decided = a.confidence >= 0.85 && p >= 0.90;
  const exp = controls[line]?.expected?.[check];
  return { line, check, text: req.questions[id].instructions.candidate.line, choice: a.choice,
    conf: +a.confidence.toFixed(2), p: +p.toFixed(2), verdict: decided ? a.choice : 'review', expected: exp ?? null };
});
fs.writeFileSync(new URL('judgments.json', import.meta.url), JSON.stringify(rows, null, 2) + '\n');
for (const r of rows) console.log([r.line, r.check, r.verdict, r.choice, r.conf, r.p, r.expected ?? '', r.text].join('\t'));
