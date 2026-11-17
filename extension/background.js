chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'ask-nan', title: 'Ask NaN about this page', contexts: ['page', 'selection'] });
  });
});

function openForTab(tab, selectionText = '') {
  if (!Number.isInteger(tab?.id)) return;
  // Invoke open before any await to retain the user's activation.
  const opening = chrome.sidePanel.open
    ? chrome.sidePanel.open({ tabId: tab.id })
    : Promise.reject(new Error('Open the NaN panel from the extension icon; the shortcut needs Chrome 116 or newer.'));
  const storing = chrome.storage.session.set({ pending: { tabId: tab.id, selectionText } });
  Promise.all([opening, storing]).catch(console.error);
}
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'ask-nan') openForTab(tab, info.selectionText || '');
});
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'ask-nan') openForTab(tab);
});
