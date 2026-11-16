import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { cleanSchedule, createRoutines, describe, nextRun } from '../routines.mjs'

const at = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi, 0, 0).getTime()
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rt-')), 'routines.json')

test('validates schedules and rejects bad input', () => {
  assert.deepEqual(cleanSchedule({ kind: 'interval', minutes: '30' }), { kind: 'interval', minutes: 30 })
  assert.deepEqual(cleanSchedule({ kind: 'daily', at: '9:05' }), { kind: 'daily', at: '09:05' })
  assert.deepEqual(cleanSchedule({ kind: 'weekly', days: [3, 1, 1, 9, 'x'], at: '18:00' }), { kind: 'weekly', days: [1, 3], at: '18:00' })
  for (const bad of [{ kind: 'interval', minutes: 4 }, { kind: 'interval', minutes: 1441 }, { kind: 'daily', at: '24:00' }, { kind: 'weekly', days: [], at: '09:00' }, { kind: 'cron' }, undefined])
    assert.throws(() => cleanSchedule(bad))
})

test('computes the next run for each kind', () => {
  assert.equal(nextRun({ kind: 'interval', minutes: 10 }, 1000), 1000 + 600000)
  const wed = at(2026, 11, 18, 10, 0) // a Wednesday
  assert.equal(nextRun({ kind: 'daily', at: '09:00' }, wed), at(2026, 11, 19, 9, 0))
  assert.equal(nextRun({ kind: 'daily', at: '11:00' }, wed), at(2026, 11, 18, 11, 0))
  assert.equal(nextRun({ kind: 'weekly', days: [1], at: '09:00' }, wed), at(2026, 11, 23, 9, 0))
  assert.equal(nextRun({ kind: 'weekly', days: [3], at: '09:00' }, wed), at(2026, 11, 25, 9, 0), 'same weekday but time passed goes a week on')
  assert.equal(describe({ kind: 'weekly', days: [1, 3], at: '09:00' }), 'Mon, Wed at 09:00')
})

function setup(over = {}) {
  let t = at(2026, 11, 16, 8, 0), busy = false, n = 0
  const started = [], prev = {}
  const deps = {
    file: tmp(), now: () => t, isBusy: () => busy,
    startRun: (o) => { started.push(o); return { id: 'run' + ++n } },
    result: (id) => ({ mentioned: 19, total: 40, answered: 40 }),
    previous: (brand) => prev[brand] ?? null, ...over,
  }
  return { r: createRoutines(deps), deps, started, prev, advance: (ms) => (t += ms), setBusy: (b) => (busy = b), file: deps.file }
}

test('creates, lists, updates and deletes; persists across a restart', () => {
  const { r, deps } = setup()
  const a = r.create({ brand: 'Elmich', schedule: { kind: 'daily', at: '09:00' } })
  assert.equal(a.summary, 'Every day at 09:00'); assert.equal(a.mode, 'quick')
  r.update(a.id, { enabled: false })
  const again = createRoutines({ ...deps })
  assert.equal(again.list().length, 1); assert.equal(again.list()[0].enabled, false)
  assert.throws(() => r.create({ brand: ' ', schedule: { kind: 'daily', at: '09:00' } }))
  assert.equal(r.remove(a.id), true); assert.equal(r.remove(a.id), false)
})

test('tick starts only due, enabled routines, one at a time, and waits while busy', () => {
  const { r, started, advance, setBusy } = setup()
  const a = r.create({ brand: 'Elmich', schedule: { kind: 'interval', minutes: 10 } })
  r.create({ brand: 'Sunhouse', schedule: { kind: 'interval', minutes: 10 } })
  r.tick(); assert.equal(started.length, 0, 'nothing is due yet')
  advance(11 * 60000); setBusy(true); r.tick(); assert.equal(started.length, 0, 'busy machine waits')
  setBusy(false); r.tick(); assert.equal(started.length, 2)
  r.update(a.id, { enabled: false }); advance(11 * 60000); r.tick(); assert.equal(started.length, 3, 'only the enabled one fires again')
})

test('records the result and the change since the previous run, then lists it as unseen once', () => {
  const { r, prev } = setup()
  const a = r.create({ brand: 'Elmich', schedule: { kind: 'daily', at: '09:00' } })
  prev.Elmich = { mentioned: 17, total: 40 }
  const runId = r.fire(a.id, 'manual')
  assert.equal(r.list()[0].runs[0].status, 'running')
  const e = r.finished(runId, 'done')
  assert.equal(e.mentioned, 19); assert.equal(e.delta, 2)
  assert.equal(r.unseen().length, 1); assert.equal(r.unseen()[0].brand, 'Elmich')
  r.markSeen(runId); assert.equal(r.unseen().length, 0)
  assert.equal(r.finished('unknown', 'done'), null)
})

test('a stopped or failed run is reported without numbers', () => {
  const { r } = setup()
  const a = r.create({ brand: 'Elmich', schedule: { kind: 'daily', at: '09:00' } })
  const id = r.fire(a.id)
  const e = r.finished(id, 'stopped')
  assert.equal(e.status, 'stopped'); assert.equal(e.mentioned, undefined)
})

test('fire refuses when busy and limits the list size', () => {
  const { r, setBusy } = setup()
  const a = r.create({ brand: 'Elmich', schedule: { kind: 'daily', at: '09:00' } })
  setBusy(true); assert.equal(r.fire(a.id), null)
  setBusy(false)
  for (let i = 0; i < 11; i++) r.create({ brand: 'B' + i, schedule: { kind: 'daily', at: '09:00' } })
  assert.throws(() => r.create({ brand: 'X', schedule: { kind: 'daily', at: '09:00' } }), /at most 12/)
})
