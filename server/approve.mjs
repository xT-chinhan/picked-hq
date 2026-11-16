import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const cache = new Map();
const defaultDirectory = fileURLToPath(new URL('./data/approvals/', import.meta.url));
const validId = /^[A-Za-z0-9_-]{12}$/;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const percentage = (value) => value <= 1 ? value * 100 : value;
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function failure(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function filename(id) {
  return join(resolve(process.env.APPROVALS_DIR || defaultDirectory), `${id}.json`);
}

function persist(approval) {
  const path = filename(approval.id);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(approval, null, 2), { mode: 0o600, flag: 'wx' });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
  cache.set(path, structuredClone(approval));
}

/** Create and persist a pending approval. Confidence accepts fractions or percentages. */
export function createApproval({ runId, brand, docs, baseUrl }) {
  if (typeof runId !== 'string' || !runId || typeof brand !== 'string' || !brand
      || typeof baseUrl !== 'string' || !/^https?:\/\//.test(baseUrl)) {
    throw failure('runId, brand and an HTTP(S) baseUrl are required.', 400);
  }
  const keys = new Set();
  if (!Array.isArray(docs) || docs.length === 0 || docs.some((doc) => {
    if (!isObject(doc) || typeof doc.key !== 'string' || !doc.key || keys.has(doc.key)
        || typeof doc.title !== 'string' || typeof doc.summary !== 'string'
        || !Number.isFinite(doc.confidence) || doc.confidence < 0 || doc.confidence > 100
        || !Array.isArray(doc.flags) || doc.flags.some((flag) => typeof flag !== 'string')) return true;
    keys.add(doc.key);
    return false;
  })) throw failure('docs must contain unique keys, text, valid confidence and string flags.', 400);
  const id = randomBytes(9).toString('base64url');
  const approval = {
    id, runId, brand, docs: structuredClone(docs), url: `${baseUrl.replace(/\/+$/, '')}/approve/${id}`,
    status: 'pending', decisions: {}, createdAt: new Date().toISOString(),
  };
  persist(approval);
  return approval;
}

/** Read an approval from memory or disk; return null for an unknown ID. */
export function getApproval(id) {
  if (typeof id !== 'string' || !validId.test(id)) return null;
  const path = filename(id);
  if (cache.has(path)) return structuredClone(cache.get(path));
  let approval;
  try {
    approval = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  cache.set(path, approval);
  return structuredClone(approval);
}

/** Generate a QR code for the owner's approval link. */
export async function qrDataUrl(url) {
  return QRCode.toDataURL(url, { margin: 1, width: 280 });
}

/** Validate and persist one final decision for every document. */
export function decideApproval(id, decisions) {
  const approval = getApproval(id);
  if (!approval) throw failure('Approval not found.', 404);
  if (approval.status !== 'pending') throw failure('Approval has already been decided.', 409);
  const keys = new Set(approval.docs.map((doc) => doc.key));
  if (!isObject(decisions) || Object.keys(decisions).length !== keys.size
      || Object.entries(decisions).some(([key, value]) => !keys.has(key) || !['approve', 'reject'].includes(value))) {
    throw failure('Provide approve or reject for every document, using only known document keys.', 400);
  }
  const updated = {
    ...approval, decisions: structuredClone(decisions),
    status: Object.values(decisions).includes('approve') ? 'approved' : 'rejected',
    decidedAt: new Date().toISOString(),
  };
  persist(updated);
  return updated;
}

/** Render an escaped, self-contained mobile approval page or a read-only result. */
export function renderApprovalPage(approval) {
  const pending = approval.status === 'pending';
  const cards = approval.docs.map((doc, index) => {
    const confidence = percentage(doc.confidence);
    const selected = doc.flags.length || confidence < 90 ? 'reject' : 'approve';
    const controls = pending ? `<fieldset data-key="${escapeHtml(doc.key)}"><legend>Decision</legend>${['approve', 'reject'].map((value) => `<label><input type="radio" name="decision-${index}" value="${value}"${selected === value ? ' checked' : ''}> ${value === 'approve' ? 'Approve' : 'Reject'}</label>`).join('')}</fieldset>`
      : `<p class="result">${approval.decisions[doc.key] === 'approve' ? 'Approved' : 'Rejected'}</p>`;
    return `<article><h2>${escapeHtml(doc.title)}</h2><span class="chip ${confidence >= 90 ? 'green' : 'amber'}">${escapeHtml(Number(confidence.toFixed(2)))}% confidence</span><p class="summary">${escapeHtml(doc.summary)}</p>${doc.flags.length ? `<ul>${doc.flags.map((flag) => `<li>${escapeHtml(flag)}</li>`).join('')}</ul>` : ''}${controls}</article>`;
  }).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Review ${escapeHtml(approval.brand)}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#fff;color:#172033;font-family:system-ui,sans-serif}main{max-width:720px;margin:auto;padding:24px 18px 120px}h1{font-size:28px}h2{font-size:20px;margin-top:0}article{border:1px solid #e5e7eb;border-radius:16px;padding:20px;margin:20px 0;overflow-wrap:anywhere}.summary{white-space:pre-wrap;line-height:1.6}.chip{display:inline-block;border-radius:20px;padding:5px 10px;font-size:13px}.green{background:#dcfce7;color:#166534}.amber{background:#fef3c7;color:#92400e}fieldset{border:0;padding:0;margin-top:20px}legend{margin-bottom:8px}label{display:inline-flex;align-items:center;padding:12px;border:1px solid #e5e7eb;border-radius:10px;margin-right:8px;cursor:pointer}input{accent-color:#4f46e5}footer{position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:1px solid #e5e7eb;padding:14px 18px calc(14px + env(safe-area-inset-bottom));text-align:center}button{background:#4f46e5;color:white;border:0;border-radius:10px;padding:15px 24px;font:inherit;cursor:pointer;width:100%;max-width:684px}button:disabled{opacity:.6}#error{color:#92400e;margin:0 0 8px}.result{font-weight:600}
</style></head><body><main><h1>${escapeHtml(approval.brand)}</h1><p>${pending ? 'Review each document and confirm your choices.' : `Review complete: ${escapeHtml(approval.status)}.`}</p>${cards}</main>${pending ? `<footer><p id="error" role="alert"></p><button id="submit" type="button" data-endpoint="/api/approve/${escapeHtml(approval.id)}">Approve selected</button></footer>
<script>
const button = document.getElementById('submit');
button.addEventListener('click', async () => {
  button.disabled = true;
  document.getElementById('error').textContent = '';
  const decisions = Object.fromEntries(Array.from(document.querySelectorAll('fieldset[data-key]'), field => [field.dataset.key, field.querySelector('input:checked').value]));
  try {
    const response = await fetch(button.dataset.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decisions }) });
    if (!response.ok) throw new Error('Unable to save your choices. Please try again.');
    const main = document.createElement('main');
    const heading = document.createElement('h1');
    heading.textContent = 'Thanks — you can close this page';
    main.append(heading);
    document.body.replaceChildren(main);
  } catch (error) {
    document.getElementById('error').textContent = error.message;
    button.disabled = false;
  }
});
</script>` : ''}</body></html>`;
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > 20 * 1024) {
        chunks.length = 0;
        reject(failure('Request body exceeds 20 KB.', 413));
      } else chunks.push(Buffer.from(chunk));
    });
    req.on('end', () => {
      if (size > 20 * 1024) return;
      try { resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(failure('Request body must be valid JSON.', 400)); }
    });
    req.on('error', reject);
    req.on('aborted', () => reject(failure('Request was aborted.', 400)));
  });
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

/** Handle approval HTTP routes; resolves to false for unrelated routes. */
export async function handleApprovalRequest(req, res, { onDecision } = {}) {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const match = /^\/(api\/)?approve\/([^/]+)$/.exec(pathname);
  if (!match) return false;
  const [, api, id] = match;
  if (!(req.method === 'GET' || (api && req.method === 'POST'))) return false;
  try {
    const approval = getApproval(id);
    if (!approval) throw failure('Approval not found.', 404);
    if (req.method === 'GET') {
      if (api) send(res, 200, { id, status: approval.status, decisions: approval.decisions });
      else send(res, 200, renderApprovalPage(approval), 'text/html; charset=utf-8');
    } else {
      if (approval.status !== 'pending') throw failure('Approval has already been decided.', 409);
      const body = await readBody(req);
      const updated = decideApproval(id, body?.decisions);
      if (onDecision) await onDecision(updated);
      send(res, 200, { ok: true });
    }
  } catch (error) {
    send(res, error.statusCode || 500, { error: error.statusCode ? error.message : 'Unable to process approval.' });
  }
  return true;
}
