import test from 'node:test'
import assert from 'node:assert/strict'
import { runAudit } from '../audit.mjs'

const answer = (t) => ({ text: `1. Elmich\n2. Lock&Lock\n${t}`, heads: [], cells: [], chips: [], ms: 5 })
const fakeLaunch = (closed = { v: false }) => async () => ({ ctx: { id: 0, close: async () => {} }, fresh: async () => ({ id: Math.random(), close: async () => {} }), close: async () => { closed.v = true } })
const run = (opts, impl) => { const ev = []; return runAudit({ brand: 'Elmich', category: 'hộp cơm giữ nhiệt', total: 6, tabs: 3 }, (e) => ev.push(e), impl).then((r) => ({ r, ev })) }

test('a normal run answers every question and ends', async () => {
  const { r, ev } = await run({}, { ask: async (_c, q) => answer(q), launch: fakeLaunch() })
  assert.equal(r.results.filter((x) => !x.error).length, 6)
  assert.equal(ev.at(-1).type, 'research.done')
})

test('questions are English by default', async () => {
  const seen = []
  await run({}, { ask: async (_c, q) => { seen.push(q); return answer(q) }, launch: fakeLaunch() })
  assert.ok(seen.every((q) => /^[\x00-\x7F’]+$/.test(q)), seen.join('|'))
})

test('a page that never answers is cut off by the per-question deadline and the run still ends', async () => {
  const { r, ev } = await run({}, { ask: () => new Promise(() => {}), launch: fakeLaunch(), deadlineMs: 40, giveUpAfter: 3, stallMs: 60000 })
  assert.equal(r.results.length, 6)
  assert.ok(r.results.every((x) => x.error))
  assert.ok(ev.some((e) => e.type === 'run.warning'), 'the operator is told why it stopped early')
  assert.equal(ev.at(-1).type, 'research.done')
})

test('after the first quick failure a worker retries as a new visitor and succeeds', async () => {
  let n = 0
  const { r } = await run({}, { ask: async (_c, q) => { if (n++ === 0) throw new Error('blocked: rate limit'); return answer(q) }, launch: fakeLaunch() })
  assert.equal(r.results.filter((x) => !x.error).length, 6)
})

test('the stall watchdog closes the browser when nothing moves, so a hung run is released', async () => {
  const closed = { v: false }
  const hang = (_c, _q) => new Promise((_, rej) => { const t = setInterval(() => { if (closed.v) { clearInterval(t); rej(new Error('browser closed')) } }, 10) })
  const { r, ev } = await run({}, { ask: hang, launch: fakeLaunch(closed), deadlineMs: 600000, stallMs: 120, giveUpAfter: 99 })
  assert.ok(closed.v)
  assert.ok(ev.some((e) => e.type === 'run.warning' && /stopped answering/.test(e.text)))
  assert.equal(r.results.length, 6)
})
