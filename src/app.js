/* StackStrip workspace — a full-page tab that stays open and keeps what you pasted. */
(() => {
  'use strict';
  const S = self.StackStrip;
  const $ = (id) => document.getElementById(id);
  const DEFAULTS = {
    enabled: true, mode: 'ask', restoreOnCopy: true, hidePrivateSource: true, aliasStrings: true, hideIdentity: true,
    trim: false, keepVisible: [], contextLines: 4, privatePrefixes: [], privateTerms: [], privateDomains: [],
  };
  const TOGGLES = ['hideIdentity', 'hidePrivateSource', 'aliasStrings', 'trim'];
  let settings = Object.assign({}, DEFAULTS);
  let table = S.createAliasTable();
  let lastOut = '', lastBack = '', fileName = '';

  // Drafts live in session storage: kept while Chrome is open, gone when it closes.
  const session = chrome.storage.session;
  const saveDraft = () => session.set({ draft: { input: $('in').value, answer: $('ans').value } }).catch(() => {});

  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ALIAS = /(?<![\w])(?:app\.mod\d+|App\.Ns\d+|Class\d+|method\d+|AppError\d+|func\d+|str\d+|Term\d+|ID-\d+|user\d+|machine\d+|project\d+|Person\d+|branch\d+|src\/file\d+\.\w+|app\/(?:module|file)\d+\.\w+|App\/File\d+\.\w+|\/app\/path\d+[\w.]*|host\d+\.example\.internal|mail\d+@example\.com|192\.0\.2\.\d+|198\.51\.100\.\d+|00000000-0000-4000-8000-\d{12})(?![\w])|<secret(?::[\w-]+)?>|<user>|<source hidden>|<query>|\.\.\. \d+ framework frames omitted[^\n]*|\[… [\d,]+ (?:log )?lines? omitted …\]|\[same stack trace repeated \d+ more times?\]/g;
  function hl(t, orig) {
    let o = '', last = 0;
    t.replace(ALIAS, (m, off) => {
      o += esc(t.slice(last, off));
      const c = /^<secret|^<user>/.test(m) ? 'sec' : /omitted|repeated|<source hidden>|<query>/.test(m) ? 'cut' : '';
      const tip = orig && orig.get(m) ? ' title="was: ' + esc(orig.get(m)) + '"' : '';
      o += '<mark' + (c ? ' class="' + c + '"' : '') + tip + '>' + esc(m) + '</mark>';
      last = off + m.length; return m;
    });
    return o + esc(t.slice(last));
  }
  const fmt = (n) => n.toLocaleString('en-US');
  const pl = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

  function opts() {
    return {
      hidePrivateSource: settings.hidePrivateSource, aliasStrings: settings.aliasStrings, hideIdentity: settings.hideIdentity,
      noCut: !settings.trim, keepVisible: settings.keepVisible, contextLines: settings.contextLines, privatePrefixes: settings.privatePrefixes,
      privateTerms: settings.privateTerms, privateDomains: settings.privateDomains,
    };
  }

  function run() {
    const raw = $('in').value;
    if (!raw.trim()) {
      $('out').innerHTML = ''; $('read').innerHTML = ''; $('hint').textContent = ''; $('copy').disabled = true; $('save').disabled = true; lastOut = '';
      $('hidden').innerHTML = ''; $('hiddenN').textContent = '';
      restore(); return;
    }
    const r = S.strip(raw, opts(), table);
    lastOut = r.text;
    chrome.storage.local.set({ aliasTable: table }).catch(() => {});
    $('out').innerHTML = hl(r.text, new Map(r.report.replacements.map((x) => [x.alias, x.original])));
    $('hidden').innerHTML = hiddenList(r.report);
    $('hiddenN').textContent = '(' + (r.report.replacements.length + r.report.secrets) + ')';
    $('copy').disabled = false;
    $('save').disabled = false;
    const p = r.report;
    const saved = p.tokensIn ? Math.max(0, Math.round((1 - p.tokensOut / p.tokensIn) * 100)) : 0;
    $('hint').textContent = r.changed ? 'highlights show what was replaced' : 'nothing private found';
    const cells = [
      [p.privateFrames, 'company frames renamed'],
      [Math.max(0, p.publicFrames - p.collapsedFrames), 'framework frames kept'],
      [p.identityHidden, 'traces of you hidden'],
      [p.namesHidden, 'names & values renamed'],
      [p.sourceHidden, 'source lines hidden'],
      [p.secrets, 'secrets removed'],
    ].filter((c) => c[0] > 0);
    cells.push([fmt(p.linesIn) + ' → ' + fmt(p.linesOut), 'lines']);
    if (saved > 0) cells.unshift([saved + '%', 'fewer tokens (~' + fmt(p.tokensIn) + ' → ~' + fmt(p.tokensOut) + ')', true]);
    $('read').innerHTML = cells.map(([v, k, big]) => '<div><b' + (big ? ' class="big"' : '') + '>' + esc(String(v)) + '</b><small>' + esc(k) + '</small></div>').join('');
    restore();
    showAliases();
  }

  // What "Don't hide" adds: a whole library for packages/namespaces, the exact name otherwise.
  const keepValue = (r) => (r.kind === 'pkg' || r.kind === 'ns') ? r.original.split('.').slice(0, 2).join('.') + '.' : r.original;
  const keepLabel = (r) => (r.kind === 'pkg' || r.kind === 'ns') ? 'Don\'t hide ' + r.original.split('.').slice(0, 2).join('.') + '.*' : 'Don\'t hide';
  function hiddenList(rep) {
    const groups = new Map();
    for (const r of rep.replacements) { if (!groups.has(r.label)) groups.set(r.label, []); groups.get(r.label).push(r); }
    let h = '';
    if (rep.secretList && rep.secretList.length) {
      h += '<div class="grp"><h4>Secrets <small>removed for good, never stored</small></h4><table>' + rep.secretList.map((s) =>
        '<tr><td class="o">' + esc(s.type) + (s.hints.length ? ' <small>' + s.hints.map(esc).join(', ') + '</small>' : '') +
        '</td><td class="ar">→</td><td class="a sec">&lt;secret&gt;</td><td class="c">×' + s.count + '</td></tr>').join('') + '</table></div>';
    }
    for (const [label, rows] of groups) {
      h += '<div class="grp"><h4>' + esc(label) + (rows.length > 1 ? 's' : '') + ' <small>' + rows.length + '</small></h4><table>' + rows.map((r) =>
        '<tr><td class="o">' + esc(r.original) + '</td><td class="ar">→</td><td class="a">' + esc(r.alias) + '</td><td class="c">×' + r.count +
        '</td><td class="k"><button class="keep" data-k="' + esc(keepValue(r)) + '" title="This is public — show it as is, now and in future pastes">' + esc(keepLabel(r)) + '</button></td></tr>').join('') + '</table></div>';
    }
    if (rep.linesDropped) h += '<div class="grp"><h4>Lines cut <small>' + fmt(rep.linesDropped) + '</small></h4><p>“Trim long logs to the failure” is on. Untick it to keep every line.</p></div>';
    if (rep.sourceHidden) h += '<div class="grp"><h4>Source code lines <small>' + rep.sourceHidden + '</small></h4><p>Your own code printed under the error was replaced with &lt;source hidden&gt;.</p></div>';
    return h || '<p>Nothing private found — this would go through unchanged.</p>';
  }

  function restore() {
    const ans = $('ans').value;
    if (!ans.trim()) { $('back').textContent = ''; $('rcount').textContent = ''; $('copyBack').disabled = true; lastBack = ''; return; }
    const r = S.restore(ans, table);
    lastBack = r.text;
    $('back').textContent = r.text;
    $('rcount').textContent = r.count ? pl(r.count, 'real name') + ' put back' : 'no aliases found in this answer';
    $('copyBack').disabled = false;
  }

  function showWords() {
    $('words').innerHTML = settings.privateTerms.map((w, i) => '<span>hide: ' + esc(w) + '<button data-i="' + i + '" title="Stop hiding this word">✕</button></span>').join('') +
      settings.keepVisible.map((w, i) => '<span class="kv">keep: ' + esc(w.replace(/\.$/, '.*')) + '<button data-kv="' + i + '" title="Hide this again">✕</button></span>').join('');
  }
  function showAliases() {
    const n = S.aliasCount(table);
    $('aliasInfo').textContent = n ? pl(n, 'name') + ' remembered on this computer, so answers can be turned back' : '';
  }

  async function copy(text, btn, label) {
    try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied ✓'; }
    catch (e) { btn.textContent = 'Select & copy'; }
    setTimeout(() => (btn.textContent = label), 1400);
  }

  // events
  let t = null;
  $('in').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { run(); saveDraft(); }, 120); });
  $('ans').addEventListener('input', () => { restore(); saveDraft(); });
  $('clear').onclick = () => { $('in').value = ''; $('ans').value = ''; fileName = ''; run(); saveDraft(); $('in').focus(); };

  // files: open, drop, save
  async function loadFile(f) {
    if (!f) return;
    if (f.size > 50 * 1024 * 1024) { $('hint').textContent = 'That file is over 50 MB — too big to open here.'; return; }
    const text = await f.text();
    if (/\u0000/.test(text.slice(0, 4096))) { $('hint').textContent = f.name + ' isn\'t a text file — StackStrip can only clean text.'; return; }
    fileName = f.name;
    $('in').value = text; run(); saveDraft();
  }
  $('openFile').onclick = () => $('fileIn').click();
  $('fileIn').onchange = (e) => { loadFile(e.target.files[0]); e.target.value = ''; };
  for (const el of [$('in'), $('out')]) {
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drag'); });
    el.addEventListener('dragleave', () => el.classList.remove('drag'));
    el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('drag'); loadFile(e.dataTransfer.files[0]); });
  }
  $('save').onclick = () => {
    const name = fileName ? S.hideNames(fileName, opts(), table).replace(/(\.[\w]+)?$/, (ext) => '.stripped' + (ext || '.txt')) : 'stripped-log.txt';
    const url = URL.createObjectURL(new Blob([lastOut + '\n'], { type: 'text/plain' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    $('save').textContent = 'Saved ✓'; setTimeout(() => ($('save').textContent = 'Save as file'), 1400);
  };
  $('copy').onclick = () => copy(lastOut, $('copy'), 'Copy stripped');
  $('copyBack').onclick = () => copy(lastBack, $('copyBack'), 'Copy');
  for (const k of TOGGLES) $(k).onchange = (e) => { settings[k] = e.target.checked; chrome.storage.sync.set({ settings }); run(); };
  const addWord = () => {
    const w = $('word').value.trim();
    if (w.length < 2) return;
    if (!settings.privateTerms.includes(w)) settings.privateTerms = settings.privateTerms.concat([w]);
    chrome.storage.sync.set({ settings });
    $('word').value = ''; showWords(); run();
  };
  $('addWord').onclick = addWord;
  $('word').addEventListener('keydown', (e) => { if (e.key === 'Enter') addWord(); });
  $('hidden').addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('button.keep');
    if (!b) return;
    if (!settings.keepVisible.includes(b.dataset.k)) settings.keepVisible = settings.keepVisible.concat([b.dataset.k]);
    chrome.storage.sync.set({ settings }); showWords(); run();
  });
  $('words').addEventListener('click', (e) => {
    const kv = e.target.dataset && e.target.dataset.kv;
    if (kv !== undefined) { settings.keepVisible = settings.keepVisible.filter((_, j) => j !== +kv); chrome.storage.sync.set({ settings }); showWords(); run(); return; }
    const i = e.target.dataset && e.target.dataset.i;
    if (i === undefined) return;
    settings.privateTerms = settings.privateTerms.filter((_, j) => j !== +i);
    chrome.storage.sync.set({ settings }); showWords(); run();
  });
  // stay in sync with the popup / other tabs
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area === 'sync' && ch.settings) { settings = Object.assign({}, DEFAULTS, ch.settings.newValue || {}); paintToggles(); showWords(); run(); }
    if (area === 'local' && ch.aliasTable && ch.aliasTable.newValue && ch.aliasTable.newValue !== table) {
      if (!ch.aliasTable.newValue.forward || Object.keys(ch.aliasTable.newValue.forward).length === 0) { table = S.createAliasTable(); run(); }
    }
  });
  function paintToggles() { for (const k of TOGGLES) $(k).checked = !!settings[k]; }

  (async () => {
    const [{ settings: s }, { aliasTable }, { draft }] = await Promise.all([
      chrome.storage.sync.get('settings'), chrome.storage.local.get('aliasTable'), session.get('draft').catch(() => ({})),
    ]);
    settings = Object.assign({}, DEFAULTS, s || {});
    if (aliasTable && aliasTable.forward) table = aliasTable;
    if (draft) { $('in').value = draft.input || ''; $('ans').value = draft.answer || ''; }
    paintToggles(); showWords(); run();
    $('in').focus();
  })();
})();
