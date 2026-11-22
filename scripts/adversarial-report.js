// Scores the engine against test/adversarial-corpus.js.
// Usage: node scripts/adversarial-report.js [--json]
const S = require('../src/engine.js');
const corpus = require('../test/adversarial-corpus.js');

function score(sc) {
  const r = S.strip(sc.input);
  const out = r.text;
  const low = out.toLowerCase();
  const reviewText = (r.report.review || []).map((f) => f.text).join('\n').toLowerCase();
  const rows = [];
  for (const m of sc.hide) {
    const hidden = !low.includes(m.toLowerCase());
    rows.push({ marker: m, want: 'hide', result: hidden ? 'hidden' : (reviewText.includes(m.toLowerCase()) ? 'flagged' : 'LEAKED') });
  }
  for (const m of sc.flag) {
    const hidden = !low.includes(m.toLowerCase());
    const flagged = reviewText.includes(m.toLowerCase());
    rows.push({ marker: m, want: 'flag', result: hidden ? 'hidden' : flagged ? 'flagged' : 'LEAKED' });
  }
  const lostContext = sc.keep.filter((k) => !out.includes(k));
  let formatOk = true;
  if (sc.format === 'json') { try { JSON.parse(out); } catch (e) { formatOk = false; } }
  if (sc.format === 'yaml') {
    try { require('js-yaml').load(out); } catch (e) { formatOk = e.code === 'MODULE_NOT_FOUND' ? 'not checked' : false; }
  }
  return { id: sc.id, title: sc.title, state: r.report.state, rows, lostContext, formatOk, output: out, review: r.report.review };
}

function run() { return corpus.map(score); }

if (require.main === module) {
  const res = run();
  if (process.argv.includes('--json')) { console.log(JSON.stringify(res, null, 2)); return; }
  let total = 0, hidden = 0, flagged = 0, leaked = 0, full = 0, ctxLost = 0;
  for (const s of res) {
    const l = s.rows.filter((r) => r.result === 'LEAKED').length;
    total += s.rows.length; leaked += l;
    hidden += s.rows.filter((r) => r.result === 'hidden').length;
    flagged += s.rows.filter((r) => r.result === 'flagged').length;
    if (!l) full++;
    ctxLost += s.lostContext.length;
    console.log((l ? '✗ ' : '✓ ') + s.id.padEnd(20) + ' state=' + String(s.state).padEnd(9) +
      s.rows.map((r) => r.marker + ':' + r.result).join('  ') +
      (s.lostContext.length ? '   LOST CONTEXT: ' + s.lostContext.join(' | ') : '') +
      (s.formatOk === false ? '   INVALID ' + s.id.split('-').pop().toUpperCase() : ''));
  }
  console.log(`\nmarkers ${total} · hidden ${hidden} · flagged for review ${flagged} · leaked ${leaked} · fully protected scenarios ${full}/${res.length} · debugging context lost ${ctxLost}`);
}
module.exports = { run };
