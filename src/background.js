/* StackStrip background — opens (or focuses) the workspace tab. */
const APP = chrome.runtime.getURL('src/app.html');

async function openWorkspace() {
  const ctxs = chrome.runtime.getContexts ? await chrome.runtime.getContexts({ contextTypes: ['TAB'], documentUrls: [APP] }) : [];
  if (ctxs.length && ctxs[0].tabId > 0) {
    const tab = await chrome.tabs.update(ctxs[0].tabId, { active: true });
    if (tab) await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: APP });
  }
}

chrome.commands.onCommand.addListener((cmd) => { if (cmd === 'open-workspace') openWorkspace(); });
chrome.runtime.onMessage.addListener((msg) => { if (msg && msg.type === 'open-workspace') openWorkspace(); });
chrome.runtime.onInstalled.addListener(() => {
  // Drafts in the workspace live only in memory; let extension pages read them.
  if (chrome.storage.session.setAccessLevel) chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => {});
});

// Clicking the toolbar icon opens the StackStrip window (or switches to it).
chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL('src/app.html');
  const [ctx] = await chrome.runtime.getContexts({ contextTypes: ['TAB'], documentUrls: [url] });
  if (ctx) {
    await chrome.tabs.update(ctx.tabId, { active: true });
    await chrome.windows.update(ctx.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
});
