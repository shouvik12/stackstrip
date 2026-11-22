// Realistic noisy Spring Boot log: 2,000 lines, one real crash at ~line 1,400.
const fs = require('fs');
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const users = ['priya.sharma', 'rahul.k', 'ananya.m', 'dev.ops', 'arjun.s', 'meera.p'];
const paths = ['/api/v2/invoices', '/api/v2/customers', '/api/v2/payments', '/api/v2/reports/daily', '/api/v2/tiers'];
let t = Date.parse('2026-11-22T09:00:00.000Z');
const ts = () => { t += Math.floor(rnd() * 900); return new Date(t).toISOString().replace('T', ' ').replace('Z', ''); };
const thr = () => 'nio-8080-exec-' + (1 + Math.floor(rnd() * 9));
const L = [];
const noise = () => {
  const r = rnd();
  if (r < 0.30) return `${ts()}  INFO 4242 --- [${thr()}] c.a.billing.web.HealthController         : GET /health 200 (2 ms)`;
  if (r < 0.55) return `${ts()}  INFO 4242 --- [${thr()}] c.a.billing.web.RequestLogger            : ${pick(['GET','POST','PUT'])} ${pick(paths)}/INV-${2000 + Math.floor(rnd()*900)} 200 user=${pick(users)}@acmecorp.com (${Math.floor(rnd()*120)} ms)`;
  if (r < 0.70) return `${ts()} DEBUG 4242 --- [${thr()}] org.hibernate.SQL                        : select i1_0.id,i1_0.customer_id,i1_0.total from invoice i1_0 where i1_0.id=?`;
  if (r < 0.80) return `${ts()}  INFO 4242 --- [   scheduling-1] c.a.billing.jobs.LedgerSyncJob           : Synced ${Math.floor(rnd()*400)} ledger rows from ledger-db.prod.acme.internal`;
  if (r < 0.88) return `${ts()} DEBUG 4242 --- [${thr()}] c.a.b.client.PaymentsClient              : Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzdmNfYmlsbGluZyJ9.c2lnbmF0dXJlbm90cmVhbA`;
  if (r < 0.95) return `${ts()}  INFO 4242 --- [${thr()}] c.a.billing.service.InvoiceReconciler    : Heartbeat ok`;
  return `${ts()}  INFO 4242 --- [${thr()}] c.a.billing.cache.TierCache               : Cache hit ratio ${(0.8 + rnd()*0.19).toFixed(2)}`;
};
while (L.length < 1388) L.push(noise());
// a warning that matters a bit, earlier on
L.splice(600, 0, `${ts()}  WARN 4242 --- [${thr()}] c.a.billing.cache.TierCache               : Tier config for GOLD reloaded from config server, 3 keys changed`);
// the crash
L.push(`${ts()}  INFO 4242 --- [nio-8080-exec-3] c.a.billing.service.InvoiceReconciler    : Applying GOLD tier discount to INV-2291, cap=40%`);
L.push(`${ts()} ERROR 4242 --- [nio-8080-exec-3] o.a.c.c.C.[.[.[/].[dispatcherServlet]    : Servlet.service() for servlet [dispatcherServlet] threw exception with root cause`);
L.push('');
const crash = fs.readFileSync(require('path').join(__dirname, '..', 'samples', 'java-spring.log'), 'utf8').split('\n');
const start = crash.findIndex((l) => l.startsWith('com.acmecorp.billing.discount.TierCapExceededException'));
const end = crash.findIndex((l) => l.includes('... 37 more'));
L.push(...crash.slice(start, end + 1));
while (L.length < 2000) L.push(noise());
fs.writeFileSync(require('path').join(__dirname, '..', 'samples', 'big-2000-lines.log'), L.join('\n') + '\n');
console.log('lines:', L.length, '| crash starts at line', L.findIndex((l) => l.startsWith('com.acmecorp')) + 1, '| size', (fs.statSync(require('path').join(__dirname, '..', 'samples', 'big-2000-lines.log')).size / 1024).toFixed(0) + ' KB');
