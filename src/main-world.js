/* StackStrip — runs in the page's own world, only to notice when a chat's "Copy" button writes to the clipboard.
 * It never sees your real names: it forwards the (aliased) copied text to the extension, which writes the
 * restored version to the clipboard from its isolated world. */
(() => {
  if (window.__stackstripMain || !navigator.clipboard) return;
  window.__stackstripMain = true;
  const notify = (text) => { try { window.postMessage({ __stackstrip: 'copied', text: String(text || '') }, location.origin); } catch (e) {} };

  const origWriteText = navigator.clipboard.writeText && navigator.clipboard.writeText.bind(navigator.clipboard);
  if (origWriteText) {
    navigator.clipboard.writeText = function (text) {
      const p = origWriteText(text);
      Promise.resolve(p).then(() => notify(text), () => {});
      return p;
    };
  }

  const origWrite = navigator.clipboard.write && navigator.clipboard.write.bind(navigator.clipboard);
  if (origWrite) {
    navigator.clipboard.write = function (items) {
      const p = origWrite(items);
      Promise.resolve(p).then(async () => {
        try {
          for (const item of items || []) {
            if (item.types && item.types.includes('text/plain')) {
              const blob = await item.getType('text/plain');
              notify(await blob.text());
              return;
            }
          }
        } catch (e) {}
      }, () => {});
      return p;
    };
  }
})();
