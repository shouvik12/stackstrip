/* StackStrip content script — intercepts log pastes on AI chat sites. Runs in the extension's isolated world. */
(() => {
  'use strict';
  const S = self.StackStrip;
  if (!S || window.__stackstripLoaded) return;
  window.__stackstripLoaded = true;

  const DEFAULT_SETTINGS = {
    enabled: true,
    mode: 'ask',            // 'ask' = preview first, 'auto' = paste stripped right away
    restoreOnCopy: true,
    hidePrivateSource: true,
    aliasStrings: true,
    hideIdentity: true,
    scope: 'all',           // 'all' = check every paste and file, 'logs' = only logs / traces / terminal output
    trim: false,            // opt-in: cut long logs down to the failure
    skipMediaAck: false,    // don't ask about images / PDFs that can't be checked
    codeNames: 'business',  // 'business' = rename declared code names that point at the business; 'all' = every one
    keepVisible: [],        // names / libraries the user chose never to hide
    contextLines: 4,
    privatePrefixes: [],
    privateTerms: [],
    privateDomains: [],
  };

  let settings = Object.assign({}, DEFAULT_SETTINGS);
  let table = S.createAliasTable();

  // ---- storage --------------------------------------------------------------
  const alive = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; } };
  const store = chrome.storage;
  store.sync.get('settings').then((r) => { settings = Object.assign({}, DEFAULT_SETTINGS, r.settings || {}); }).catch(() => {});
  store.local.get('aliasTable').then((r) => { if (r.aliasTable && r.aliasTable.forward) table = r.aliasTable; }).catch(() => {});
  store.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.settings) settings = Object.assign({}, DEFAULT_SETTINGS, changes.settings.newValue || {});
    if (area === 'local' && changes.aliasTable) table = changes.aliasTable.newValue && changes.aliasTable.newValue.forward ? changes.aliasTable.newValue : S.createAliasTable();
  });
  const saveTable = () => { try { if (alive()) store.local.set({ aliasTable: table }).catch(() => {}); } catch (e) {} };
  const saveSettings = () => { try { if (alive()) store.sync.set({ settings }).catch(() => {}); } catch (e) {} };

  const engineOpts = () => ({
    hidePrivateSource: settings.hidePrivateSource,
    aliasStrings: settings.aliasStrings,
    hideIdentity: settings.hideIdentity,
    noCut: !settings.trim,
    keepVisible: settings.keepVisible,
    contextLines: settings.contextLines,
    privatePrefixes: settings.privatePrefixes,
    privateTerms: settings.privateTerms,
    privateDomains: settings.privateDomains,
    codeNames: settings.codeNames,
  });

  // ---- paste interception ---------------------------------------------------
  function isEditable(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    if (tag === 'TEXTAREA') return true;
    if (tag === 'INPUT') return /^(?:text|search|url|)$/i.test(el.type || '');
    return false;
  }

  function saveSelection(target) {
    if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
      return { kind: 'input', start: target.selectionStart, end: target.selectionEnd };
    }
    const sel = window.getSelection();
    return { kind: 'range', range: sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null };
  }

  function restoreSelection(target, saved) {
    target.focus();
    if (!saved) return;
    if (saved.kind === 'input') { try { target.setSelectionRange(saved.start, saved.end); } catch (e) {} return; }
    if (saved.range) { const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(saved.range); }
  }

  function insertText(target, saved, text) {
    restoreSelection(target, saved);
    // Let the site's own paste handler run (keeps formatting / attachment behaviour), with our text.
    let handled = false;
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      handled = !target.dispatchEvent(ev);
    } catch (e) {}
    if (!handled) document.execCommand('insertText', false, text);
  }

  window.addEventListener('paste', (e) => {
    if (!e.isTrusted || !settings.enabled) return;
    const target = e.target && (e.target.closest ? e.target.closest('[contenteditable="true"], [contenteditable=""], textarea, input') : null) || e.target;
    if (!isEditable(target)) return;
    const dt = e.clipboardData;
    if (!dt) return;
    if (OURS.has(e)) return;
    if (handlePastedFiles(e, target)) return;
    const raw = dt.getData('text/plain');
    let detected = false, result;
    try {
      if (!raw || !raw.trim()) return;
      if (settings.scope === 'logs' && S.detectKinds(raw).every((k) => k === 'prose') && !S.containsKnown(raw, table)) return;
      detected = true;
      result = S.strip(raw, engineOpts(), table);
    } catch (err) {
      if (!detected) return;
      // Fail closed: never let a detected log through just because something broke.
      e.preventDefault();
      e.stopImmediatePropagation();
      toast('StackStrip hit an error, so this paste was blocked. Refresh the page and paste again.' + (alive() ? '' : ' (The extension was updated — a refresh is needed.)'));
      return;
    }
    if (!result.changed && !result.needsReview) return;

    // Nothing reaches the page until the user decides.
    e.preventDefault();
    e.stopImmediatePropagation();
    saveTable();

    if (!alive()) toast('StackStrip was updated — refresh this page so the new version runs.');
    const saved = saveSelection(target);
    if (settings.mode === 'auto' && !result.needsReview) {     // anything that needs review always gets the preview
      insertText(target, saved, result.text);
      toast(summaryLine(result.report) + ' — pasted stripped');
      return;
    }
    openPreview([{ name: null, raw, result }], {
      verb: 'Paste',
      onStripped: (docs) => insertText(target, saved, docs[0].result.text),
      onOriginal: () => insertText(target, saved, raw),
      onCancel: () => restoreSelection(target, saved),
    });
  }, true);

  // ---- restore on copy ------------------------------------------------------
  window.addEventListener('copy', (e) => {
    if (!e.isTrusted || !settings.enabled || !settings.restoreOnCopy) return;   // only a real ⌘C, never a scripted copy
    const sel = String(window.getSelection() || '');
    if (!sel) return;
    const r = S.restore(sel, table);
    if (!r.count) return;
    e.clipboardData.setData('text/plain', r.text);
    e.preventDefault();
    toast('Restored ' + r.count + ' real name' + (r.count === 1 ? '' : 's') + ' in what you copied');
  }, true);

  // Copy buttons in the chat UI use navigator.clipboard — main-world.js tells us what was copied.
  // Page scripts can post the same message, so it is only honoured right after a *trusted* user action
  // (a real click or key press, which page scripts cannot fake), once per action, and never answered:
  // the restored text goes straight to the clipboard from this isolated world, never back to the page.
  let lastGesture = 0, lastUsedGesture = -1;
  for (const type of ['pointerdown', 'mousedown', 'keydown', 'touchstart']) {
    window.addEventListener(type, (ev) => { if (ev.isTrusted) lastGesture = Date.now(); }, true);
  }
  const recentGesture = () => Date.now() - lastGesture < 1500 || !!(navigator.userActivation && navigator.userActivation.isActive && Date.now() - lastGesture < 5000);
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== location.origin || !e.data || e.data.__stackstrip !== 'copied') return;
    if (!settings.enabled || !settings.restoreOnCopy) return;
    if (typeof e.data.text !== 'string' || !e.data.text || e.data.text.length > 500000) return;
    if (!recentGesture() || lastUsedGesture === lastGesture) return;   // forged, or a second message for the same click
    lastUsedGesture = lastGesture;
    const r = S.restore(e.data.text, table);
    if (!r.count) return;
    navigator.clipboard.writeText(r.text).then(
      () => toast('Restored ' + r.count + ' real name' + (r.count === 1 ? '' : 's') + ' in the copied answer'),
      () => {}
    );
  });

  // ---- UI -------------------------------------------------------------------
  let host = null, root = null;
  function ensureRoot() {
    if (root) return root;
    host = document.createElement('stackstrip-ui');
    host.style.cssText = 'all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;';
    (document.body || document.documentElement).appendChild(host);
    root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = CSS;
    root.appendChild(style);
    return root;
  }

  const fmt = (n) => n.toLocaleString('en-US');
  function summaryLine(r) {
    const parts = [];
    if (r.privateFrames) parts.push(r.privateFrames + ' company frame' + (r.privateFrames === 1 ? '' : 's') + ' aliased');
    if (r.identityHidden) parts.push('your username & machine hidden');
    if (r.secrets) parts.push(r.secrets + ' secret' + (r.secrets === 1 ? '' : 's') + ' redacted');
    const saved = r.tokensIn ? Math.round((1 - r.tokensOut / r.tokensIn) * 100) : 0;
    if (saved > 0) parts.push(saved + '% fewer tokens');
    return 'StackStrip: ' + (parts.join(' · ') || 'log cleaned');
  }

  function esc(s) { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  const ALIAS_RE = /(?<![\w])(?:app\.mod\d+|App\.Ns\d+|Class\d+|method\d+|AppError\d+|func\d+|str\d+|Term\d+|ID-\d+|user\d+|machine\d+|project\d+|Person\d+|branch\d+|src\/file\d+\.\w+|app\/(?:module|file)\d+\.\w+|App\/File\d+\.\w+|\/app\/path\d+[\w.]*|host\d+\.example\.internal|mail\d+@example\.com|192\.0\.2\.\d+|198\.51\.100\.\d+|00000000-0000-4000-8000-\d{12})(?![\w])|<secret(?::[\w-]+)?>|<user>|<source hidden>|<query>|\.\.\. \d+ framework frames omitted[^\n]*|\[… \d+ log lines? omitted …\]/g;

  function highlight(text, orig) {
    let out = '', last = 0;
    text.replace(ALIAS_RE, (m, off) => {
      out += esc(text.slice(last, off));
      const cls = /^<secret|^<user>/.test(m) ? 'sec' : /omitted|<source hidden>|<query>/.test(m) ? 'cut' : 'al';
      const tip = orig && orig.get(m) ? ' title="was: ' + esc(orig.get(m)) + '"' : '';
      out += '<mark class="' + cls + '"' + tip + '>' + esc(m) + '</mark>';
      last = off + m.length;
      return m;
    });
    return out + esc(text.slice(last));
  }

  // docs: [{ name|null, raw, result }]; ui: { verb, onStripped(docs), onOriginal(), onCancel() }
  function openPreview(docs, ui) {
    const r = ensureRoot();
    const prev = r.querySelector('.overlay');
    if (prev) prev.remove();
    const isFiles = docs.some((d) => d.name);
    const wrap = document.createElement('div');
    wrap.className = 'overlay';
    wrap.innerHTML = `
      <div class="card" role="dialog" aria-label="StackStrip preview">
        <header>
          <div class="brand"><span class="logo"></span><b>StackStrip</b><span class="tag">Debug the failure, not the company's internals.</span></div>
          <button class="x" title="Cancel (Esc)">✕</button>
        </header>
        <div class="files" ${isFiles ? '' : 'hidden'}></div>
        <div class="stats"></div>
        <div class="state"></div>
        <div class="tabs" role="tablist">
          <button class="tab on" data-t="out" role="tab">What the AI will see</button>
          <button class="tab" data-t="hidden" role="tab">What was hidden <span class="n"></span></button>
          <button class="tab warn" data-t="review" role="tab" hidden>Review <span class="n"></span></button>
        </div>
        <pre class="out" tabindex="0"></pre>
        <div class="hidden" hidden></div>
        <div class="review" hidden></div>
        <div class="hide">
          <input type="text" placeholder="Still see something private? Type a word to hide it everywhere (e.g. your company name)" />
          <button class="ghost add">Hide word</button>
        </div>
        <footer>
          <span class="hint">${isFiles
            ? 'Stripped copies are attached in place of the originals (file names cleaned too). Images and PDFs go through as they are.'
            : 'Only this stripped text gets pasted — highlights show what was replaced.'} Copy the AI's answer and your real names come back.</span>
          <div class="btns">
            <button class="ghost orig">${ui.verb} original${docs.length > 1 ? 's' : ''}</button>
            <button class="primary go">${ui.verb} stripped ↵</button>
          </div>
        </footer>
      </div>`;
    r.appendChild(wrap);
    host.style.pointerEvents = 'auto';

    const $ = (s) => wrap.querySelector(s);
    let idx = 0;
    const chosen = [];                         // values the user chose to hide from the Review tab (this preview only)
    const restripAll = () => { for (const d of docs) d.result = S.strip(d.raw, Object.assign(engineOpts(), { hideValues: chosen }), table); saveTable(); };

    function render() {
      if (isFiles) {
        $('.files').innerHTML = docs.map((d, i) => {
          const n = d.result.report.replacements.length + d.result.report.secrets;
          return `<button class="file${i === idx ? ' on' : ''}" data-i="${i}">📄 ${esc(fileNameOut(d))}<span>${n ? n + ' hidden' : 'nothing private'}</span></button>`;
        }).join('');
      }
      const cur = docs[idx].result;
      const rep = cur.report;
      const saved = rep.tokensIn ? Math.max(0, Math.round((1 - rep.tokensOut / rep.tokensIn) * 100)) : 0;
      const chips = [
        ['Company frames aliased', rep.privateFrames],
        ['Framework frames kept', Math.max(0, rep.publicFrames - rep.collapsedFrames)],
        ['You (user, machine, folders) hidden', rep.identityHidden],
        ['Names & values renamed', rep.namesHidden],
        ['Source lines hidden', rep.sourceHidden],
        ['Secrets redacted', rep.secrets],
      ].filter(([, v]) => v > 0);
      chips.push(['Lines', fmt(rep.linesIn) + ' → ' + fmt(rep.linesOut)]);
      chips.push(['Tokens', '~' + fmt(rep.tokensIn) + ' → ~' + fmt(rep.tokensOut) + (saved ? ' (−' + saved + '%)' : '')]);
      $('.stats').innerHTML = chips.map(([k, v]) => `<div class="chip"><span>${esc(String(v))}</span>${esc(k)}</div>`).join('');
      const orig = new Map(rep.replacements.map((x) => [x.alias, x.original]));
      $('.out').innerHTML = highlight(cur.text.length > 400000 ? cur.text.slice(0, 400000) + '\n[… preview shortened — the whole file is stripped and attached …]' : cur.text, orig);
      $('.hidden').innerHTML = hiddenList(rep);
      const total = docs.reduce((a, d) => a + d.result.report.replacements.length + d.result.report.secrets, 0);
      $('.tab[data-t=hidden] .n').textContent = '(' + (rep.replacements.length + rep.secrets) + (isFiles && docs.length > 1 ? ' · ' + total + ' in all files' : '') + ')';
      const review = rep.review || [];
      const rt = $('.tab[data-t=review]');
      rt.hidden = !review.length;
      rt.querySelector('.n').textContent = '(' + review.length + ')';
      if (!review.length && !$('.review').hidden) { $('.review').hidden = true; $('.out').hidden = false; wrap.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x.dataset.t === 'out')); }
      $('.review').innerHTML = reviewList(review);
      const st = rep.state || 'protected';
      $('.state').className = 'state is-' + st;
      $('.state').innerHTML = st === 'review'
        ? '<b>⚠ Review required.</b> ' + review.length + ' thing' + (review.length === 1 ? '' : 's') + ' StackStrip can\'t judge — business numbers, formulas or confidential wording. <a href="#" class="go-review">Check them</a>'
        : '<b>✓ Known patterns hidden.</b> Names, hosts, secrets and company code it recognises are replaced. It can\'t guarantee nothing else is private — glance at the text before you send.';
      const gr = $('.state .go-review');
      if (gr) gr.onclick = (ev) => { ev.preventDefault(); rt.click(); };
    }
    render();

    const close = () => { wrap.remove(); host.style.pointerEvents = 'none'; document.removeEventListener('keydown', onKey, true); };
    const done = (fn) => { close(); fn(); };

    $('.files').addEventListener('click', (ev) => {
      const b = ev.target.closest && ev.target.closest('button.file');
      if (!b) return;
      idx = +b.dataset.i; render();
    });
    wrap.querySelectorAll('.tab').forEach((b) => (b.onclick = () => {
      wrap.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === b));
      $('.out').hidden = b.dataset.t !== 'out';
      $('.hidden').hidden = b.dataset.t !== 'hidden';
      $('.review').hidden = b.dataset.t !== 'review';
    }));
    $('.review').addEventListener('click', (ev) => {
      const b = ev.target.closest && ev.target.closest('button');
      if (!b) return;
      const cur = docs[idx].result.report.review || [];
      const pick = b.classList.contains('all') ? cur.map((f) => f.text) : [b.dataset.v];
      for (const v of pick) if (v && !chosen.includes(v)) chosen.push(v);
      restripAll();
      render();
      toast(pick.length === 1 ? 'Hidden in this paste — copy-back will put it back' : 'Hid ' + pick.length + ' items in this paste');
    });
    $('.hidden').addEventListener('click', (ev) => {
      const b = ev.target.closest && ev.target.closest('button.keep');
      if (!b) return;
      const k = b.dataset.k;
      if (!settings.keepVisible.includes(k)) settings.keepVisible = settings.keepVisible.concat([k]);
      saveSettings();
      restripAll();
      render();
      toast('Won\'t hide ' + k.replace(/\.$/, '.*') + ' any more — undo in the StackStrip menu');
    });
    $('.x').onclick = () => done(ui.onCancel);
    $('.go').onclick = () => done(() => ui.onStripped(docs));
    $('.orig').onclick = () => done(ui.onOriginal);
    wrap.addEventListener('mousedown', (ev) => { if (ev.target === wrap) done(ui.onCancel); });

    const addWord = () => {
      const input = $('.hide input');
      const word = input.value.trim();
      if (word.length < 2) return;
      if (!settings.privateTerms.includes(word)) settings.privateTerms = settings.privateTerms.concat([word]);
      saveSettings();
      restripAll();
      input.value = '';
      render();
    };
    $('.add').onclick = addWord;
    $('.hide input').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); addWord(); } });

    function onKey(ev) {
      if (!wrap.isConnected) return;
      const inInput = ev.composedPath().some((n) => n && n.tagName === 'INPUT');
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); done(ui.onCancel); }
      else if (ev.key === 'Enter' && !inInput) { ev.preventDefault(); ev.stopPropagation(); done(() => ui.onStripped(docs)); }
    }
    document.addEventListener('keydown', onKey, true);
    setTimeout(() => $('.go').focus(), 0);
  }

  // ---- files: attach button, drag & drop, pasted files ------------------------------------------
  const OURS = new WeakSet();                 // events we re-dispatch ourselves
  const MAX_FILE = 25 * 1024 * 1024;
  const TEXT_EXT = /\.(?:log|logs|txt|text|out|err|stdout|stderr|trace|stack|dump|json|jsonl|ndjson|ya?ml|toml|ini|cfg|conf|config|cnf|properties|props|env|xml|csv|tsv|md|har|sql|sh|bash|zsh|ps1|bat|py|js|mjs|cjs|ts|tsx|jsx|java|kt|kts|scala|groovy|gradle|go|rs|rb|php|cs|fs|vb|c|cc|cpp|h|hpp|swift|m|dart|ex|exs|tf|tfvars|hcl|diff|patch|pem|crt|key)$/i;
  const NOT_TEXT = /\.(?:png|jpe?g|gif|webp|heic|bmp|tiff?|svg|ico|pdf|docx?|xlsx?|pptx?|numbers|pages|zip|gz|tgz|bz2|xz|7z|rar|tar|jar|war|mp4|mov|mp3|wav|webm|exe|dmg|pkg|bin|so|dylib|dll|class|wasm|psd|sketch|fig|p12|pfx|jks|keystore|kdbx|der|cer)$/i;
  const CREDENTIAL = /\.(?:pem|key|p12|pfx|jks|keystore|kdbx|ppk|asc|gpg|ovpn|der|cer|crt)$|(?:^|\/)(?:id_(?:rsa|dsa|ecdsa|ed25519)|\.?env(?:\.[\w-]+)?|credentials|secrets?(?:\.[\w-]+)?|\.npmrc|\.pypirc|\.netrc|kubeconfig)$/i;
  const MEDIA = /^(?:image|audio|video)\/|\.(?:png|jpe?g|gif|webp|heic|bmp|tiff?|svg|ico|pdf|mp4|mov|mp3|wav|webm)$/i;
  // Why a file can't be inspected (shown to the user, who must decide).
  function whyUninspected(f) {
    if (f.size > MAX_FILE && !NOT_TEXT.test(f.name)) return 'too large to check (' + (f.size / 1048576).toFixed(0) + ' MB, limit ' + (MAX_FILE / 1048576) + ' MB)';
    if (CREDENTIAL.test(f.name) && NOT_TEXT.test(f.name)) return 'looks like a key or credential store — can\'t be read';
    if (/^image\//.test(f.type) || /\.(?:png|jpe?g|gif|webp|heic|bmp|tiff?|svg|ico)$/i.test(f.name)) return 'image — text inside it can\'t be checked';
    if (/\.pdf$/i.test(f.name)) return 'PDF — can\'t be checked';
    if (/\.(?:docx?|xlsx?|pptx?|numbers|pages)$/i.test(f.name)) return 'Office document — can\'t be checked';
    if (/\.(?:zip|gz|tgz|bz2|xz|7z|rar|tar|jar|war)$/i.test(f.name)) return 'archive — contents can\'t be checked';
    return 'not a text file — can\'t be checked';
  }
  const maybeText = (f) => f && f.size <= MAX_FILE && !NOT_TEXT.test(f.name) && !/^(?:image|audio|video|font)\//.test(f.type || '') &&
    (settings.scope !== 'logs' || TEXT_EXT.test(f.name) || /^text\/|json|xml|yaml|toml|x-sh|javascript|x-log/.test(f.type || '') || (!f.type && !/\.\w{1,5}$/.test(f.name)));

  async function isText(f) {
    if (!maybeText(f)) return false;
    if (f.size === 0) return true;
    if (TEXT_EXT.test(f.name) && !/\.(?:key|crt|cer)$/i.test(f.name)) return true;
    if (/^application\/(?:pdf|zip|octet-stream|x-|vnd\.)/.test(f.type || '') && !/json|xml|yaml|sql|x-sh|x-httpd/.test(f.type)) return false;
    const head = new Uint8Array(await f.slice(0, 4096).arrayBuffer());
    let bad = 0;
    for (const b of head) if (b === 0 || (b < 9) || (b > 13 && b < 32)) bad++;
    return head.length === 0 || bad / head.length < 0.02;
  }

  function fileNameOut(d) { return d.name ? S.hideNames(d.name, engineOpts(), table) : ''; }

  async function readFiles(files) {
    const docs = [], other = [];
    for (const f of files) {
      if (maybeText(f) && await isText(f)) {
        const raw = await f.text();
        docs.push({ file: f, name: f.name, raw, result: S.strip(raw, engineOpts(), table) });
      } else other.push(f);
    }
    saveTable();
    return { docs, other };
  }

  const strippedFiles = (docs) => docs.map((d) => new File([d.result.text + (/\n$/.test(d.raw) && !/\n$/.test(d.result.text) ? '\n' : '')], fileNameOut(d) || d.name, { type: d.file.type || 'text/plain', lastModified: Date.now() }));
  const asDataTransfer = (files) => { const dt = new DataTransfer(); for (const f of files) dt.items.add(f); return dt; };

  // Shared flow: read → (nothing to hide? deliver originals) → preview → deliver.
  async function handleFiles(files, deliver, onCancel) {
    let docs, other;
    try { ({ docs, other } = await readFiles(files)); }
    catch (err) { console.warn('[StackStrip] reading files failed:', err); toast('StackStrip couldn\'t read that file, so it wasn\'t attached. Try again or use the workspace (⌥⇧S).'); onCancel(); return; }
    // Files StackStrip could not read are never passed on silently.
    const needAck = other.filter((f) => !(settings.skipMediaAck && MEDIA.test(f.type || f.name) && !CREDENTIAL.test(f.name)));
    if (needAck.length) {
      const decided = await askAboutUninspected(needAck);
      if (decided === 'cancel') { onCancel(); return; }
      if (decided === 'leave-out') other = other.filter((f) => !needAck.includes(f));
    }
    if (!docs.length || !docs.some((d) => d.result.changed || d.result.needsReview)) { deliver(docs.map((d) => d.file).concat(other)); return; }
    const sum = (k) => docs.reduce((a, d) => a + (d.result.report[k] || 0), 0);
    const strippedThen = (ds) => {
      deliver(strippedFiles(ds).concat(other));
      toast('StackStrip: attached ' + ds.length + ' stripped file' + (ds.length === 1 ? '' : 's') + ' · ' + (sum('namesHidden') + sum('identityHidden') + sum('privateFrames')) + ' names hidden' + (sum('secrets') ? ' · ' + sum('secrets') + ' secrets removed' : ''));
    };
    if (settings.mode === 'auto' && !docs.some((d) => d.result.needsReview)) { strippedThen(docs); return; }
    openPreview(docs, { verb: 'Attach', onStripped: strippedThen, onOriginal: () => deliver(docs.map((d) => d.file).concat(other)), onCancel });
  }

  // 1) the attach button: <input type="file">
  const fileInputHeld = new WeakSet();
  const isFileInput = (el) => el && el.tagName === 'INPUT' && el.type === 'file';
  window.addEventListener('input', (e) => {
    if (OURS.has(e) || !settings.enabled || !isFileInput(e.target)) return;
    if ((e.target.files || []).length) e.stopImmediatePropagation();   // the matching 'change' does the work
  }, true);
  window.addEventListener('change', (e) => {
    const input = e.target;
    if (OURS.has(e) || !settings.enabled || !isFileInput(input) || !input.files || !input.files.length) return;
    const files = [...input.files];
    if (fileInputHeld.has(input)) return;
    e.stopImmediatePropagation();
    fileInputHeld.add(input);
    const deliver = (out) => {
      fileInputHeld.delete(input);
      try { input.files = asDataTransfer(out).files; } catch (err) {}
      for (const type of ['input', 'change']) { const ev = new Event(type, { bubbles: true }); OURS.add(ev); input.dispatchEvent(ev); }
    };
    handleFiles(files, deliver, () => { fileInputHeld.delete(input); try { input.value = ''; } catch (err) {} });
  }, true);

  // 2) drag & drop
  window.addEventListener('drop', (e) => {
    if (OURS.has(e) || !settings.enabled || !e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
    const files = [...e.dataTransfer.files];
    e.preventDefault();
    e.stopImmediatePropagation();
    const target = e.target, x = e.clientX, y = e.clientY;
    const deliver = (out) => {
      const ev = new DragEvent('drop', { dataTransfer: asDataTransfer(out), bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y });
      OURS.add(ev);
      (target && target.isConnected ? target : document.body).dispatchEvent(ev);
    };
    handleFiles(files, deliver, () => {});
  }, true);

  // 3) files pasted with ⌘V (copied in Finder) — returns true when handled
  function handlePastedFiles(e, target) {
    const files = [...((e.clipboardData && e.clipboardData.files) || [])];
    if (!files.length) return false;
    e.preventDefault();
    e.stopImmediatePropagation();
    const saved = saveSelection(target);
    const deliver = (out) => {
      restoreSelection(target, saved);
      const ev = new ClipboardEvent('paste', { clipboardData: asDataTransfer(out), bubbles: true, cancelable: true });
      OURS.add(ev);
      target.dispatchEvent(ev);
    };
    handleFiles(files, deliver, () => restoreSelection(target, saved));
    return true;
  }

  const REVIEW_LABEL = { phrase: 'Sounds confidential', money: 'Money amount', number: 'Business number', formula: 'Formula' };
  function reviewList(review) {
    if (!review.length) return '<p class="m">Nothing left to review.</p>';
    return '<p class="m">StackStrip can\'t tell whether these are confidential. Numbers are left alone by default because the AI often needs them to debug. Hide what shouldn\'t leave — copy-back puts it back in the answer.</p>' +
      '<table>' + review.map((f) =>
        '<tr><td class="k1">' + esc(REVIEW_LABEL[f.kind] || f.kind) + '</td><td class="o">' + esc(f.text) +
        (f.count > 1 ? ' <span class="m">×' + f.count.toLocaleString('en-US') + '</span>' : '') +
        '<div class="m">' + esc(f.reason || '') + ' · line ' + f.line + '</div></td>' +
        '<td class="k"><button class="ghost hidev" data-v="' + esc(f.text) + '">Hide</button></td></tr>').join('') + '</table>' +
      '<div class="rowr"><button class="ghost all">Hide all ' + review.length + '</button></div>';
  }

  // Files StackStrip can't read are never passed on silently: the user decides, file by file list.
  function askAboutUninspected(files) {
    return new Promise((resolve) => {
      const r = ensureRoot();
      const wrap = document.createElement('div');
      wrap.className = 'overlay';
      wrap.innerHTML = `
        <div class="card small" role="dialog" aria-label="StackStrip — files it can't check">
          <header><div class="brand"><span class="logo"></span><b>StackStrip</b></div><button class="x" title="Cancel (Esc)">✕</button></header>
          <div class="body">
            <h3>${files.length === 1 ? 'This file' : 'These ' + files.length + ' files'} can't be checked</h3>
            <p class="m">StackStrip only cleans text. Anything inside ${files.length === 1 ? 'it' : 'them'} will be sent as is — nothing in ${files.length === 1 ? 'it' : 'them'} has been hidden.</p>
            <ul>${files.map((f) => '<li><b>' + esc(f.name) + '</b> — ' + esc(whyUninspected(f)) + '</li>').join('')}</ul>
            ${files.some((f) => MEDIA.test(f.type || f.name)) ? '<label class="m"><input type="checkbox" class="skip"> Don\'t ask again for images and PDFs</label>' : ''}
          </div>
          <footer><span></span><div class="btns">
            <button class="ghost cancel">Cancel</button>
            <button class="ghost leave">Leave ${files.length === 1 ? 'it' : 'them'} out</button>
            <button class="primary anyway">Attach anyway — not checked</button>
          </div></footer>
        </div>`;
      r.appendChild(wrap);
      host.style.pointerEvents = 'auto';
      const done = (v) => {
        const skip = wrap.querySelector('.skip');
        if (skip && skip.checked && v === 'attach') { settings.skipMediaAck = true; saveSettings(); }
        wrap.remove(); host.style.pointerEvents = 'none'; document.removeEventListener('keydown', onKey, true); resolve(v);
      };
      const onKey = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); done('cancel'); } };
      document.addEventListener('keydown', onKey, true);
      wrap.querySelector('.x').onclick = () => done('cancel');
      wrap.querySelector('.cancel').onclick = () => done('cancel');
      wrap.querySelector('.leave').onclick = () => done('leave-out');
      wrap.querySelector('.anyway').onclick = () => done('attach');
      setTimeout(() => wrap.querySelector('.leave').focus(), 0);
    });
  }

  // What "Don't hide" adds: a whole library for packages/namespaces, the exact name otherwise.
  const keepValue = (r) => (r.kind === 'pkg' || r.kind === 'ns') ? r.original.split('.').slice(0, 2).join('.') + '.' : r.original;
  const keepLabel = (r) => (r.kind === 'pkg' || r.kind === 'ns') ? 'Don\'t hide ' + r.original.split('.').slice(0, 2).join('.') + '.*' : 'Don\'t hide';
  // "What was hidden": every original → stand-in, grouped; secrets only by type with a masked hint.
  function hiddenList(rep) {
    const groups = new Map();
    for (const r of rep.replacements) {
      if (!groups.has(r.label)) groups.set(r.label, []);
      groups.get(r.label).push(r);
    }
    let h = '';
    if (rep.secretList && rep.secretList.length) {
      h += '<h4>Secrets — removed for good, never stored</h4><table>' + rep.secretList.map((s) =>
        '<tr><td class="o">' + esc(s.type) + (s.hints.length ? ' <span class="m">' + s.hints.map(esc).join(', ') + '</span>' : '') +
        '</td><td class="ar">→</td><td class="a sec">&lt;secret&gt;</td><td class="c">×' + s.count + '</td></tr>').join('') + '</table>';
    }
    for (const [label, rows] of groups) {
      h += '<h4>' + esc(label) + (rows.length > 1 ? 's' : '') + ' <span class="m">' + rows.length + '</span></h4><table>' + rows.map((r) =>
        '<tr><td class="o">' + esc(r.original) + '</td><td class="ar">→</td><td class="a">' + esc(r.alias) + '</td><td class="c">×' + r.count +
        '</td><td class="k"><button class="keep" data-k="' + esc(keepValue(r)) + '" title="This is public — show it as is, now and in future pastes">' + esc(keepLabel(r)) + '</button></td></tr>').join('') + '</table>';
    }
    if (rep.linesDropped) h += '<h4>Lines cut <span class="m">' + rep.linesDropped.toLocaleString('en-US') + '</span></h4><p class="m">“Trim long logs to the failure” is on. Turn it off in the StackStrip menu to keep every line.</p>';
    if (rep.sourceHidden) h += '<h4>Source code lines <span class="m">' + rep.sourceHidden + '</span></h4><p class="m">Lines of your own code printed under the error were replaced with &lt;source hidden&gt;.</p>';
    return h || '<p class="m">Nothing private was found — this paste goes through unchanged.</p>';
  }

  let toastTimer = null;
  function toast(msg) {
    const r = ensureRoot();
    let t = r.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; r.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  }

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .overlay { position: fixed; inset: 0; background: rgba(8, 10, 14, .55); backdrop-filter: blur(3px);
      display: flex; align-items: center; justify-content: center; padding: 24px; animation: fade .12s ease-out; }
    .card { width: min(920px, 100%); max-height: min(86vh, 900px); display: flex; flex-direction: column;
      background: #0f1218; color: #e6e9ef; border: 1px solid #262b36; border-radius: 14px;
      box-shadow: 0 30px 80px rgba(0,0,0,.5); overflow: hidden; }
    header { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid #1d222c; }
    .brand { display: flex; align-items: center; gap: 10px; font-size: 14px; }
    .brand b { font-weight: 700; letter-spacing: .2px; }
    .tag { color: #8a93a6; font-size: 12.5px; }
    .logo { width: 18px; height: 18px; border-radius: 5px; background:
      linear-gradient(#5eead4,#5eead4) 3px 4px/12px 2px no-repeat,
      linear-gradient(#f87171,#f87171) 3px 8px/7px 2px no-repeat,
      linear-gradient(#5eead4,#5eead4) 3px 12px/10px 2px no-repeat, #1b2130; }
    .x { background: none; border: 0; color: #8a93a6; font-size: 15px; cursor: pointer; padding: 4px 8px; border-radius: 6px; }
    .x:hover { background: #1b2130; color: #e6e9ef; }
    .stats { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 18px 4px; }
    .chip { background: #151a23; border: 1px solid #232937; border-radius: 999px; padding: 5px 11px; font-size: 12px; color: #9aa3b5; }
    .chip span { color: #5eead4; font-weight: 700; margin-right: 6px; font-variant-numeric: tabular-nums; }
    .files { display: flex; flex-wrap: wrap; gap: 6px; padding: 12px 18px 0; }
    .files[hidden] { display: none; }
    .file { background: #151a23; border: 1px solid #232937; color: #c9d1de; border-radius: 8px; padding: 6px 10px; font: 600 12.5px ui-sans-serif, system-ui, sans-serif; cursor: pointer; display: flex; gap: 8px; align-items: center; }
    .file span { color: #7d869a; font-weight: 400; }
    .file.on { border-color: #5eead4; color: #e6e9ef; }
    .state { margin: 8px 18px 0; padding: 8px 12px; border-radius: 8px; font-size: 12.5px; line-height: 1.45; }
    .state.is-protected { background: rgba(94,234,212,.08); color: #9fb7b2; border: 1px solid rgba(94,234,212,.18); }
    .state.is-protected b { color: #5eead4; }
    .state.is-review { background: rgba(251,191,36,.10); color: #e7d3a4; border: 1px solid rgba(251,191,36,.30); }
    .state.is-review b { color: #fbbf24; }
    .state a { color: #fbbf24; }
    .tab.warn { color: #fbbf24; } .tab.warn[hidden] { display: none; }
    .review { margin: 10px 18px; padding: 6px 14px 14px; flex: 1; overflow: auto; background: #0a0d12; border: 1px solid #1d222c; border-radius: 10px; min-height: 160px; }
    .review[hidden] { display: none; }
    .review table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    .review td { padding: 6px; border-bottom: 1px solid #161b24; vertical-align: top; }
    .review td.k1 { color: #fbbf24; white-space: nowrap; width: 1%; }
    .review td.o { color: #e6e9ef; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; word-break: break-word; }
    .review td.k { width: 1%; text-align: right; }
    .review .m, .card .m { color: #7d869a; font-size: 12px; }
    .review .rowr { display: flex; justify-content: flex-end; padding-top: 10px; }
    .card.small { width: min(560px, 100%); }
    .card .body { padding: 14px 18px; color: #c9d1de; font-size: 13.5px; }
    .card .body h3 { margin: 0 0 6px; font-size: 15px; color: #e6e9ef; }
    .card .body ul { margin: 10px 0; padding-left: 18px; } .card .body li { margin: 4px 0; }
    .tabs { display: flex; gap: 4px; padding: 10px 18px 0; }
    .tab { background: none; border: 0; border-bottom: 2px solid transparent; color: #8a93a6; font: 600 13px ui-sans-serif, system-ui, sans-serif; padding: 6px 10px; cursor: pointer; }
    .tab.on { color: #e6e9ef; border-bottom-color: #5eead4; }
    .tab .n { color: #5eead4; font-weight: 700; }
    .hidden { margin: 10px 18px; padding: 6px 14px 14px; flex: 1; overflow: auto; background: #0a0d12; border: 1px solid #1d222c; border-radius: 10px; min-height: 160px; }
    .hidden[hidden], .out[hidden] { display: none; }
    .hidden h4 { margin: 12px 0 4px; font-size: 12px; color: #9aa3b5; text-transform: uppercase; letter-spacing: .05em; }
    .hidden table { width: 100%; border-collapse: collapse; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .hidden td { padding: 2px 6px; border-bottom: 1px solid #161b24; vertical-align: top; }
    .hidden td.o { color: #e6e9ef; word-break: break-all; width: 58%; }
    .hidden td.ar { color: #4b5568; width: 16px; }
    .hidden td.a { color: #5eead4; white-space: nowrap; } .hidden td.a.sec { color: #fca5a5; }
    .hidden td.c { color: #6b7487; text-align: right; white-space: nowrap; }
    .hidden td.k { width: 1%; white-space: nowrap; text-align: right; }
    .hidden button.keep { background: none; border: 1px solid #262b36; color: #9aa3b5; border-radius: 6px; font: 500 11px ui-sans-serif, system-ui, sans-serif; padding: 2px 7px; cursor: pointer; opacity: .55; }
    .hidden tr:hover button.keep, .hidden button.keep:focus-visible { opacity: 1; color: #e6e9ef; border-color: #3b4558; }
    .hidden .m, .hidden p.m { color: #7d869a; font-weight: 400; text-transform: none; letter-spacing: 0; }
    .out { margin: 10px 18px; padding: 14px; flex: 1; overflow: auto; background: #0a0d12; border: 1px solid #1d222c; border-radius: 10px;
      font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #c9d1de; white-space: pre; min-height: 160px; }
    .out:focus { outline: 1px solid #2c3445; }
    mark { background: rgba(94,234,212,.13); color: #5eead4; border-radius: 3px; padding: 0 1px; font: inherit; }
    mark.sec { background: rgba(248,113,113,.14); color: #fca5a5; }
    mark.cut { background: transparent; color: #6b7487; font-style: italic; }
    .hide { display: flex; gap: 8px; padding: 0 18px 10px; }
    .hide input { flex: 1; background: #0a0d12; border: 1px solid #232937; border-radius: 8px; color: #e6e9ef; padding: 8px 10px; font-size: 12.5px; outline: none; }
    .hide input:focus { border-color: #3b4558; }
    footer { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 12px 18px 16px; border-top: 1px solid #1d222c; }
    .hint { color: #7d869a; font-size: 12px; line-height: 1.4; }
    .btns { display: flex; gap: 8px; flex-shrink: 0; }
    button.primary, button.ghost { border-radius: 8px; padding: 8px 14px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid transparent; }
    button.primary { background: #5eead4; color: #062a25; }
    button.primary:hover { background: #7ff0de; }
    button.primary:focus-visible { outline: 2px solid #e6e9ef; outline-offset: 2px; }
    button.ghost { background: #151a23; color: #c9d1de; border-color: #262b36; }
    button.ghost:hover { background: #1b2130; }
    .toast { position: fixed; right: 20px; bottom: 20px; max-width: 420px; background: #0f1218; color: #e6e9ef; border: 1px solid #262b36;
      border-left: 3px solid #5eead4; border-radius: 10px; padding: 10px 14px; font-size: 13px; box-shadow: 0 12px 30px rgba(0,0,0,.35);
      opacity: 0; transform: translateY(8px); transition: all .18s ease; pointer-events: none; }
    .toast.show { opacity: 1; transform: none; }
    @keyframes fade { from { opacity: 0 } to { opacity: 1 } }
    @media (max-width: 640px) { footer { flex-direction: column; align-items: stretch; } .tag { display: none; } }
  `;
})();
