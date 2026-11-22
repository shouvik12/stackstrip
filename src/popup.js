(() => {
  const S = self.StackStrip;
  const DEFAULTS = {
    enabled: true, mode: 'ask', restoreOnCopy: true, hidePrivateSource: true, aliasStrings: true, hideIdentity: true, trim: false, keepVisible: [], scope: 'all', contextLines: 4,
    privatePrefixes: [], privateTerms: [], privateDomains: [],
  };
  const $ = (id) => document.getElementById(id);
  const list = (s) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  let settings = Object.assign({}, DEFAULTS);
  let table = S.createAliasTable();

  async function load() {
    const [{ settings: s }, { aliasTable }] = await Promise.all([chrome.storage.sync.get('settings'), chrome.storage.local.get('aliasTable')]);
    settings = Object.assign({}, DEFAULTS, s || {});
    if (aliasTable && aliasTable.forward) table = aliasTable;
    $('enabled').checked = settings.enabled;
    document.querySelector(`input[name=mode][value=${settings.mode}]`).checked = true;
    document.querySelector(`input[name=scope][value=${settings.scope}]`).checked = true;
    for (const k of ['restoreOnCopy', 'hidePrivateSource', 'aliasStrings', 'hideIdentity', 'trim']) $(k).checked = settings[k];
    for (const k of ['privateTerms', 'privatePrefixes', 'privateDomains', 'keepVisible']) $(k).value = settings[k].join(', ');
    showAliases();
  }

  function showAliases() {
    const n = S.aliasCount(table);
    $('aliasInfo').textContent = n ? n + ' name' + (n === 1 ? '' : 's') + ' remembered on this device' : 'No aliases yet';
    $('clear').disabled = !n;
  }

  const save = () => chrome.storage.sync.set({ settings });

  $('enabled').onchange = (e) => { settings.enabled = e.target.checked; save(); };
  document.querySelectorAll('input[name=mode]').forEach((r) => (r.onchange = (e) => { settings.mode = e.target.value; save(); }));
  document.querySelectorAll('input[name=scope]').forEach((r) => (r.onchange = (e) => { settings.scope = e.target.value; save(); }));
  for (const k of ['restoreOnCopy', 'hidePrivateSource', 'aliasStrings', 'hideIdentity', 'trim']) $(k).onchange = (e) => { settings[k] = e.target.checked; save(); };
  for (const k of ['privateTerms', 'privatePrefixes', 'privateDomains', 'keepVisible']) $(k).onchange = (e) => { settings[k] = list(e.target.value); save(); };

  $('clear').onclick = async () => {
    table = S.createAliasTable();
    await chrome.storage.local.set({ aliasTable: table });
    showAliases();
  };

  $('openApp').onclick = () => { chrome.runtime.sendMessage({ type: 'open-workspace' }); window.close(); };

  load();
})();
