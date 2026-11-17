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

// the Picked app's stage demo: open the page in a new tab and leave the job for the panel, which runs it as soon as it opens
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.kind !== 'picked-demo' || !sender.tab) return;
  chrome.tabs.create({ url: msg.url }).then((tab) => {
    chrome.storage.session.set({ pending: { tabId: tab.id, action: msg.action } });
    // Chrome only opens the panel from a click; when it refuses, the presenter clicks the N icon and the panel picks the job up
    chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
  }).catch(console.error);
});
