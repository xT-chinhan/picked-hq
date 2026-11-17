import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Starts the real server on a spare port with the edge off, and exercises the HTTP contract the frontend relies on.
const PORT = 5391
let child
const url = (p) => `http://127.0.0.1:${PORT}${p}`
const post = (p, b) => fetch(url(p), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })

before(async () => {
  // own data directory seeded with the bundled real run, so the tests never touch the developer's runs or routines
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'picked-api-'))
  fs.mkdirSync(path.join(data, 'runs'))
  fs.copyFileSync('public/runs/20261116070613-2h9.json', path.join(data, 'runs', '20261116070613-2h9.json'))
  child = spawn('node', ['server/index.mjs'], { env: { ...process.env, PICKED_PORT: String(PORT), PICKED_NO_EDGE: '1', PICKED_DATA_DIR: data }, stdio: 'ignore' })
  for (let i = 0; i < 40; i++) { try { if ((await fetch(url('/api/health'))).ok) return } catch {} await new Promise((r) => setTimeout(r, 150)) }
  throw new Error('server did not start')
})
after(() => child?.kill())

test('health and status describe an idle backend', async () => {
  assert.deepEqual(await (await fetch(url('/api/health'))).json(), { ok: true, edge: false })
  const st = await (await fetch(url('/api/status'))).json()
  assert.equal(st.ok, true); assert.equal(st.running, undefined)
})

test('every response is stamped so the edge can tell this server from a dead tunnel', async () => {
  assert.equal((await fetch(url('/api/health'))).headers.get('x-picked'), '1')
  assert.equal((await fetch(url('/nope'))).headers.get('x-picked'), '1')
})

test('brands lists the directory with saved run counts', async () => {
  const j = await (await fetch(url('/api/brands'))).json()
  assert.ok(j.brands.length >= 4); assert.equal(typeof j.brands[0].runs, 'number'); assert.ok(j.category)
})

test('traffic that came through the tunnel is refused without the edge secret', async () => {
  // PICKED_NO_EDGE means no secret exists at all, so even a forged header must be refused
  const r = await fetch(url('/api/runs'), { headers: { 'cf-ray': 'x', 'x-picked-edge': 'guess' } })
  assert.equal(r.status, 403)
})

test('a second audit is refused with the running one, unless replaced from this machine', async () => {
  const a = await post('/api/audit', { brand: 'Acme Test', mode: 'quick' })
  assert.equal(a.status, 200)
  const first = await a.json()
  const b = await post('/api/audit', { brand: 'Acme Two' })
  assert.equal(b.status, 409); assert.equal((await b.json()).running.id, first.id)
  assert.equal((await (await fetch(url('/api/status'))).json()).running.id, first.id)
  const c = await post('/api/audit', { brand: 'Acme Two', replace: true })
  assert.equal(c.status, 200)
  const second = await c.json(); assert.notEqual(second.id, first.id)
  await post(`/api/audit/${second.id}/stop`, {})
  assert.equal((await (await fetch(url('/api/status'))).json()).running, undefined)
})

test('shop route serves files only, never directories', async () => {
  assert.equal((await fetch(url('/shop/elmich/..'))).status, 404)
  assert.equal((await fetch(url('/shop/nobody/index.html'))).status, 404)
})

test('routines: create, validate, list; the hosted address may read but never change them', async () => {
  const bad = await post('/api/routines', { brand: 'Acme Test', schedule: { kind: 'interval', minutes: 1 } })
  assert.equal(bad.status, 400)
  const ok = await post('/api/routines', { brand: 'Acme Test', schedule: { kind: 'daily', at: '09:00' } })
  assert.equal(ok.status, 200)
  const made = await ok.json()
  const list = await (await fetch(url('/api/routines'))).json()
  assert.ok(list.routines.some((r) => r.id === made.id))
  assert.equal((await fetch(url('/api/routines'), { headers: { 'cf-ray': 'x' } })).status, 403, 'tunnel traffic without the edge secret is refused outright')
  assert.equal((await fetch(url(`/api/routines/${made.id}`), { method: 'DELETE' })).status, 200)
  assert.equal((await fetch(url(`/api/routines/${made.id}`), { method: 'DELETE' })).status, 404)
})

test('inbox is empty and idle on a fresh backend', async () => {
  const j = await (await fetch(url('/api/inbox'))).json()
  assert.deepEqual(j.needs, []); assert.equal(j.running, null); assert.ok(Array.isArray(j.results))
})

test('a POST to a route owned by another module is not swallowed by the NaN handler', async () => {
  // regression: /api/one/agent hung because an earlier handler had already consumed the request body
  const r = await fetch(url('/api/one/agent'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'hello' }), signal: AbortSignal.timeout(8000) })
  assert.equal(r.status, 200); assert.match((await r.json()).answer, /No app is connected/)
})

test('analysis refuses private addresses up front and accepts nothing it cannot read', async () => {
  for (const input of ['http://127.0.0.1:5198/', 'http://localhost/', 'http://169.254.169.254/', 'file:///etc/passwd']) {
    const r = await post('/api/analyze', { input }); assert.equal(r.status, 400, input)
  }
  assert.equal((await post('/api/analyze', { input: '' })).status, 400)
  assert.equal((await post('/api/analyze/resolve', { input: 'http://10.0.0.1/' })).status, 400)
})
