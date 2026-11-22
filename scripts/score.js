// Scores the engine against the adversarial corpus: privacy coverage AND debugging usefulness.
// Usage: node scripts/score.js [--json]
const S = require('../src/engine.js');
const corpus = require('../test/adversarial.js');

function score() {
  const rows = [];
  let total = 0, hidden = 0, flagged = 0, missed = 0, keepTotal = 0, keepOk = 0, fullyProtected = 0, validStructured = 0, structured = 0;
  for (const sc of corpus) {
    const r = S.strip(sc.text);
    const review = (r.report.review || []).map((f) => f.text + ' ' + (f.line || '')).join('\n');
    const res = { id: sc.id, state: r.report.state || '-', markers: [], keep: [] };
    let allOk = true;
    for (const [m, want] of sc.markers) {
      total++;
      let outcome;
      if (!r.text.includes(m)) { outcome = 'hidden'; hidden++; }
      else if (want === 'flag' && review.includes(m)) { outcome = 'flagged'; flagged++; }
      else { outcome = 'MISSED'; missed++; allOk = false; }
      res.markers.push([m, want, outcome]);
    }
    if (allOk) fullyProtected++;
    for (const k of sc.keep) { keepTotal++; const ok = r.text.includes(k); if (ok) keepOk++; res.keep.push([k, ok]); }
    if (sc.json || sc.yaml) {
      structured++;
      let valid = false;
      try { if (sc.json) { JSON.parse(r.text); valid = true; } else { valid = yamlLooksValid(r.text, sc.text); } } catch (e) {}
      if (valid) validStructured++;
      res.validSyntax = valid;
    }
    res.output = r.text;
    rows.push(res);
  }
  return { rows, total, hidden, flagged, missed, keepTotal, keepOk, fullyProtected, scenarios: corpus.length, structured, validStructured };
}

// Lightweight YAML check: same line count, same indentation and same keys on every line.
function yamlLooksValid(out, src) {
  const a = out.split('\n'), b = src.split('\n');
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ia = a[i].match(/^\s*(?:- )?/)[0], ib = b[i].match(/^\s*(?:- )?/)[0];
    if (ia !== ib) return false;
    const ka = (a[i].match(/^\s*(?:- )?([\w./-]+):/) || [])[1], kb = (b[i].match(/^\s*(?:- )?([\w./-]+):/) || [])[1];
    if (ka !== kb) return false;
  }
  return true;
}

if (require.main === module) {
  const s = score();
  if (process.argv.includes('--json')) { console.log(JSON.stringify(s, null, 2)); process.exit(0); }
  for (const r of s.rows) {
    const miss = r.markers.filter((m) => m[2] === 'MISSED').map((m) => m[0]);
    const lost = r.keep.filter((k) => !k[1]).map((k) => k[0]);
    console.log((miss.length ? '✗ ' : '✓ ') + r.id.padEnd(24) + ' state=' + String(r.state).padEnd(10) +
      (miss.length ? ' missed: ' + miss.join(', ') : '') + (lost.length ? ' | lost context: ' + lost.join(', ') : '') +
      (r.validSyntax === false ? ' | INVALID SYNTAX' : ''));
  }
  console.log('\nmarkers: ' + s.total + ' | hidden ' + s.hidden + ' | flagged for review ' + s.flagged + ' | missed ' + s.missed);
  console.log('fully protected scenarios: ' + s.fullyProtected + '/' + s.scenarios);
  console.log('debugging context kept: ' + s.keepOk + '/' + s.keepTotal + ' | structured output still valid: ' + s.validStructured + '/' + s.structured);
}
module.exports = { score };
