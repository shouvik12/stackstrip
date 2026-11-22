// Regression tests from the security review: adversarial corpora, benign content, structure, mappings.
// Run with: node --test test/
const test = require('node:test');
const assert = require('node:assert');
const S = require('../src/engine.js');

const corpusA = require('./adversarial.js');          // review corpus (format: markers [[m, 'hide'|'flag']], keep)
const corpusB = require('./adversarial-corpus.js');   // independent corpus (format: hide[], flag[], keep[])
const benign = require('./benign.js');

const reviewText = (r) => (r.report.review || []).map((f) => f.text + ' ' + (f.context || '')).join('\n').toLowerCase();

function check(id, input, hide, flag, keep, format) {
  const r = S.strip(input);
  const out = r.text.toLowerCase();
  const rev = reviewText(r);
  for (const m of hide) assert.ok(!out.includes(m.toLowerCase()), `${id}: "${m}" must be hidden\n---\n${r.text}`);
  for (const m of flag) {
    const ok = !out.includes(m.toLowerCase()) || rev.includes(m.toLowerCase());
    assert.ok(ok, `${id}: "${m}" must be hidden or flagged for review\n---\n${r.text}\nreview: ${rev}`);
  }
  for (const k of keep) assert.ok(r.text.includes(k), `${id}: debugging context "${k}" was lost\n---\n${r.text}`);
  if (format === 'json') assert.doesNotThrow(() => JSON.parse(r.text), `${id}: output is not valid JSON`);
  if (format === 'yaml') {
    let yaml = null; try { yaml = require('js-yaml'); } catch (e) { /* optional dev dependency */ }
    if (yaml) assert.doesNotThrow(() => yaml.load(r.text), `${id}: output is not valid YAML`);
  }
  // anything StackStrip leaves for review must never be reported as plainly "protected"
  if ((r.report.review || []).length) assert.strictEqual(r.report.state, 'review', `${id}: findings exist, state must be "review"`);
  return r;
}

for (const sc of corpusA) {
  test('review corpus: ' + sc.id, () => {
    check(sc.id, sc.text, sc.markers.filter((m) => m[1] === 'hide').map((m) => m[0]), sc.markers.filter((m) => m[1] === 'flag').map((m) => m[0]), sc.keep, sc.json ? 'json' : sc.yaml ? 'yaml' : null);
  });
}

for (const sc of corpusB) {
  test('independent corpus: ' + sc.id, () => check(sc.id, sc.input, sc.hide, sc.flag, sc.keep, sc.format));
}

test('benign content passes through untouched and unflagged', () => {
  for (const b of benign) {
    const r = S.strip(b.text);
    assert.strictEqual(r.report.replacements.length, 0, `${b.id}: false alarm — ${r.report.replacements.map((x) => x.original + '→' + x.alias).join(', ')}`);
    assert.strictEqual((r.report.review || []).length, 0, `${b.id}: flagged for review — ${(r.report.review || []).map((f) => f.text).join(' | ')}`);
  }
});

test('protection state: never "protected" when something was left for review', () => {
  const r = S.strip('Decline all VegaPrime clients above 7 percent.');
  assert.strictEqual(r.report.state, 'review');
  const clean = S.strip('java.lang.IllegalStateException: boom\n\tat com.novaforge.App.run(App.java:3)\n');
  assert.ok(['protected', 'review'].includes(clean.report.state));
});

test('code names: business names renamed by default, every declared name with codeNames=all', () => {
  const code = 'export default function TodoList({ items }) { return items.length; }';
  assert.strictEqual(S.strip(code).changed, false);
  assert.match(S.strip(code, { codeNames: 'all' }).text, /function func\d+\(/);
});

// ---- reversible mapping (review §18)
test('mapping: stable aliases across pastes, and across a save/load of the table', () => {
  const t = S.createAliasTable();
  const a = S.strip('Decline all VegaPrime clients above 7 percent.', {}, t).text;
  const saved = JSON.parse(JSON.stringify(t));               // what chrome.storage does
  const b = S.strip('VegaPrime wants a call.', {}, saved).text;
  const alias = /\b(Name\d+)\b/.exec(a)[1];
  assert.match(b, new RegExp('\\b' + alias + '\\b'));
  assert.strictEqual(S.restore('Call ' + alias + ' back.', saved).text, 'Call VegaPrime back.');
});

test('mapping: no collisions between look-alike aliases (Name1 vs Name10, user1 vs mail1)', () => {
  const t = S.createAliasTable();
  const names = Array.from({ length: 12 }, (_, i) => 'Zephyr' + String.fromCharCode(65 + i) + 'quill Account');
  S.strip(names.map((n) => 'the ' + n + ' account is late').join('\n'), {}, t);
  const back = S.restore('Name1 Name10 Name12 mail1@example.com user1', t).text;
  assert.ok(!/Name1\d/.test(back.split(' ')[0]));
  const aliases = Object.values(t.forward);
  assert.strictEqual(new Set(aliases).size, aliases.length, 'every original gets a unique alias');
});

test('mapping: originals with special characters round-trip exactly', () => {
  const t = S.createAliasTable();
  const raw = "customer O'Brien & Sons (UK) Ltd paid late; contact ana.lópez+billing@novaforge.io re: ACME-77 [$]^.*?";
  const r = S.strip(raw, {}, t);
  const back = S.restore(r.text, t).text;
  assert.strictEqual(back, raw.replace(/\s+$/, ''));
});

test('mapping: overlapping identifiers restore the longest match, not a prefix', () => {
  const t = S.createAliasTable();
  const r = S.strip('Waive fees for VegaPrime and VegaPrimeplus customers.', {}, t);
  const back = S.restore(r.text, t).text;
  assert.strictEqual(back, 'Waive fees for VegaPrime and VegaPrimeplus customers.');
});

test('mapping: restore never touches text that merely contains an alias inside a word', () => {
  const t = S.createAliasTable();
  S.strip('Decline all VegaPrime clients.', {}, t);
  assert.strictEqual(S.restore('MyName1 and Name1x and xName1', t).text, 'MyName1 and Name1x and xName1');
});

test('mapping: secrets are never stored in the table, so they can never be restored or exported', () => {
  const t = S.createAliasTable();
  S.strip('password=hunter2hunter2 token=ghp_abcdefghijklmnopqrstuvwxyz0123456789 Bearer abcdefghijklmnop1234', {}, t);
  const dump = JSON.stringify(t);
  for (const s of ['hunter2', 'ghp_abc', 'abcdefghijklmnop1234']) assert.ok(!dump.includes(s));
});

test('long inputs stay fast (5 MB in under 5 s)', () => {
  const line = '2026-11-22 10:00:00 INFO c.n.billing.Svc - partner VegaPrime rate 0.17 host db1.novaforge.internal\n';
  const big = line.repeat(Math.ceil(5 * 1024 * 1024 / line.length));
  const t0 = Date.now();
  const r = S.strip(big);
  assert.ok(Date.now() - t0 < 5000, 'took ' + (Date.now() - t0) + ' ms');
  assert.ok(!r.text.includes('VegaPrime'));
});

test('database and service logins are hidden, generic ones kept', () => {
  const r = S.strip([
    'FATAL: password authentication failed for user "svc_payouts"',
    'Caused by: java.sql.SQLException: Connection refused: db.internal.novaforge.io:5432 (user svc_ledger)',
    "ERROR 1045 (28000): Access denied for user 'reporting_ro'@'10.0.4.2'",
    'FATAL: role "postgres" does not exist',
  ].join('\n'), {});
  for (const w of ['svc_payouts', 'svc_ledger', 'reporting_ro']) assert.ok(!r.text.includes(w), w + ' leaked: ' + r.text);
  assert.ok(r.text.includes('"postgres"'), 'generic postgres user kept');
  assert.ok(/password authentication failed for user "user\d+"/.test(r.text), r.text);
});

test('pasting already-stripped text changes nothing (no second layer of stand-ins)', () => {
  const log = [
    'java.lang.IllegalStateException: SilverOrchidPartner exceeded unpublished 14.5% payout threshold',
    '\tat com.novaforge.claims.RulePilot.reconcile(RulePilot.java:88)',
    '\tat com.novaforge.claims.PayoutService.runBatch(PayoutService.java:214)',
    'Caused by: java.sql.SQLException: Connection refused: ledger-db-02.prod.novaforge.internal:5432 (user svc_payouts)',
    'Escalate to dana.kim@novaforge.io',
  ].join('\n');
  const t = S.createAliasTable();
  const once = S.strip(log, {}, t).text;
  assert.strictEqual(S.strip(once, {}, t).text, once, 'same alias table');
  assert.strictEqual(S.strip(once, {}, S.createAliasTable()).text, once, 'fresh alias table (e.g. another tab or after Forget)');
  assert.ok(S.restore(S.strip(once, {}, t).text, t).text.includes('RulePilot.reconcile'));
});

test('a table polluted by older versions is cleaned before use', () => {
  const log = 'java.lang.IllegalStateException: boom\n\tat com.novaforge.claims.RulePilot.reconcile(RulePilot.java:88)';
  const t = S.createAliasTable();
  // what 0.5.2 could learn after you pasted already-stripped text
  t.forward['word\u0000mod1'] = 'org2'; t.kinds.org2 = 'word'; t.counters.word = 2;
  t.forward['pkg\u0000app.mod1'] = 'app.mod3'; t.kinds['app.mod3'] = 'pkg';
  const out = S.strip(log, {}, t).text;
  assert.ok(/at app\.mod\d+\.Class\d+\.method\d+\(/.test(out), out);
  assert.ok(!/org2|mod3/.test(out), out);
  assert.ok(!Object.keys(t.forward).some((k) => /\u0000(?:mod1|app\.mod1)$/.test(k)), 'junk entries removed');
  assert.ok(S.restore(out, t).text.includes('com.novaforge.claims.RulePilot.reconcile'));
});
