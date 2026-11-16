import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { Readable } from 'node:stream';
import { parseHTML } from 'linkedom';
import {
  createApproval, getApproval, decideApproval, qrDataUrl, renderApprovalPage, handleApprovalRequest,
} from '../approve.mjs';

let directory;
let server;
let origin;
let listenError;
const notifications = [];
const previousDirectory = process.env.APPROVALS_DIR;
const docs = [
  { key: 'faq', title: 'FAQ <script>alert(1)</script>', summary: 'Thông tin & <img src=x onerror=alert(1)>\nDòng hai', confidence: 0.95, flags: [] },
  { key: 'overview', title: 'Overview', summary: 'Tổng quan', confidence: 98, flags: ['Check <b>claim</b>'] },
  { key: 'pitch', title: 'Pitch', summary: 'Giới thiệu', confidence: 0.89, flags: [] },
];
const create = () => createApproval({ runId: 'run-1', brand: 'Picked <&>', docs, baseUrl: 'https://example.test' });
const choices = { faq: 'approve', overview: 'reject', pitch: 'reject' };
const post = (id, decisions) => fetch(`${origin}/api/approve/${id}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decisions }),
});

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'picked-approvals-'));
  process.env.APPROVALS_DIR = directory;
  server = http.createServer(async (req, res) => {
    if (!await handleApprovalRequest(req, res, { onDecision: (approval) => notifications.push(approval) })) {
      res.writeHead(404);
      res.end('Unmatched route');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  }).catch((error) => {
    if (error.code !== 'EPERM' && error.code !== 'EACCES') throw error;
    listenError = error;
  });
  if (listenError) return;
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  if (previousDirectory === undefined) delete process.env.APPROVALS_DIR;
  else process.env.APPROVALS_DIR = previousDirectory;
  if (directory) await rm(directory, { recursive: true, force: true });
});

test('creates persisted approvals, reads disk after module reload, and protects memory from mutation', async () => {
  const approval = create();
  assert.match(approval.id, /^[A-Za-z0-9_-]{12}$/);
  assert.equal(approval.url, `https://example.test/approve/${approval.id}`);
  assert.equal(approval.status, 'pending');
  assert.deepEqual(JSON.parse(await readFile(join(directory, `${approval.id}.json`), 'utf8')), approval);
  const freshModule = await import('../approve.mjs?disk-read');
  assert.deepEqual(freshModule.getApproval(approval.id), approval);
  approval.status = 'rejected';
  const copy = getApproval(approval.id);
  assert.equal(copy.status, 'pending');
  copy.docs[0].summary = 'Mutated';
  assert.equal(getApproval(approval.id).docs[0].summary, docs[0].summary);
  assert.equal(getApproval('../../package'), null);
});

test('page escapes content and defaults flagged or low confidence documents to reject', () => {
  const approval = create();
  const html = renderApprovalPage(approval);
  const { document } = parseHTML(html);
  assert.equal(document.querySelector('h1').textContent, approval.brand);
  assert.equal(document.querySelector('h2').textContent, docs[0].title);
  assert.equal(document.querySelector('.summary').textContent, docs[0].summary);
  assert.equal(document.querySelector('li').textContent, docs[1].flags[0]);
  assert.equal(document.querySelector('img'), null);
  assert.equal(document.querySelectorAll('script').length, 1);
  assert.match(html, /white-space:pre-wrap/);
  assert.match(html, /Thanks — you can close this page/);
  assert.deepEqual([...document.querySelectorAll('input[checked]')].map((node) => node.value), ['approve', 'reject', 'reject']);
  assert.deepEqual([...document.querySelectorAll('.chip')].map((node) => node.className), ['chip green', 'chip green', 'chip amber']);
});

test('exact 90 percent is green and approved by default; keys stay outside JavaScript', () => {
  const approval = createApproval({ runId: 'run-2', brand: 'Brand', baseUrl: 'https://example.test', docs: [
    { key: '\"><script>alert(1)</script>', title: 'Title', summary: 'Summary', confidence: 90, flags: [] },
  ] });
  const { document } = parseHTML(renderApprovalPage(approval));
  assert.equal(document.querySelector('fieldset').dataset.key, approval.docs[0].key);
  assert.equal(document.querySelector('input[checked]').value, 'approve');
  assert.equal(document.querySelector('.chip').className, 'chip green');
  assert.equal(document.querySelectorAll('script').length, 1);
});

test('canvas decisions persist and render read-only; all rejected means rejected', async () => {
  const approval = create();
  const decided = decideApproval(approval.id, { faq: 'reject', overview: 'reject', pitch: 'reject' });
  assert.equal(decided.status, 'rejected');
  assert.equal(JSON.parse(await readFile(join(directory, `${approval.id}.json`), 'utf8')).status, 'rejected');
  const { document } = parseHTML(renderApprovalPage(decided));
  assert.equal(document.querySelector('input, button, script'), null);
  assert.deepEqual([...document.querySelectorAll('.result')].map((node) => node.textContent), ['Rejected', 'Rejected', 'Rejected']);
  assert.throws(() => decideApproval(approval.id, choices), { statusCode: 409 });
});

test('HTTP GET page and JSON, POST decision, callback, and 409 on repeat', async (t) => {
  if (listenError) return t.skip(`Local HTTP listener denied: ${listenError.code}`);
  const approval = create();
  const page = await fetch(`${origin}/approve/${approval.id}`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.match(await page.text(), /Approve selected/);
  const pending = await fetch(`${origin}/api/approve/${approval.id}`);
  assert.deepEqual(await pending.json(), { id: approval.id, status: 'pending', decisions: {} });
  const count = notifications.length;
  const response = await post(approval.id, choices);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(notifications.length, count + 1);
  assert.equal(notifications.at(-1).status, 'approved');
  const result = await fetch(`${origin}/api/approve/${approval.id}`);
  assert.deepEqual(await result.json(), { id: approval.id, status: 'approved', decisions: choices });
  assert.equal((await post(approval.id, choices)).status, 409);
  assert.equal(notifications.length, count + 1);
  const decidedPage = await fetch(`${origin}/approve/${approval.id}`);
  assert.doesNotMatch(await decidedPage.text(), /<input|<button/);
});

test('unknown IDs return 404 on every route', async (t) => {
  if (listenError) return t.skip(`Local HTTP listener denied: ${listenError.code}`);
  for (const path of ['/approve/aaaaaaaaaaaa', '/api/approve/aaaaaaaaaaaa']) {
    assert.equal((await fetch(`${origin}${path}`)).status, 404);
  }
  assert.equal((await post('aaaaaaaaaaaa', choices)).status, 404);
  assert.throws(() => decideApproval('aaaaaaaaaaaa', choices), { statusCode: 404 });
});

test('invalid keys, values, missing decisions and malformed JSON return 400 without deciding', async (t) => {
  if (listenError) return t.skip(`Local HTTP listener denied: ${listenError.code}`);
  const approval = create();
  for (const decisions of [{ ...choices, unknown: 'approve' }, { ...choices, faq: 'yes' }, { faq: 'approve' }, null, [], 'approve']) {
    assert.equal((await post(approval.id, decisions)).status, 400);
    assert.equal(getApproval(approval.id).status, 'pending');
  }
  const response = await fetch(`${origin}/api/approve/${approval.id}`, { method: 'POST', body: '{bad' });
  assert.equal(response.status, 400);
});

test('oversized UTF-8 body returns 413 and leaves approval pending', async (t) => {
  if (listenError) return t.skip(`Local HTTP listener denied: ${listenError.code}`);
  const approval = create();
  const response = await fetch(`${origin}/api/approve/${approval.id}`, {
    method: 'POST', body: JSON.stringify({ decisions: choices, extra: 'ệ'.repeat(8000) }),
  });
  assert.equal(response.status, 413);
  assert.equal(getApproval(approval.id).status, 'pending');
});

test('simultaneous submissions finalize only once', async (t) => {
  if (listenError) return t.skip(`Local HTTP listener denied: ${listenError.code}`);
  const approval = create();
  const count = notifications.length;
  const responses = await Promise.all([post(approval.id, choices), post(approval.id, choices)]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  assert.equal(notifications.length, count + 1);
});

test('unrelated routes are not handled', async () => {
  assert.equal(await handleApprovalRequest({ url: '/other', method: 'GET' }, {}), false);
});

test('QR output is a PNG data URL with width 280', async () => {
  const data = await qrDataUrl('https://example.test/approve/aaaaaaaaaaaa');
  assert.match(data, /^data:image\/png;base64,/);
  const png = Buffer.from(data.split(',')[1], 'base64');
  assert.equal(png.readUInt32BE(16), 280);
  assert.equal(png.readUInt32BE(20), 280);
});

async function request(method, path, body = '') {
  const req = Readable.from([Buffer.from(body)]);
  req.method = method;
  req.url = path;
  const result = {};
  const res = {
    writeHead(status, headers) { result.status = status; result.headers = headers; },
    end(content) { result.body = content; },
  };
  result.handled = await handleApprovalRequest(req, res, { onDecision: (approval) => notifications.push(approval) });
  return result;
}

test('offline stream requests verify route validation, size limit, persistence and conflict', async () => {
  const approval = create();
  const path = `/api/approve/${approval.id}`;
  assert.equal((await request('GET', `/approve/${approval.id}`)).status, 200);
  const pending = await request('GET', path);
  assert.deepEqual(JSON.parse(pending.body), { id: approval.id, status: 'pending', decisions: {} });
  for (const decisions of [{ ...choices, invalid: 'approve' }, { ...choices, faq: 'invalid' }, {}, null]) {
    assert.equal((await request('POST', path, JSON.stringify({ decisions }))).status, 400);
  }
  assert.equal((await request('POST', path, '{bad')).status, 400);
  assert.equal((await request('POST', path, JSON.stringify({ extra: 'ệ'.repeat(8000) }))).status, 413);
  assert.equal(getApproval(approval.id).status, 'pending');
  const count = notifications.length;
  const decided = await request('POST', path, JSON.stringify({ decisions: choices }));
  assert.equal(decided.status, 200);
  assert.deepEqual(JSON.parse(decided.body), { ok: true });
  assert.equal(notifications.length, count + 1);
  assert.equal(getApproval(approval.id).status, 'approved');
  assert.equal((await request('POST', path, JSON.stringify({ decisions: choices }))).status, 409);
  for (const [method, unknownPath] of [['GET', '/approve/aaaaaaaaaaaa'], ['GET', '/api/approve/aaaaaaaaaaaa'], ['POST', '/api/approve/aaaaaaaaaaaa']]) {
    assert.equal((await request(method, unknownPath, '{}')).status, 404);
  }
});
