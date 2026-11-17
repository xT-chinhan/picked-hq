const DEFAULT_BASE = 'http://127.0.0.1:5198';
function normalize(url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('URL máy chủ không hợp lệ.'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('URL máy chủ phải dùng HTTP hoặc HTTPS, không chứa thông tin đăng nhập, truy vấn hay fragment.');
  }
  return parsed.href.replace(/\/+$/, '');
}
/** Return the configured backend URL, or the local default. */
export async function getBase() {
  const { base } = await chrome.storage.local.get('base');
  return base ? normalize(base) : DEFAULT_BASE;
}
/** Validate and persist an HTTP(S) backend URL. */
export async function setBase(url) {
  const base = normalize(url);
  await chrome.storage.local.set({ base });
  return base;
}
/** Whether a URL points to a loopback host. */
export function isLocalBase(url) {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol)
      && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  } catch { return false; }
}
/** POST JSON to the configured backend with a 60-second deadline. */
export async function post(path, body) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
    throw new Error('Đường dẫn API không hợp lệ.');
  }
  const response = await fetch(`${await getBase()}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(60_000), credentials: 'omit',
  });
  let data;
  try { data = await response.json(); }
  catch { throw new Error(`Máy chủ trả về dữ liệu không hợp lệ (HTTP ${response.status}).`); }
  if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : `Lỗi máy chủ (HTTP ${response.status}).`);
  return data;
}

/** Where the Picked app (the chat) lives. The server on this machine only serves the API, so a local server hands the visitor to the hosted app,
 *  which reaches this machine through its tunnel; any other server is assumed to serve the app itself. */
export async function appUrl() {
  const base = await getBase();
  return isLocalBase(base) ? 'https://pickedhq.pages.dev' : base;
}
