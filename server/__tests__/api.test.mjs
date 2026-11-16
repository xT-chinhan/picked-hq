import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

// Starts the real server on a spare port with the edge off, and exercises the HTTP contract the frontend relies on.
const PORT = 5391
let child
const url = (p) => `http://127.0.0.1:${PORT}${p}`
const post = (p, b) => fetch(url(p), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })

before(async () => {
  child = spawn('node', ['server/index.mjs'], { env: { ...process.env, PICKED_PORT: String(PORT), PICKED_NO_EDGE: '1' }, stdio: 'ignore' })
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
  if (a.status === 422) return // no saved answers on this checkout: nothing to start
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
