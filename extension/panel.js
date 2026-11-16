import { extractPage } from './lib/extract.js';
import { getBase, setBase, post } from './lib/api.js';

const $ = (id) => document.getElementById(id);
let currentTab;
let page;
let busy = false;
let healthVersion = 0;
const offline = 'NaN-Team đang tạm khóa để phát triển dự án';

function message(text, kind = 'assistant') {
  const item = document.createElement('article');
  item.className = `message ${kind}`;
  item.textContent = text;
  $('messages').append(item);
  item.scrollIntoView?.({ block: 'nearest' });
  return item;
}
async function health() {
  const version = ++healthVersion;
  let ok = false;
  try {
    const response = await fetch(`${await getBase()}/api/health`, { signal: AbortSignal.timeout(10_000), credentials: 'omit' });
    const data = await response.json();
    ok = response.ok && data?.ok === true;
  } catch { /* The status conveys unavailable backends without blocking chat. */ }
  if (version !== healthVersion) return;
  $('status-dot').classList.toggle('online', ok);
  $('status-text').textContent = ok ? 'NaN sẵn sàng' : offline;
}
function showTab(tab) {
  if (currentTab?.id !== tab?.id || currentTab?.url !== tab?.url) page = undefined;
  currentTab = tab;
  $('tab-title').textContent = tab?.title || 'Chưa chọn trang';
  $('tab-title').title = tab?.url || '';
}
async function activeTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  showTab(tabs[0]);
}
async function snapshot() {
  if (!Number.isInteger(currentTab?.id)) throw new Error('Không tìm thấy trang đang mở.');
  const results = await chrome.scripting.executeScript({ target: { tabId: currentTab.id }, func: extractPage });
  const extracted = results[0]?.result;
  if (!extracted) throw new Error('Không đọc được trang này. Hãy mở một trang web thông thường.');
  page = extracted;
  return extracted;
}
function pageState(snapshot) {
  if (!snapshot) return {};
  const { url, title, description, schemaTypes, hasFaq } = snapshot;
  return { page: { url, title, description, schemaTypes, hasFaq } };
}
async function chat(text, snapshot = page) {
  message(text, 'user');
  const result = await post('/api/one/chat', { text, original: text, state: pageState(snapshot) });
  if (typeof result?.reply !== 'string') throw new Error('Máy chủ không trả về lời nhắn hợp lệ.');
  message(result.reply);
}
async function run(task) {
  if (busy) return;
  busy = true;
  for (const button of document.querySelectorAll('.actions button, #chat button')) button.disabled = true;
  try { await task(); } catch (error) { message(error.message || 'Thao tác thất bại.', 'error'); }
  finally {
    busy = false;
    for (const button of document.querySelectorAll('.actions button, #chat button')) button.disabled = false;
  }
}
function review(result) {
  const item = message('');
  const score = document.createElement('strong');
  score.textContent = `Điểm đánh giá: ${result.score}`;
  const summary = document.createElement('p');
  summary.textContent = result.summary;
  const list = document.createElement('ul');
  const labels = { pass: 'Đạt', warn: 'Cần chú ý', fail: 'Chưa đạt' };
  for (const check of result.checks || []) {
    const li = document.createElement('li');
    const title = document.createElement('span');
    title.textContent = `${labels[check.status] || 'Chưa rõ'} · ${check.label}`;
    const detail = document.createElement('small');
    detail.textContent = check.detail;
    li.append(title, detail); list.append(li);
  }
  item.append(score, summary, list);
}
$('review').addEventListener('click', () => run(async () => {
  await activeTab();
  review(await post('/api/page/review', { page: await snapshot() }));
}));
$('send-page').addEventListener('click', () => run(async () => {
  await activeTab();
  const extracted = await snapshot();
  await chat('Hãy giúp tôi cải thiện khả năng được AI đề xuất cho trang này.', extracted);
}));
$('chat').addEventListener('submit', (event) => {
  event.preventDefault();
  const text = $('input').value.trim();
  if (!text || busy) return;
  run(async () => { await chat(text); $('input').value = ''; });
});
$('settings').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    $('base').value = await setBase($('base').value);
    $('settings-result').textContent = 'Đã lưu máy chủ.';
    await health();
  } catch (error) { $('settings-result').textContent = error.message; }
});
async function consumePending(pending) {
  if (!pending || !Number.isInteger(pending.tabId)) return;
  try {
    showTab(await chrome.tabs.get(pending.tabId));
    if (pending.selectionText) $('input').value = pending.selectionText;
    $('input').focus();
    await chrome.storage.session.remove('pending');
  } catch (error) { message(error.message, 'error'); }
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes.pending?.newValue) consumePending(changes.pending.newValue);
  if (area === 'local' && changes.base) health();
});
chrome.tabs.onActivated.addListener(() => { activeTab().catch((error) => message(error.message, 'error')); });
chrome.tabs.onUpdated.addListener((id, change, tab) => {
  if (id === currentTab?.id && (change.url || change.title)) showTab(tab);
});
async function initialize() {
  $('base').value = await getBase();
  await activeTab();
  const { pending } = await chrome.storage.session.get('pending');
  await consumePending(pending);
  await health();
}
initialize().catch((error) => message(error.message, 'error'));
