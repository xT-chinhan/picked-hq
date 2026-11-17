// Runs only on the Picked app itself. It lets the app's stage demo hand a job to the extension (open a page, then read it in the panel).
// It reads nothing from the page and sends nothing else.
window.addEventListener('message', (e) => {
  if (e.source !== window || e.data?.source !== 'picked-demo') return;
  const { type, url } = e.data;
  if (!['deep', 'read', 'review'].includes(type) || !/^https?:\/\//.test(String(url))) return;
  chrome.runtime.sendMessage({ kind: 'picked-demo', action: type, url: String(url) }).catch(() => {});
  window.postMessage({ source: 'picked-ext', type: 'ack' }, location.origin);
});
