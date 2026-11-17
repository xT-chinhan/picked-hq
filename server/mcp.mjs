import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const failure = (code, message) => Object.assign(new Error(message), { code });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const copy = value => structuredClone(value);

function definition(value) {
  if (!object(value)) throw failure('bad_input', 'Định nghĩa máy chủ không hợp lệ');
  const { name, command, args = [], env = {} } = value;
  if (typeof name !== 'string' || !/^[a-z][a-z0-9_-]{1,30}$/.test(name) ||
      typeof command !== 'string' || !command.trim() || command.includes('\0') ||
      !Array.isArray(args) || !args.every(x => typeof x === 'string' && !x.includes('\0')) ||
      !object(env) || !Object.entries(env).every(([key, val]) =>
        key.length && !/[=\0]/.test(key) && typeof val === 'string' && !val.includes('\0'))) {
    throw failure('bad_input', 'Định nghĩa máy chủ không hợp lệ');
  }
  return { name, command, args: [...args], env: { ...env } };
}

function validateTimeout(timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2147483647) {
    throw failure('bad_input', 'Thời gian chờ không hợp lệ');
  }
}

/** Return whether a scope explicitly permits this MCP server/tool pair. */
export function isAllowed(scope, server, tool) {
  return Array.isArray(scope) && scope.some(entry =>
    entry === 'mcp:*' || entry === `mcp:${server}:*` || entry === `mcp:${server}:${tool}`);
}

/** Create a persistent stdio MCP hub. Definitions are loaded synchronously from file. */
export function createMcpHub({ file, spawnImpl = spawn, now = Date.now }) {
  if (typeof file !== 'string' || !file) throw failure('bad_input', 'Thiếu tệp cấu hình');
  const path = resolve(file);
  const servers = new Map();
  let nextId = 1;
  const state = def => ({ def, status: 'stopped', tools: [], error: null, startedAt: null, connection: null });
  try {
    const definitions = JSON.parse(readFileSync(path, 'utf8'));
    if (!Array.isArray(definitions) || definitions.length > 12) throw new Error();
    for (const item of definitions) {
      const def = definition(item);
      if (servers.has(def.name)) throw new Error();
      servers.set(def.name, state(def));
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw failure('config_error', 'Không thể đọc cấu hình MCP');
  }

  function persist(definitions) {
    const temp = `${path}.${randomUUID()}.tmp`;
    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(temp, JSON.stringify(definitions, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
      renameSync(temp, path);
    } catch {
      throw failure('storage_error', 'Không thể lưu cấu hình MCP');
    } finally {
      rmSync(temp, { force: true });
    }
  }

  function get(name) {
    const server = servers.get(name);
    if (!server) throw failure('not_found', 'Không tìm thấy máy chủ MCP');
    return server;
  }

  function view(server) {
    return { name: server.def.name, command: server.def.command, args: [...server.def.args],
      envKeys: Object.keys(server.def.env), status: server.status, toolCount: server.tools.length,
      error: server.error, startedAt: server.startedAt };
  }

  function rejectPending(connection, error) {
    for (const pending of connection.pending.values()) pending.reject(error);
    connection.pending.clear();
  }

  function transport(server) {
    let child;
    try {
      child = spawnImpl(server.def.command, server.def.args, {
        env: { ...process.env, ...server.def.env }, stdio: ['pipe', 'pipe', 'pipe'], shell: false,
      });
    } catch { throw failure('connection_error', 'Không thể khởi động máy chủ MCP'); }
    const connection = { child, pending: new Map(), ended: false, closing: null, promise: null };
    connection.closed = new Promise(resolveClosed => child.once('close', resolveClosed));
    const ended = error => {
      connection.ended = true;
      rejectPending(connection, error);
      if (server.connection === connection && server.status === 'ready') {
        server.status = 'stopped'; server.tools = []; server.connection = null;
      }
    };
    child.on('error', () => ended(failure('connection_error', 'Không thể khởi động máy chủ MCP')));
    child.on('exit', () => ended(failure('connection_error', 'Máy chủ MCP đã dừng')));
    child.on('close', () => ended(failure('connection_error', 'Kết nối MCP đã đóng')));
    child.stdin.on('error', () => ended(failure('connection_error', 'Không thể ghi tới máy chủ MCP')));
    child.stdout.on('error', () => ended(failure('connection_error', 'Không thể đọc từ máy chủ MCP')));
    child.stderr.on('error', () => {});
    child.stderr.resume();
    child.stdout.setEncoding('utf8');
    let buffer = '';
    child.stdout.on('data', chunk => {
      buffer += chunk;
      let boundary;
      while ((boundary = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 1);
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        if (!object(message) || message.jsonrpc !== '2.0' || 'method' in message) continue;
        const pending = connection.pending.get(message.id);
        if (!pending) continue;
        if ('error' in message) pending.reject(failure('rpc_error', 'Máy chủ MCP trả về lỗi JSON-RPC'));
        else if ('result' in message) pending.resolve(message.result);
      }
    });
    return connection;
  }

  function send(connection, message) {
    if (connection.ended) throw failure('connection_error', 'Máy chủ MCP đã dừng');
    connection.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
  }

  function request(connection, method, params, timeoutMs) {
    return new Promise((resolveRequest, rejectRequest) => {
      const id = nextId++;
      let timer;
      const settle = (callback, value) => {
        clearTimeout(timer); connection.pending.delete(id); callback(value);
      };
      const pending = {
        resolve: value => settle(resolveRequest, value),
        reject: error => settle(rejectRequest, error),
      };
      connection.pending.set(id, pending);
      if (timeoutMs !== undefined) timer = setTimeout(() =>
        pending.reject(failure('timeout', 'Yêu cầu MCP hết thời gian chờ')), timeoutMs);
      try { send(connection, { id, method, params }); }
      catch { pending.reject(failure('connection_error', 'Không thể gửi yêu cầu MCP')); }
    });
  }

  function terminate(connection) {
    if (connection.closing) return connection.closing;
    connection.ended = true;
    rejectPending(connection, failure('connection_error', 'Kết nối MCP đã dừng'));
    connection.closing = (async () => {
      connection.child.kill();
      const timer = setTimeout(() => connection.child.kill('SIGKILL'), 250);
      try { await connection.closed; } finally { clearTimeout(timer); }
    })();
    return connection.closing;
  }

  async function stop(server) {
    const connection = server.connection;
    server.connection = null; server.status = 'stopped'; server.tools = [];
    if (connection) await terminate(connection);
  }

  const hub = {
    /** Validate and atomically store a definition, returning its public view. */
    add(value) {
      const def = definition(value);
      if (servers.has(def.name)) throw failure('bad_input', 'Tên máy chủ đã tồn tại');
      if (servers.size >= 12) throw failure('bad_input', 'Chỉ được thêm tối đa 12 máy chủ');
      persist([...servers.values()].map(s => s.def).concat(def));
      const server = state(def); servers.set(def.name, server); return view(server);
    },
    /** Stop a server before removing its persisted definition. */
    async remove(name) {
      const server = get(name);
      server.removing = true;
      try {
        await stop(server);
        persist([...servers.values()].filter(s => s !== server).map(s => s.def));
        servers.delete(name);
      } finally { server.removing = false; }
    },
    /** Return independent public views, exposing environment keys only. */
    list() { return [...servers.values()].map(view); },
    /** Initialize a child and load every page of tools within one deadline. */
    async connect(name, { timeoutMs = 15000 } = {}) {
      const server = get(name);
      if (server.removing) throw failure('not_found', 'Máy chủ MCP đang được xóa');
      if (server.status === 'ready') return view(server);
      if (server.status === 'starting') return server.connection.promise;
      validateTimeout(timeoutMs);
      server.status = 'starting'; server.error = null; server.tools = [];
      let connection;
      try { connection = transport(server); }
      catch (error) { server.status = 'failed'; server.error = error.message; throw error; }
      server.connection = connection; server.startedAt = now();
      connection.promise = (async () => {
        let timer;
        try {
          const tools = await Promise.race([
            (async () => {
              await request(connection, 'initialize', { protocolVersion: '2025-06-18',
                capabilities: {}, clientInfo: { name: 'picked', version: '1.0.0' } });
              send(connection, { method: 'notifications/initialized' });
              const collected = []; const cursors = new Set(); let cursor;
              do {
                const result = await request(connection, 'tools/list', cursor === undefined ? {} : { cursor });
                if (!object(result) || !Array.isArray(result.tools) || !result.tools.every(tool =>
                  object(tool) && typeof tool.name === 'string' && tool.name.length &&
                  (tool.description === undefined || typeof tool.description === 'string') && object(tool.inputSchema))) {
                  throw failure('protocol_error', 'Danh sách công cụ MCP không hợp lệ');
                }
                collected.push(...result.tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })));
                cursor = result.nextCursor;
                if (cursor !== undefined) {
                  if (typeof cursor !== 'string' || cursors.has(cursor)) throw failure('protocol_error', 'Phân trang MCP không hợp lệ');
                  cursors.add(cursor);
                }
              } while (cursor !== undefined);
              return collected;
            })(),
            new Promise((_, reject) => { timer = setTimeout(() => reject(failure('timeout', 'Kết nối MCP hết thời gian chờ')), timeoutMs); }),
          ]);
          if (connection.ended || server.connection !== connection) throw failure('connection_error', 'Kết nối MCP đã dừng');
          server.tools = tools; server.status = 'ready'; return view(server);
        } catch (error) {
          await terminate(connection);
          if (server.connection === connection) {
            server.status = 'failed'; server.error = error.message; server.connection = null;
          }
          throw error;
        } finally { clearTimeout(timer); }
      })();
      return connection.promise;
    },
    /** Connect if necessary and return a detached list of available tools. */
    async tools(name) { await hub.connect(name); return copy(get(name).tools); },
    /** Call an allowed tool; a timeout abandons this request without stopping the server. */
    async call(name, tool, args = {}, { timeoutMs = 60000, scope } = {}) {
      if (scope !== undefined && !isAllowed(scope, name, tool)) throw failure('forbidden', 'Không được phép gọi công cụ này');
      const server = get(name);
      if (typeof tool !== 'string' || !tool || !object(args)) throw failure('bad_input', 'Tham số công cụ không hợp lệ');
      validateTimeout(timeoutMs);
      await hub.connect(name);
      if (!server.tools.some(item => item.name === tool)) throw failure('not_found', 'Không tìm thấy công cụ MCP');
      const start = now();
      const result = await request(server.connection, 'tools/call', { name: tool, arguments: args }, timeoutMs);
      if (!object(result) || !Array.isArray(result.content)) throw failure('protocol_error', 'Kết quả công cụ MCP không hợp lệ');
      return { text: result.content.filter(part => object(part) && part.type === 'text' && typeof part.text === 'string')
        .map(part => part.text).join('\n'), isError: result.isError === true, ms: now() - start };
    },
    /** Stop all children and reject their outstanding requests. */
    async stopAll() { await Promise.all([...servers.values()].map(stop)); },
  };
  return hub;
}

async function readBody(req, allowEmpty = false) {
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk);
    if (size <= 20 * 1024) chunks.push(Buffer.from(chunk));
  }
  if (size > 20 * 1024) throw failure('bad_input', 'Nội dung vượt quá 20 KB');
  if (size === 0 && allowEmpty) return {};
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!object(body)) throw new Error();
    return body;
  } catch { throw failure('bad_input', 'Nội dung JSON không hợp lệ'); }
}

/** Handle MCP HTTP routes, returning false when the request belongs to another handler. */
export async function handleMcpRequest(req, res, { hub, local }) {
  const path = new URL(req.url, 'http://localhost').pathname;
  const match = /^\/api\/mcp\/servers\/([^/]+)(?:\/(connect|tools))?$/.exec(path);
  const method = req.method;
  const list = path === '/api/mcp/servers' && method === 'GET';
  const add = path === '/api/mcp/servers' && method === 'POST';
  const call = path === '/api/mcp/call' && method === 'POST';
  const remove = match && !match[2] && method === 'DELETE';
  const connect = match && match[2] === 'connect' && method === 'POST';
  const tools = match && match[2] === 'tools' && method === 'GET';
  if (!list && !add && !call && !remove && !connect && !tools) return false;
  const reply = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  };
  if (!local && !list) { reply(403, { error: 'owner only' }); return true; }
  try {
    let name;
    try { name = match ? decodeURIComponent(match[1]) : undefined; }
    catch { throw failure('bad_input', 'Tên máy chủ không hợp lệ'); }
    const body = method === 'GET' ? undefined : await readBody(req, Boolean(remove || connect));
    let result;
    if (list) result = { servers: await hub.list() };
    else if (add) result = { server: await hub.add(body) };
    else if (remove) { await hub.remove(name); result = { ok: true }; }
    else if (connect) { const server = await hub.connect(name); result = { server, tools: await hub.tools(name) }; }
    else if (tools) result = { tools: await hub.tools(name) };
    else {
      if (typeof body.server !== 'string' || !body.server || typeof body.tool !== 'string' || !body.tool ||
          (body.arguments !== undefined && !object(body.arguments))) throw failure('bad_input', 'Tham số công cụ không hợp lệ');
      result = await hub.call(body.server, body.tool, body.arguments);
    }
    reply(200, result);
  } catch (error) {
    const statuses = { bad_input: 400, forbidden: 403, not_found: 404, timeout: 504 };
    const code = Object.hasOwn(statuses, error.code) ? error.code : 'upstream_error';
    reply(statuses[code] ?? 502, { error: code === 'upstream_error' ? 'Yêu cầu MCP thất bại' : error.message, code });
  }
  return true;
}
