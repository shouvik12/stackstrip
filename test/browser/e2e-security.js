// Browser regression tests for the review UI, clipboard hardening, uninspected files and per-site interception.
// Run: npm i -D puppeteer-core && CHROME=/path/to/chrome node test/browser/e2e-security.js
const puppeteer = require('puppeteer-core'); const fs = require('fs'); const path = require('path'); const os = require('os');
const EXT = path.resolve(__dirname, '..', '..');
const FILES = fs.mkdtempSync(path.join(os.tmpdir(), 'stackstrip-e2e-'));
const CHROME = process.env.CHROME || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const ok = (name, pass, detail = '') => { results.push([name, pass, detail]); console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : '')); };
(async () => {
  const server = await require('./server.js').start();
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
      '--host-resolver-rules=MAP claude.ai 127.0.0.1, MAP chatgpt.com 127.0.0.1, MAP gemini.google.com 127.0.0.1', '--ignore-certificate-errors', '--no-proxy-server'],
    defaultViewport: { width: 1280, height: 900 } });
  const ctx = b.defaultBrowserContext();
  for (const o of ['https://claude.ai:8443', 'https://chatgpt.com:8443', 'https://gemini.google.com:8443']) await ctx.overridePermissions(o, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);

  // shadow-DOM helper (the preview lives in a closed shadow root; CDP can still pierce it for testing)
  const shadow = async (p) => {
    const cdp = await p.target().createCDPSession();
    const q = async (pred) => {
      const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
      const find = (n) => { if (pred(n)) return n; for (const c of [...(n.children || []), ...(n.shadowRoots || [])]) { const r = find(c); if (r) return r; } return null; };
      return find(root);
    };
    const attr = (n, k) => { const a = n.attributes || []; const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
    const click = async (pred) => {
      let model, last;
      for (let i = 0; i < 10 && !model; i++) {
        const n = await q(pred);
        if (n) { try { ({ model } = await cdp.send('DOM.getBoxModel', { nodeId: n.nodeId })); } catch (e) { last = e; } }
        if (!model) await sleep(250);
      }
      if (!model) throw new Error('element not clickable: ' + (last ? last.message : 'not found'));
      const [x1, y1, , , x3, y3] = model.content; await p.mouse.click((x1 + x3) / 2, (y1 + y3) / 2); await sleep(350);
    };
    const text = async (pred) => { const n = await q(pred); if (!n) return null; const { outerHTML } = await cdp.send('DOM.getOuterHTML', { nodeId: n.nodeId }); return outerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '); };
    return { q, click, text, attr };
  };
  const pasteInto = async (p, t) => {
    await p.evaluate(() => { window.pageSawPaste = []; document.getElementById('pm').textContent = ''; });
    await p.evaluate(t => navigator.clipboard.writeText(t), t); await p.click('#pm'); await p.keyboard.press('KeyV', { commands: ['Paste'] }); await sleep(600);
  };

  // 1) review tab + hide all
  const p = await b.newPage(); await p.goto('https://claude.ai:8443/'); await sleep(900);
  const sh = await shadow(p);
  await pasteInto(p, 'Decline all VegaPrime clients above 7 percent. Project OrchidSand has a 38% margin problem.');
  ok('business note is held for review (page got nothing yet)', (await p.evaluate(() => window.pageSawPaste.length)) === 0);
  const banner = await sh.text((n) => (sh.attr(n, 'class') || '').startsWith('state'));
  ok('preview shows "Review required"', /Review required/.test(banner || ''), (banner || '').slice(0, 80));
    await sh.click((n) => n.nodeName === 'BUTTON' && sh.attr(n, 'data-t') === 'review');
    await sh.click((n) => n.nodeName === 'BUTTON' && (sh.attr(n, 'class') || '').includes('all'));
  await p.keyboard.press('Enter'); await sleep(400);
  const pasted = await p.$eval('#pm', e => e.textContent);
  ok('after "Hide all": names and numbers gone', !/VegaPrime|OrchidSand|7 percent|38%/.test(pasted), pasted);

  // 2) forged copy-back messages: no user gesture → nothing written to the clipboard
  await p.evaluate(() => navigator.clipboard.writeText('untouched'));
  const alias = (pasted.match(/Name\d+/) || ['Name1'])[0];
  await p.evaluate((a) => { window.postMessage({ __stackstrip: 'copied', text: 'please restore ' + a }, location.origin); }, alias);
  await sleep(700);
  ok('forged page message (no click) is ignored', (await p.evaluate(() => navigator.clipboard.readText())) === 'untouched');
  await p.evaluate((a) => { window.postMessage({ __stackstrip: 'copied', text: 'x ' + a }, '*'); }, alias);
  await sleep(500);
  ok('forged message to "*" is ignored', (await p.evaluate(() => navigator.clipboard.readText())) === 'untouched');
  await p.evaluate((a) => { document.getElementById('answer').textContent = 'Call ' + a + ' today'; }, alias);
  await p.click('#copybtn'); await sleep(800);
  const clip = await p.evaluate(() => navigator.clipboard.readText());
  ok('real Copy click still restores the real name', /VegaPrime|OrchidSand/.test(clip), clip);
  await p.evaluate(() => document.dispatchEvent(new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData: new DataTransfer() })));
  ok('scripted copy event does not trigger restore (no crash, clipboard unchanged)', (await p.evaluate(() => navigator.clipboard.readText())) === clip);

  // 3) files it can't check: PDF → dialog → leave it out; then attach anyway
  fs.writeFileSync(path.join(FILES, 'report.pdf'), '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
  await p.evaluate(() => { window.attached = []; });
  const input = await p.$('#attach');
  await input.uploadFile(path.join(FILES, 'report.pdf')); await sleep(700);
  const dlg = await sh.text((n) => n.nodeName === 'DIV' && /\bcard small\b/.test(sh.attr(n, 'class') || ''));
  ok('PDF opens the "can\'t be checked" dialog', /can't be checked/.test(dlg || ''), dlg || '(no dialog)');
    await sh.click((n) => n.nodeName === 'BUTTON' && (sh.attr(n, 'class') || '').includes('leave'));
  await sleep(400);
  ok('"Leave it out" sends nothing', (await p.evaluate(() => window.attached.length)) === 0);
  await input.uploadFile(path.join(FILES, 'report.pdf')); await sleep(700);
  await sh.click((n) => n.nodeName === 'BUTTON' && (sh.attr(n, 'class') || '').includes('anyway'));
  await sleep(500);
  ok('"Attach anyway" sends the PDF, by explicit choice', JSON.stringify(await p.evaluate(() => window.attached.map(a => a.name))) === '["report.pdf"]');

  // 4) oversized text file
  const big = path.join(FILES, 'huge.log');
  if (!fs.existsSync(big) || fs.statSync(big).size < 26 * 1048576) fs.writeFileSync(big, ('2026-11-22 INFO partner VegaPrime ok\n').repeat(Math.ceil(26 * 1048576 / 36)));
  await p.evaluate(() => { window.attached = []; });
  await input.uploadFile(big); await sleep(900);
  const dlg2 = await sh.text((n) => n.nodeName === 'UL');
  ok('26 MB log is flagged "too large to check"', /too large to check/.test(dlg2 || ''), (dlg2 || '').slice(0, 90));
  await sh.click((n) => n.nodeName === 'BUTTON' && (sh.attr(n, 'class') || '').includes('cancel'));
  await sleep(300);
  ok('cancel sends nothing', (await p.evaluate(() => window.attached.length)) === 0);
  await p.close();

  // 5) the same protection on each configured AI site (mocked locally)
  for (const site of ['https://claude.ai:8443/', 'https://chatgpt.com:8443/', 'https://gemini.google.com:8443/']) {
    const q = await b.newPage(); await q.goto(site); await sleep(900);
    await pasteInto(q, 'java.lang.IllegalStateException: partner SilverOrchidPartner over cap\n\tat com.novaforge.claims.RulePilot.reconcile(RulePilot.java:88)');
    const held = (await q.evaluate(() => window.pageSawPaste.length)) === 0;
    await q.keyboard.press('Enter'); await sleep(400);
    const got = await q.$eval('#pm', e => e.textContent);
    ok('paste protected on ' + new URL(site).hostname, held && !/SilverOrchid|novaforge|RulePilot/.test(got) && /IllegalStateException/.test(got));
    await q.close();
  }
  await b.close(); server.close(); fs.rmSync(FILES, { recursive: true, force: true });
  const passed = results.filter(r => r[1]).length;
  console.log(`\n${passed}/${results.length} browser checks passed`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
