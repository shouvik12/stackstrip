// Run with: node --test test/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const S0 = require('../src/engine.js');
// most tests exercise trimming too; the default (hide-only) is tested at the bottom
const S = Object.assign({}, S0, { strip: (t, o, tb) => S0.strip(t, Object.assign({ noCut: false }, o), tb) });

const sample = (f) => fs.readFileSync(path.join(__dirname, '..', 'samples', f), 'utf8');

function assertNoLeak(out, words) {
  for (const w of words) {
    assert.ok(!out.toLowerCase().includes(w.toLowerCase()), `leaked "${w}"\n---\n${out}`);
  }
}

test('java: private names, hosts and secrets never leave', () => {
  const r = S.strip(sample('java-spring.log'), { privateTerms: ['Globex'] });
  assertNoLeak(r.text, [
    'acmecorp', 'InvoiceReconciler', 'TierDiscountPolicy', 'TierCapExceededException', 'applyGoldTierDiscount',
    'enforceCap', 'InvoiceController', 'TenantContextFilter', 'ledger-db', 'S3cr3tPass', 'svc_billing',
    'eyJhbGci', 'priya.sharma', '10.42.7.19', 'INV-2291', 'Globex', '7f3e2a10',
  ]);
});

test('java: public framework frames and root cause are kept', () => {
  const r = S.strip(sample('java-spring.log'));
  assert.match(r.text, /java\.lang\.ArithmeticException: Rounding necessary/);
  assert.match(r.text, /java\.math\.BigDecimal\.setScale\(BigDecimal\.java:2913\)/);
  assert.match(r.text, /org\.springframework\.web\.method\.support\.InvocableHandlerMethod\.doInvoke/);
  assert.match(r.text, /framework frames omitted/);
  assert.match(r.text, /\.\.\. 37 more/);
  assert.ok(r.report.tokensOut < r.report.tokensIn / 2, 'should at least halve tokens');
  assert.match(r.text, /TierDiscountPolicy|Class1\.java:118/); // line numbers survive
});

test('python: source of private frames hidden, venv path not leaked', () => {
  const r = S.strip(sample('python-fastapi.log'));
  assertNoLeak(r.text, [
    'acme-payouts', 'acme_payouts', 'settle_merchant_batch', '_apply_reserve_holdback', 'RESERVE_TABLE',
    'holdback_pct', 'SettlementError', 'band_7_high_chargeback', 'sk_live_', '10.0.3.44', 'FX_POLICY_APAC',
  ]);
  assert.match(r.text, /<site-packages>\/starlette\/routing\.py/);
  assert.match(r.text, /KeyError: 'str\d+'/);
  assert.match(r.text, /During handling of the above exception/);
});

test('node: private files and functions aliased, express frames kept', () => {
  const r = S.strip(sample('node-express.log'));
  assertNoLeak(r.text, [
    'acme-loyalty', 'pointsCalculator', 'calculateTierBonus', 'LoyaltyService', 'redeemPartnerPoints',
    'PARTNER_MULTIPLIERS', 'abcd1234efgh', 'routes/points',
  ]);
  assert.match(r.text, /TypeError: Cannot read properties of undefined/);
  assert.match(r.text, /node_modules\/express\/lib\/router\/layer\.js:95:5/);
  assert.match(r.text, /"level":"info"/);
  assert.match(r.text, /Node\.js v22/);
});

test('.NET: namespaces, types and paths aliased; System frames kept', () => {
  const r = S.strip(sample('dotnet.log'));
  assertNoLeak(r.text, ['Contoso', 'FareRuleEngine', 'ResolveCabinRule', 'PriceItinerary', 'QuoteController', 'FareRequest', 'C:\\src', 'PremiumFlex', 'FR-2291']);
  assert.match(r.text, /System\.InvalidOperationException/);
  assert.match(r.text, /System\.Linq\.Enumerable/);
});

test('aliases are stable across pastes and restore round-trips', () => {
  const table = S.createAliasTable();
  const a = S.strip(sample('java-spring.log'), {}, table);
  const b = S.strip(sample('java-spring.log'), {}, table);
  assert.strictEqual(a.text, b.text);
  const cls = /at (app\.mod\d+)\.(Class\d+)\.(method\d+)\((Class\d+)\.java:118\)/.exec(a.text);
  assert.ok(cls, a.text);
  const aiAnswer = `The cap check in ${cls[2]}.${cls[3]}() (${cls[1]}) throws before rounding. Wrap it in ${cls[2]}.java line 118.`;
  const back = S.restore(aiAnswer, table);
  assert.match(back.text, /TierDiscountPolicy\.enforceCap\(\)/);
  assert.match(back.text, /com\.acmecorp\.billing\.discount/);
  assert.ok(back.count >= 4);
});

test('restore does not touch look-alike tokens', () => {
  const table = S.createAliasTable();
  S.strip('Exception in thread "main" com.acme.FooException: x\n\tat com.acme.Foo.bar(Foo.java:1)\n', {}, table);
  const r = S.restore('Class1 vs Class12 vs MyClass1 vs app.mod1.Class1', table);
  assert.strictEqual(r.text, 'Foo vs Class12 vs MyClass1 vs com.acme.Foo');
});

test('secrets are redacted and never stored in the alias table', () => {
  const t = S.createAliasTable();
  const r = S.strip(
    'ERROR boom AKIAABCDEFGHIJKLMNOP ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa password=hunter2hunter\n' +
    'Traceback (most recent call last):\n  File "/srv/x/app.py", line 1, in <module>\n    boom()\nValueError: nope\n', {}, t);
  assertNoLeak(r.text, ['AKIAABCDEFGHIJKLMNOP', 'ghp_aaaa', 'hunter2']);
  assertNoLeak(JSON.stringify(t), ['AKIAABCDEFGHIJKLMNOP', 'ghp_aaaa', 'hunter2']);
  assert.ok(r.report.secrets >= 3);
});

test('looksLikeLog ignores normal prose and code', () => {
  assert.strictEqual(S.looksLikeLog('Can you help me write a cover letter for a product role at a fintech?'), false);
  assert.strictEqual(S.looksLikeLog('function add(a, b) {\n  return a + b;\n}\nconsole.log(add(1, 2));'), false);
  assert.strictEqual(S.looksLikeLog(sample('python-fastapi.log')), true);
  assert.strictEqual(S.looksLikeLog(sample('dotnet.log')), true);
});

test('private terms are hidden everywhere', () => {
  const r = S.strip(sample('java-spring.log'), { privateTerms: ['GOLD'] });
  assertNoLeak(r.text, ['GOLD']);
});

test('private prefixes override node_modules / site-packages', () => {
  const log = 'TypeError: boom\n    at charge (/srv/app/node_modules/@acme/billing-core/dist/charge.js:10:5)\n    at next (/srv/app/node_modules/express/lib/router/route.js:149:13)\n';
  const pub = S.strip(log);
  assert.match(pub.text, /@acme\/billing-core/);
  const priv = S.strip(log, { privatePrefixes: ['@acme/'] });
  assertNoLeak(priv.text, ['@acme', 'billing-core', 'charge.js']);
  assert.match(priv.text, /node_modules\/express/);
  const py = 'Traceback (most recent call last):\n  File "/venv/lib/python3.12/site-packages/acme_ledger/post.py", line 9, in post_entry\n    x()\nValueError: bad\n';
  assertNoLeak(S.strip(py, { privatePrefixes: ['acme_'] }).text, ['acme_ledger', 'post_entry']);
});

test('terminal: username, machine, folders and git author are hidden', () => {
  const raw = sample('terminal.log');
  assert.strictEqual(S.looksLikeLog(raw), true);
  const r = S.strip(raw);
  assertNoLeak(r.text, ['jdoe', 'MacBook', 'build-runner-07', 'Jane Doe', 'acme', 'AcmeBilling', 'tierCap', 'invoiceReconciler', 'FareRuleEngine', 'C:\\Users']);
  assert.match(r.text, /^user1@machine1 ~\/project1 % git log -1$/m);
  assert.match(r.text, /\[user1@machine2 project1\]\$ sudo -u user1/);
  assert.match(r.text, /error TS2322: Type 'string' is not assignable to type 'number'/); // built-in types stay
  assert.match(r.text, /~\/\.ssh': Permission denied/);                                   // generic dotfolders stay
});

test('terminal: a username seen once stays hidden in later pastes', () => {
  const t = S.createAliasTable();
  S.strip('jdoe@devbox:~/payments$ make\nmake: *** [all] Error 1\n', {}, t);
  const later = S.strip('ERROR cannot write lockfile, owned by jdoe (uid 501)\nError: EACCES\n    at open (node:fs:573:3)\n', {}, t);
  assertNoLeak(later.text, ['jdoe']);
});

test('terminal: generic accounts like root stay readable', () => {
  const r = S.strip('root@ip-10-0-0-12:/var/app# systemctl restart api\nJob for api.service failed because the control process exited with error code.\n');
  assert.match(r.text, /^root@machine1/);
});

function noisyLog(noiseBefore, noiseAfter) {
  const noise = (i) => [
    `2026-11-22 09:00:${String(i % 60).padStart(2, '0')}.100  INFO 4242 --- [exec-1] c.a.billing.web.HealthController : GET /health 200 (2 ms)`,
    `2026-11-22 09:00:${String(i % 60).padStart(2, '0')}.200 DEBUG 4242 --- [exec-2] org.hibernate.SQL : select i1_0.id from invoice i1_0 where i1_0.id=?`,
    `2026-11-22 09:00:${String(i % 60).padStart(2, '0')}.300  INFO 4242 --- [exec-3] c.a.billing.web.RequestLogger : GET /api/v2/invoices/INV-${2000 + i} 200 user=priya.sharma@acmecorp.com`,
  ][i % 3];
  const L = [];
  for (let i = 0; i < noiseBefore; i++) L.push(noise(i));
  L.splice(Math.floor(noiseBefore / 2), 0, '2026-11-22 09:00:30.000  WARN 4242 --- [exec-1] c.a.billing.cache.TierCache : Tier config for GOLD reloaded, 3 keys changed');
  L.push(...sample('java-spring.log').split('\n').slice(11, 51));
  for (let i = 0; i < noiseAfter; i++) L.push(noise(i));
  return L.join('\n');
}

test('noise: a 2,000-line log comes down to the crash, its cause and recent warnings', () => {
  const raw = noisyLog(1400, 560);
  const r = S.strip(raw);
  assert.ok(r.report.linesIn >= 2000);
  assert.ok(r.report.linesOut <= 40, 'kept ' + r.report.linesOut + ' lines');
  assert.ok(r.report.tokensOut < r.report.tokensIn * 0.05);
  assert.match(r.text, /AppError\d+: GOLD tier discount 46% exceeds cap 40%/);
  assert.match(r.text, /Caused by: java\.lang\.ArithmeticException: Rounding necessary/);
  assert.match(r.text, /WARN .*Tier config for GOLD reloaded/);
  assert.ok((r.text.match(/hibernate\.SQL/g) || []).length <= 2, 'SQL noise should be gone except as context right before the crash');
  assertNoLeak(r.text, ['priya', 'acmecorp', 'INV-2']);
});

test('noise: the same crash logged many times is shown once', () => {
  const raw = Array.from({ length: 10 }, () => noisyLog(100, 0)).join('\n');
  const r = S.strip(raw);
  assert.strictEqual((r.text.match(/Caused by: java\.lang\.ArithmeticException/g) || []).length, 1);
  assert.match(r.text, /\[same stack trace repeated 9 more times\]/);
  assert.ok(r.report.linesOut <= 45, 'kept ' + r.report.linesOut + ' lines');
});

test('noise: two different crashes are both kept', () => {
  const r = S.strip(sample('java-spring.log') + '\n' + sample('python-fastapi.log'));
  assert.match(r.text, /ArithmeticException/);
  assert.match(r.text, /KeyError/);
});

test('terminal session: command output is kept, generic folders and file names stay readable', () => {
  const raw = sample('terminal-session.log');
  const r = S.strip(raw);
  assertNoLeak(r.text, ['jdoe', 'Janes-MacBook-Air', 'stackstrip']);
  assert.doesNotMatch(r.text, /omitted/);                       // short sessions are never cut
  assert.match(r.text, /^user1@machine1 Downloads % ls -lrt$/m);  // Downloads isn't private
  assert.match(r.text, /VID-20261119-WA0025\.mp4/);               // file names aren't business IDs
  assert.match(r.text, /inflating: project1\/src\/engine\.js/);   // consistent folder alias, file kept
  assert.match(r.text, /^user1@machine1 project1 % ls -lrt$/m);
  assert.match(r.text, /README\.md$/m);
});

test('terminal session: a very long command output keeps its start, end and any errors', () => {
  const lines = ['dev@box ~ % npm install'];
  for (let i = 0; i < 400; i++) lines.push('added package-' + i);
  lines.splice(200, 0, 'npm ERR! code ERESOLVE');
  lines.push('dev@box ~ % echo done', 'done');
  const r = S.strip(lines.join('\n'));
  assert.match(r.text, /added package-0$/m);
  assert.match(r.text, /added package-399$/m);
  assert.match(r.text, /npm ERR! code ERESOLVE/);
  assert.match(r.text, /omitted/);
  assert.match(r.text, /% echo done\ndone$/);
  assert.ok(r.report.linesOut < 60);
});

test('noCut keeps every line but still hides names and secrets', () => {
  const raw = sample('big-2000-lines.log');
  const r = S.strip(raw, { noCut: true });
  assert.strictEqual(r.text.split('\n').length, raw.replace(/\n$/, '').split('\n').length);
  assertNoLeak(r.text, ['acmecorp', 'priya', 'eyJhbGci', 'InvoiceReconciler']);
});

test('default: nothing is cut, only hidden', () => {
  for (const f of ['java-spring.log', 'python-fastapi.log', 'node-express.log', 'dotnet.log', 'terminal.log', 'terminal-session.log', 'big-2000-lines.log']) {
    const raw = sample(f);
    const r = S0.strip(raw);
    assert.doesNotMatch(r.text, /omitted|\[same stack trace repeated|\[×\d+\]/, f);
    assert.ok(r.report.linesOut >= raw.trimEnd().split('\n').length - 12, f + ': ' + r.report.linesIn + ' -> ' + r.report.linesOut);
  }
  assertNoLeak(S0.strip(sample('big-2000-lines.log')).text, ['acmecorp', 'priya', 'eyJhbGci', 'InvoiceReconciler', 'ledger-db']);
});

test('quoted values: log lines and config dumps keep them; exception messages hide them', () => {
  const line = 'fatal: [node-1.dc.corp-example.com]: FAILED! => {"changed": true, "msg": "non-zero return code", "rc": 1, "stdout_lines": ["Error from server (NotFound): secrets \\"istio-remote-secret-dc1\\" not found"]}';
  const r = S0.strip(line + '\nS3Error { code: "InternalError", operation: "read" }\nKeyError: \'band_7_high_chargeback\'\n');
  assert.match(r.text, /\{"changed": true, "msg": "non-zero return code", "rc": 1, "stdout_lines": \["/);
  assert.match(r.text, /code: "InternalError", operation: "read"/);       // error codes stay readable
  assert.match(r.text, /KeyError: 'str\d+'/);                              // business values in exception messages are hidden
});

test('config dumps: bucket, endpoint and service addresses are hidden everywhere; ids and system paths stay', () => {
  const raw = [
    '    bind_addr: "10.20.30.40:4001",',
    '    server_addr: "db-node-0.db-node.acme-prod-eu:4001",',
    '    metasrv_addrs: ["db-meta.acme-prod-eu:3002"],',
    '    bucket: "acme-events-eu",',
    '    endpoint: Some("https://s3.eu.storage.corp-example.lab"),',
    '    dir: "/data/tsdb/wal",',
    'INFO The s3 storage bucket is: acme-events-eu, root is: /',
    'INFO region_id: 12884901889(1024, 0), namespace: 12884901889',
    'ERROR service=s3 name=acme-events-eu path=data/1034/manifest: read failed S3Error { code: "InternalError" }',
  ].join('\n');
  const r = S0.strip(raw);
  assertNoLeak(r.text, ['acme-events-eu', 'acme-prod-eu', 'corp-example', '10.20.30.40', 'db-node-0']);
  assert.match(r.text, /12884901889\(1024, 0\)/);
  assert.match(r.text, /\/data\/tsdb\/wal/);
  assert.match(r.text, /code: "InternalError"/);
  assert.strictEqual(r.report.secrets, 0);
});

test('card numbers need a valid checksum', () => {
  assert.match(S0.strip('ERROR charge failed card=4242 4242 4242 4242\nError: x\n').text, /<secret:number>/);
  assert.doesNotMatch(S0.strip('ERROR open failed 5497558138880 x\nError: x\n').text, /<secret/);
});

test('hostnames: a private domain seen in a link is hidden everywhere', () => {
  const raw = [
    'domain_name = dc.corp-example.com',
    'skipping: [node-171.dc2.prod.corp-example.com]',
    'fatal: [node-170.dc2.prod.corp-example.com]: FAILED!',
    'Post "https://api.dc1.prod.corp-example.com.:6443/api/v1/namespaces": net/http: TLS handshake timeout',
    'see https://kubernetes.io/docs and github.com/istio/istio',
  ].join('\n');
  const r = S0.strip(raw);
  assertNoLeak(r.text, ['corp-example', 'node-170', 'node-171']);
  assert.match(r.text, /kubernetes\.io\/docs/);
  assert.match(r.text, /github\.com\/istio\/istio/);
  assert.match(r.text, /TLS handshake timeout/);
});

test('trimming keeps the task the failure belongs to', () => {
  const lines = ['PLAY [deploy] ***', 'TASK [deploy/istio : Generate the istio remote secrets] ***'];
  for (let i = 0; i < 30; i++) lines.push('skipping: [node-' + i + ']');
  lines.push('fatal: [node-99]: FAILED! => {"rc": 1}');
  const r = S.strip(lines.join('\n'));
  assert.match(r.text, /TASK \[deploy\/istio : Generate the istio remote secrets\]/);
});

test('public crypto library (Bouncy Castle) and thread names stay readable', () => {
  const raw = [
    "2026-03-08 12:15:18.001 INFO [http-nio-80-exec-134] S3Servlet start thread='http-nio-80-exec-134'",
    'Caused by: org.bouncycastle.crypto.InvalidCipherTextException: Error finalising cipher',
    '        at TRACE ID 00000000000004a0 org.bouncycastle.jcajce.io.CipherInputStream.finaliseCipher(Unknown Source)',
    '        at com.acmecorp.vault.FinalizingDecryptInputStream.read(FinalizingDecryptInputStream.java:67)',
    '2026-03-08 12:15:20.293 WARN [http-nio-80-exec-134] S3SharedServletUtils Intercepting a good response',
  ].join('\n');
  const r = S0.strip(raw);
  assert.match(r.text, /Caused by: org\.bouncycastle\.crypto\.InvalidCipherTextException/);
  assert.match(r.text, /at TRACE ID 00000000000004a0 org\.bouncycastle\.jcajce\.io\.CipherInputStream\.finaliseCipher/);
  assert.match(r.text, /\[http-nio-80-exec-134\]/);
  assertNoLeak(r.text, ['acmecorp', 'FinalizingDecryptInputStream']);
});

test('"Don\'t hide" keeps a whole library or an exact name, in this and later pastes', () => {
  const t = S0.createAliasTable();
  const raw = 'java.lang.IllegalStateException: x\n\tat com.vendorlib.core.Pool.take(Pool.java:12)\n\tat com.acme.App.run(App.java:3)\n';
  const first = S0.strip(raw, {}, t);
  assertNoLeak(first.text, ['vendorlib']);
  const kept = S0.strip(raw, { keepVisible: ['com.vendorlib.'] }, t);
  assert.match(kept.text, /at com\.vendorlib\.core\.Pool\.take\(Pool\.java:12\)/);
  assertNoLeak(kept.text, ['com.acme', 'App.java']);
  const word = S0.strip('ERROR S3Servlet failed for user=\'x\'\nError: boom\n', { keepVisible: ['S3Servlet'], privateTerms: ['S3Servlet'] });
  assert.match(word.text, /S3Servlet/);
});

test('many pastes in a row (shared alias table, like the extension) never crash', () => {
  const t = S0.createAliasTable();
  const files = ['java-spring.log', 'python-fastapi.log', 'node-express.log', 'dotnet.log', 'terminal.log', 'terminal-session.log', 'big-2000-lines.log'];
  for (const f of files.concat(files.slice().reverse())) {
    for (const opts of [{}, { noCut: false }, { hidePrivateSource: false }, { aliasStrings: false, hideIdentity: false }]) {
      const r = S0.strip(sample(f), opts, t);
      assert.strictEqual(typeof r.text, 'string', f);
    }
  }
});

test('text with nothing private is reported as unchanged', () => {
  assert.strictEqual(S0.strip('just some plain notes\nnothing here\n').changed, false);
  assert.strictEqual(S0.strip(sample('java-spring.log')).changed, true);
});

test('Kubernetes metadata (any quote style): pod, namespace and container are hidden everywhere', () => {
  const raw = "acme-gateway-6d9f7c8b5d-x2k4q.acme-prod-paris.acme-gateway.0123abcd.server.log', 'pod': 'acme-gateway-6d9f7c8b5d-x2k4q', 'namespace': 'acme-prod-paris', 'container': 'acme-gateway', 'suggestion': \"validation failed with `AcmeStorageQuotaException` after a NullPointerException\"";
  assert.strictEqual(S0.looksLikeLog(raw), true);
  const r = S0.strip(raw);
  assertNoLeak(r.text, ['acme-gateway', 'acme-prod-paris', 'AcmeStorageQuotaException']);
  assert.match(r.text, /'pod': 'service\d+-6d9f7c8b5d-x2k4q'/);
  assert.match(r.text, /NullPointerException/);                     // well-known exceptions stay
});

test('safety net: a name learned in one paste is caught in any later paste', () => {
  const t = S0.createAliasTable();
  S0.strip("{'namespace': 'acme-prod-paris', 'pod': 'billing-api-0'}\nError: x\n", {}, t);
  assert.strictEqual(S0.looksLikeLog('why is acme-prod-paris slow?', t), true);
  assert.strictEqual(S0.strip('why is acme-prod-paris slow?', {}, t).text, 'why is org1 slow?');
  assert.strictEqual(S0.looksLikeLog('Can you review my cover letter for a product role at a fintech?', t), false);
});

test('everyday text goes through unchanged; private bits in it are still caught', () => {
  for (const p of [
    'Hi Claude, can you review my cover letter for the product role at Stripe? I used React.Component and react.Component patterns.',
    'We follow ISO-8601 dates, SHA-256 hashes, UTF-8 and RFC-7231. See CVE-2024-3094 and PEP-8.',
    'import React from "react";\nexport default function App() { return <div className="app">Hello</div>; }',
    'Explain the difference between a mutex and a semaphore, with an example in Go.',
  ]) assert.strictEqual(S0.strip(p).changed, false, p);
  const notes = S0.strip('Meeting notes: Priya will email priya.sharma@acmecorp.com about INV-2291. Server is billing-db.prod.acme.internal.');
  assertNoLeak(notes.text, ['priya.sharma', 'INV-2291', 'billing-db']);
});

test('source code: company package / namespace declarations are hidden, standard ones kept', () => {
  const java = 'package com.acmecorp.billing;\n\nimport com.acmecorp.billing.discount.TierDiscountPolicy;\nimport java.util.List;\nimport org.springframework.stereotype.Service;\n\npublic class Foo {}';
  const r = S0.strip(java);
  assertNoLeak(r.text, ['acmecorp', 'TierDiscountPolicy']);
  assert.match(r.text, /import java\.util\.List;/);
  assert.match(r.text, /import org\.springframework\.stereotype\.Service;/);
  const cs = S0.strip('using System.Text.Json;\nusing Contoso.Airline.Pricing;\nnamespace Contoso.Airline.Api;\n');
  assertNoLeak(cs.text, ['Contoso']);
  assert.match(cs.text, /using System\.Text\.Json;/);
});

test('trimming never cuts documents or code, only logs', () => {
  const doc = Array.from({ length: 300 }, (_, i) => 'Paragraph ' + i + ' of a long design doc about caching.').join('\n');
  assert.strictEqual(S0.strip(doc, { noCut: false }).report.linesOut, 300);
});

test('metric / OpenTelemetry labels: prefixed keys, product names with spaces, serial numbers', () => {
  const prom = 'acme_system_info{instance="10.20.30.41:15020", job="acme-object-endpoints", kubernetes_namespace="acme-s3-paris", kubernetes_pod="billing-gw-6d9f7c8b5d-k2j9q", kubernetes_service="billing-gw", product_name="Acme Object Store", product_version="3.3.0", serial_number="S271828182", system_name="paris.lab.eng.corp-example.com"}';
  assert.strictEqual(S0.looksLikeLog(prom), true);
  const r = S0.strip(prom);
  assertNoLeak(r.text, ['10.20.30.41', 'acme-object-endpoints', 'acme-s3-paris', 'billing-gw', 'Acme Object Store', 'S271828182', 'corp-example']);
  assert.match(r.text, /product_version="3\.3\.0"/);
  assert.match(r.text, /kubernetes_pod="service\d+-6d9f7c8b5d-k2j9q"/);
  const otel = S0.strip('resource: k8s.namespace.name=acme-prod-eu k8s.pod.name=checkout-7f9c6d5b8-qwert service.name=checkout-api host.name=ip-10-1-2-3.corp-example.internal\nError: timeout\n');
  assertNoLeak(otel.text, ['acme-prod-eu', 'checkout', 'corp-example']);
});
