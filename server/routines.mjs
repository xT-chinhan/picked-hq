// Routines: audits that re-run on a schedule, so "measured again in 7 days" is a real mechanism and not a caption.
// The scheduler only decides *when*; starting a run and reading its result are injected, which keeps this testable.
import fs from 'node:fs'
import path from 'node:path'

const MIN = 60000
/** Validates a schedule: every N minutes (5–1440), daily at HH:MM, or weekly on chosen days at HH:MM. Returns the clean schedule or throws. */
export function cleanSchedule(s = {}) {
  const hm = (v) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(v ?? '')); if (!m || +m[1] > 23 || +m[2] > 59) throw new Error('time must be HH:MM'); return `${String(+m[1]).padStart(2, '0')}:${m[2]}` }
  if (s.kind === 'interval') { const n = Math.round(+s.minutes); if (!(n >= 5 && n <= 1440)) throw new Error('interval must be 5 to 1,440 minutes'); return { kind: 'interval', minutes: n } }
  if (s.kind === 'daily') return { kind: 'daily', at: hm(s.at) }
  if (s.kind === 'weekly') {
    const days = [...new Set((Array.isArray(s.days) ? s.days : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
    if (!days.length) throw new Error('choose at least one day')
    return { kind: 'weekly', days, at: hm(s.at) }
  }
  throw new Error('schedule kind must be interval, daily or weekly')
}

/** Next run strictly after `from` (ms), in the machine's local time zone. */
export function nextRun(schedule, from) {
  if (schedule.kind === 'interval') return from + schedule.minutes * MIN
  const [h, m] = schedule.at.split(':').map(Number)
  for (let add = 0; add <= 8; add++) {
    const d = new Date(from); d.setDate(d.getDate() + add); d.setHours(h, m, 0, 0)
    if (d.getTime() > from && (schedule.kind === 'daily' || schedule.days.includes(d.getDay()))) return d.getTime()
  }
  return from + 24 * 60 * MIN
}

export const describe = (s) => s.kind === 'interval' ? `Every ${s.minutes} min` : s.kind === 'daily' ? `Every day at ${s.at}` : `${s.days.map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')} at ${s.at}`

/**
 * deps: { file, now?, isBusy(): boolean, startRun({brand, mode}): {id}|null, result(runId): {mentioned,total,answered}|null, previous(brand, beforeId): {mentioned,total}|null }
 */
export function createRoutines({ file, now = Date.now, isBusy, startRun, result, previous }) {
  let list = []
  try { list = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { /* first start */ }
  const save = () => { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(list, null, 1)); fs.renameSync(tmp, file) }
  const view = (r) => ({ ...r, summary: describe(r.schedule) })
  const find = (id) => list.find((r) => r.id === id)

  function create({ brand, mode = 'quick', schedule, title }) {
    brand = String(brand || '').trim().slice(0, 60)
    if (!brand) throw new Error('brand is required')
    if (list.length >= 12) throw new Error('at most 12 routines')
    const clean = cleanSchedule(schedule), t = now()
    const r = { id: 'rt' + t.toString(36) + Math.random().toString(36).slice(2, 5), title: String(title || `${brand} · ${mode === 'fresh' ? 'fresh' : 'quick'} audit`).slice(0, 80), brand, mode: mode === 'fresh' ? 'fresh' : 'quick', schedule: clean, enabled: true, createdAt: t, nextRunAt: nextRun(clean, t), runs: [] }
    list.push(r); save(); return view(r)
  }
  function update(id, patch = {}) {
    const r = find(id); if (!r) throw new Error('routine not found')
    if (typeof patch.enabled === 'boolean') { r.enabled = patch.enabled; if (r.enabled) r.nextRunAt = nextRun(r.schedule, now()) }
    if (patch.schedule) { r.schedule = cleanSchedule(patch.schedule); r.nextRunAt = nextRun(r.schedule, now()) }
    if (patch.title) r.title = String(patch.title).slice(0, 80)
    save(); return view(r)
  }
  function remove(id) { const n = list.length; list = list.filter((r) => r.id !== id); if (list.length !== n) save(); return list.length !== n }

  /** Starts one routine now (manual "Run now" or because it is due). Returns the run id, or null when another run is active. */
  function fire(id, why = 'schedule') {
    const r = find(id); if (!r) throw new Error('routine not found')
    if (isBusy()) return null
    const run = startRun({ brand: r.brand, mode: r.mode })
    if (!run) return null
    r.runs.unshift({ runId: run.id, at: now(), why, status: 'running' }); r.runs.length = Math.min(r.runs.length, 20)
    r.nextRunAt = nextRun(r.schedule, now()); save()
    return run.id
  }
  /** The server calls this when any run ends; routine runs get their result and the change since the previous run for that brand. */
  function finished(runId, status) {
    for (const r of list) {
      const e = r.runs.find((x) => x.runId === runId); if (!e) continue
      const res = status === 'done' ? result(runId) : null
      e.status = status
      if (res) { const prev = previous(r.brand, runId); Object.assign(e, { mentioned: res.mentioned, total: res.total, delta: prev ? res.mentioned - prev.mentioned : null }); e.seen = false }
      else e.seen = false
      save(); return e
    }
    return null
  }
  /** Fires every due, enabled routine one at a time (a busy machine waits for the next tick). */
  function tick() {
    const t = now()
    for (const r of list.filter((x) => x.enabled && x.nextRunAt <= t).sort((a, b) => a.nextRunAt - b.nextRunAt)) { if (isBusy()) break; fire(r.id) }
  }
  const markSeen = (runId) => { for (const r of list) for (const e of r.runs) if (!runId || e.runId === runId) e.seen = true; save() }
  /** Results the operator has not looked at yet, newest first. */
  const unseen = () => list.flatMap((r) => r.runs.filter((e) => e.status !== 'running' && e.seen === false).map((e) => ({ ...e, routineId: r.id, title: r.title, brand: r.brand }))).sort((a, b) => b.at - a.at)
  return { list: () => list.map(view), create, update, remove, fire, finished, tick, markSeen, unseen }
}
