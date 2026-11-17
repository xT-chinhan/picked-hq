import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, statSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once, EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { serve } from './fixtures/fake-mcp-server.mjs';
import { createMcpHub, isAllowed, handleMcpRequest } from '../mcp.mjs';

// Opt-in fallback for sandboxes that deny subprocess socketpairs.
function memorySpawn(command, args) {
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.exitCode = null; child.signalCode = null; child.killed = false; child.pid = 1;
  let ended = false;
  const exit = (code, signal = null) => {
    if (ended) return;
    ended = true; child.exitCode = code; child.signalCode = signal;
    child.stdin.end(); child.stdout.end(); child.stderr.end();
    child.emit('exit', code, signal); child.emit('close', code, signal);
  };
  child.kill = (signal = 'SIGTERM') => {
    child.killed = true; queueMicrotask(() => exit(null, signal)); return true;
  };
  queueMicrotask(() => {
    if (command === '/nonexistent/picked-mcp') {
      child.pid = undefined; child.emit('error', new Error('ENOENT')); exit(-2);
    } else serve(child.stdin, child.stdout, args[1], exit);
  });
  return child;
}

const fixture = fileURLToPath(new URL('./fixtures/fake-mcp-server.mjs', import.meta.url));
function setup(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'picked-mcp-'));
  const file = join(dir, 'servers.json');
  const children = [];
  const hub = createMcpHub({ file, spawnImpl: (...args) => {
    const child = (process.env.MCP_TEST_IN_MEMORY === '1' ? memorySpawn : spawn)(...args); children.push(child); return child;
  }, ...options });
  t.after(async () => { await hub.stopAll(); rmSync(dir, { recursive: true, force: true }); });
  const add = (name = 'demo', mode) => hub.add({ name, command: process.execPath,
    args: [fixture, ...(mode ? [mode] : [])], env: { PICKED_TEST_SECRET: 'private-secret' } });
  return { hub, file, add, children };
}

test('definitions persist privately and public views cannot mutate definitions', t => {
  const { hub, file, add } = setup(t);
  const view = add();
  assert.equal(view.status, 'stopped');
  assert.deepEqual(view.envKeys, ['PICKED_TEST_SECRET']);
  assert.equal(JSON.stringify(hub.list()).includes('private-secret'), false);
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.match(readFileSync(file, 'utf8'), /private-secret/);
  view.args.push('bad');
  assert.equal(hub.list()[0].args.length, 1);
  assert.deepEqual(createMcpHub({ file }).list(), hub.list());
});

test('validates definitions, duplicates, and the 12 server limit', t => {
  const { hub, add } = setup(t);
  for (const value of [null, {}, { name: 'A!', command: 'node' },
    { name: 'ok', command: ' ' }, { name: 'ok', command: 'node', args: [1] },
    { name: 'ok', command: 'node', env: { TOKEN: 42 } },
    { name: 'ok', command: 'node', env: [] }]) {
    assert.throws(() => hub.add(value), { code: 'bad_input' });
  }
  add();
  assert.throws(() => add(), { code: 'bad_input' });
  for (let i = 0; i < 11; i++) add(`srv${i}`);
  assert.throws(() => add('extra'), { code: 'bad_input' });
});

test('handshake, pagination, split lines, concurrent calls, and injected clock', async t => {
  let clock = 100;
  const { hub, add, children } = setup(t, { now: () => clock++ });
  add();
  await Promise.all([hub.connect('demo'), hub.connect('demo')]);
  assert.equal(children.length, 1);
  assert.equal(hub.list()[0].status, 'ready');
  assert.equal(hub.list()[0].startedAt, 100);
  assert.equal(hub.list()[0].toolCount, 3);
  assert.deepEqual((await hub.tools('demo')).map(x => x.name), ['echo', 'fail', 'slow']);
  const [a, b] = await Promise.all([
    hub.call('demo', 'echo', { text: 'Xin chào', extra: true, delay: 20 }),
    hub.call('demo', 'echo', { text: 'Nhanh' }),
  ]);
  assert.equal(a.text, 'Xin chào\nthêm'); assert.equal(b.text, 'Nhanh');
  assert.equal(a.isError, false); assert.ok(a.ms > 0);
  assert.equal((await hub.call('demo', 'fail')).isError, true);
  await hub.connect('demo'); assert.equal(children.length, 1);
});

test('scope rejects before spawning, unknown tools and servers are not_found', async t => {
  const { hub, add, children } = setup(t); add();
  await assert.rejects(hub.call('demo', 'echo', {}, { scope: [] }), { code: 'forbidden' });
  assert.equal(children.length, 0);
  await assert.rejects(hub.call('missing', 'echo'), { code: 'not_found' });
  await assert.rejects(hub.tools('missing'), { code: 'not_found' });
  await assert.rejects(hub.call('demo', 'missing'), { code: 'not_found' });
  assert.equal((await hub.call('demo', 'echo', { text: 'yes' }, { scope: ['mcp:demo:*'] })).text, 'yes');
});

test('call timeouts abandon only that request, including late responses', async t => {
  const { hub, add } = setup(t); add(); await hub.connect('demo');
  await assert.rejects(hub.call('demo', 'slow', {}, { timeoutMs: 20 }), { code: 'timeout' });
  await assert.rejects(hub.call('demo', 'echo', { text: 'late', delay: 40 }, { timeoutMs: 10 }), { code: 'timeout' });
  assert.equal((await hub.call('demo', 'echo', { text: 'later', delay: 60 })).text, 'later');
  assert.equal(hub.list()[0].status, 'ready');
});

for (const mode of ['missing', 'exit', 'hang', 'rpc-error']) {
  test(`connection failure: ${mode}`, async t => {
    const { hub, add, children } = setup(t);
    if (mode === 'missing') hub.add({ name: 'demo', command: '/nonexistent/picked-mcp' });
    else add('demo', mode);
    await assert.rejects(hub.connect('demo', { timeoutMs: mode === 'hang' ? 70 : 1000 }));
    assert.equal(hub.list()[0].status, 'failed');
    assert.ok(hub.list()[0].error);
    assert.equal(JSON.stringify(hub.list()).includes('private-secret'), false);
    assert.ok(children[0].killed || children[0].exitCode !== null || !children[0].pid);
  });
}

test('remove and stopAll terminate processes; later exits become stopped', async t => {
  const { hub, add, children, file } = setup(t); add();
  await hub.tools('demo');
  await assert.rejects(hub.call('demo', 'echo', { exit: true }));
  assert.equal(hub.list()[0].status, 'stopped');
  await hub.connect('demo');
  await hub.remove('demo');
  assert.equal(children[1].exitCode !== null || children[1].signalCode !== null, true);
  assert.deepEqual(hub.list(), []);
  assert.deepEqual(createMcpHub({ file }).list(), []);
  add(); await hub.connect('demo'); await hub.stopAll();
  assert.equal(hub.list()[0].status, 'stopped');
});

test('isAllowed truth table', () => {
  for (const [scope, expected] of [
    [undefined, false], [[], false], [['native:*'], false], [['mcp:*'], true],
    [['mcp:demo:*'], true], [['mcp:demo:echo'], true], [['mcp:other:*'], false],
    [['mcp:demo:other'], false], [['mcp:*:echo'], false], [['mcp:de*:echo'], false],
    [['native:*', 'mcp:demo:echo'], true],
  ]) assert.equal(isAllowed(scope, 'demo', 'echo'), expected);
});

test('HTTP routes and status mapping on loopback', async t => {
  const { hub, add } = setup(t); add();
  let local = true;
  const server = createServer(async (req, res) => {
    if (!await handleMcpRequest(req, res, { hub, local })) { res.writeHead(404); res.end(); }
  });
  server.listen(0, '127.0.0.1');
  try { await once(server, 'listening'); }
  catch (error) {
    if (error.code === 'EPERM' || error.code === 'EACCES') {
      t.skip('Sandbox denies loopback sockets; direct handler tests remain active'); return;
    }
    throw error;
  }
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}`;
  async function request(path, method = 'GET', body) {
    const response = await fetch(url + path, { method, ...(body === undefined ? {} : { body }) });
    return { status: response.status, body: await response.json() };
  }
  assert.equal((await request('/api/mcp/servers')).body.servers.length, 1);
  local = false;
  assert.equal((await request('/api/mcp/servers')).status, 200);
  assert.deepEqual(await request('/api/mcp/call', 'POST', '{}'), { status: 403, body: { error: 'owner only' } });
  local = true;
  for (const body of ['{', 'null', '[]', JSON.stringify({ huge: 'x'.repeat(21000) })]) {
    assert.equal((await request('/api/mcp/servers', 'POST', body)).status, 400);
  }
  assert.equal((await request('/api/mcp/servers/missing/tools')).status, 404);
  assert.equal((await request('/api/mcp/servers/demo/connect', 'POST')).body.tools.length, 3);
  assert.equal((await request('/api/mcp/servers/demo/tools')).body.tools.length, 3);
  const call = await request('/api/mcp/call', 'POST', JSON.stringify({ server: 'demo', tool: 'echo', arguments: { text: 'Chào' } }));
  assert.equal(call.status, 200); assert.equal(call.body.text, 'Chào');
  assert.equal((await request('/api/mcp/servers', 'POST', JSON.stringify({ name: 'other', command: process.execPath }))).status, 200);
  assert.equal((await request('/api/mcp/servers/other', 'DELETE')).status, 200);
  const response = await fetch(url + '/unrelated'); assert.equal(response.status, 404);
});


test('HTTP handler without sockets: input validation, local policy, calls, error mapping', async t => {
  const { hub, add } = setup(t); add();
  async function request(url, method = 'GET', body, local = true, targetHub = hub) {
    const req = new PassThrough(); req.url = url; req.method = method;
    const res = { writeHead(status) { this.status = status; }, end(data) { this.body = JSON.parse(data); } };
    req.end(body);
    const handled = await handleMcpRequest(req, res, { hub: targetHub, local });
    return { handled, status: res.status, body: res.body };
  }
  assert.equal((await request('/api/mcp/servers')).body.servers.length, 1);
  assert.equal((await request('/api/mcp/servers', 'GET', undefined, false)).status, 200);
  for (const [url, method] of [['/api/mcp/servers', 'POST'], ['/api/mcp/servers/demo', 'DELETE'],
    ['/api/mcp/servers/demo/connect', 'POST'], ['/api/mcp/servers/demo/tools', 'GET'], ['/api/mcp/call', 'POST']]) {
    assert.equal((await request(url, method, '{}', false)).status, 403);
  }
  for (const body of ['{', 'null', '[]', JSON.stringify({ huge: 'x'.repeat(21000) })]) {
    assert.equal((await request('/api/mcp/servers', 'POST', body)).status, 400);
  }
  assert.equal((await request('/api/mcp/servers/missing/tools')).status, 404);
  assert.equal((await request('/api/mcp/servers/demo/connect', 'POST')).body.tools.length, 3);
  assert.equal((await request('/api/mcp/servers/demo/tools')).body.tools.length, 3);
  const response = await request('/api/mcp/call', 'POST', JSON.stringify({ server: 'demo', tool: 'echo', arguments: { text: 'Chào' } }));
  assert.equal(response.status, 200); assert.equal(response.body.text, 'Chào');
  assert.equal((await request('/api/mcp/call', 'POST', '{}')).status, 400);
  assert.equal((await request('/api/mcp/servers', 'POST', JSON.stringify({ name: 'other', command: process.execPath }))).status, 200);
  assert.equal((await request('/api/mcp/servers/other', 'DELETE')).status, 200);
  assert.equal((await request('/unrelated')).handled, false);
  for (const [code, status] of [['timeout', 504], ['forbidden', 403], ['rpc_error', 502]]) {
    const fake = { call() { throw Object.assign(new Error('test error'), { code }); } };
    assert.equal((await request('/api/mcp/call', 'POST', '{"server":"demo","tool":"echo"}', true, fake)).status, status);
  }
});

test('removing a starting server cancels the connection without resurrecting it', async t => {
  const { hub, add } = setup(t); add('demo', 'hang');
  const connecting = hub.connect('demo');
  const rejected = assert.rejects(connecting, { code: 'connection_error' });
  await hub.remove('demo'); await rejected;
  assert.deepEqual(hub.list(), []);
});

test('stopAll rejects pending calls and tool metadata is detached', async t => {
  const { hub, add } = setup(t); add();
  const tools = await hub.tools('demo'); tools[0].name = 'mutated';
  assert.equal((await hub.tools('demo'))[0].name, 'echo');
  const pending = hub.call('demo', 'slow');
  const rejected = assert.rejects(pending);
  await new Promise(resolve => setImmediate(resolve));
  await hub.stopAll(); await rejected;
  assert.equal(hub.list()[0].status, 'stopped');
});

test('connect HTTP requests enforce the body limit and reject malformed JSON', async () => {
  for (const body of ['{', 'x'.repeat(21000)]) {
    const req = new PassThrough(); req.url = '/api/mcp/servers/demo/connect'; req.method = 'POST'; req.end(body);
    let status;
    const res = { writeHead(value) { status = value; }, end() {} };
    const hub = { connect() { assert.fail('Invalid input must be rejected before connecting'); } };
    await handleMcpRequest(req, res, { hub, local: true });
    assert.equal(status, 400);
  }
});
