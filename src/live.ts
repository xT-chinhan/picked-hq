import { create } from 'zustand'
import type { Answer, Session } from './sim'
// the same parser the audit server uses, so a saved run can be re-scored for any brand right in the browser
import { parseAnswer, summarize } from '../server/parse.mjs'

/* Real audit data: events from the local audit server (or a saved run replayed), shaped for the canvas. */
export type LQ = { qi: number; q: string; stage: 'queued' | 'run' | 'done' | 'error'; t0: number; tDone: number; text: string; brands: string[]; mentioned: boolean; rank: number | null; domains: string[]; ms: number }
export type Summary = {
  brand: string; total: number; answered: number; mentioned: number; mentionRate: number; top3: number; first: number; avgRank: number | null
  competitors: { name: string; count: number }[]; sources: { domain: string; count: number }[]
}
type L = {
  mode: 'script' | 'live' | 'replay'; status: 'idle' | 'running' | 'done' | 'error'; runId: string; brand: string; category: string; total: number
  qs: LQ[]; summary: Summary | null; log: { id: number; text: string }[]; freeze: boolean; err: string
}
export const useLive = create<L>(() => ({ mode: 'script', status: 'idle', runId: '', brand: '', category: '', total: 0, qs: [], summary: null, log: [], freeze: false, err: '' }))
export const lget = () => useLive.getState()
export const isLive = () => useLive.getState().mode !== 'script'

const blank = (qi: number, q: string): LQ => ({ qi, q, stage: 'queued', t0: 0, tDone: 0, text: '', brands: [], mentioned: false, rank: null, domains: [], ms: 0 })
let logId = 0
const say = (text: string) => useLive.setState((s) => ({ log: [{ id: ++logId, text }, ...s.log].slice(0, 6) }))

export function apply(ev: any) {
  const now = Date.now()
  if (ev.type === 'run.start') {
    useLive.setState({ brand: ev.brand, category: ev.category, total: ev.total, qs: ev.questions.map((q: string, i: number) => blank(i, q)), summary: null, status: 'running', log: [], err: '' })
    say(`Opening ${ev.tabs} Gemini tabs`)
  } else if (ev.type === 'q.start') {
    useLive.setState((s) => ({ qs: s.qs.map((x) => (x.qi === ev.qi ? { ...x, stage: 'run', t0: now } : x)) }))
    say(`Tab ${ev.slot + 1} asked "${ev.q.slice(0, 44)}${ev.q.length > 44 ? '…' : ''}"`)
  } else if (ev.type === 'q.done') {
    useLive.setState((s) => ({ qs: s.qs.map((x) => (x.qi === ev.qi ? { ...x, stage: 'done', tDone: now, text: ev.text, brands: ev.brands, mentioned: ev.mentioned, rank: ev.rank, domains: ev.domains, ms: ev.ms } : x)) }))
    say(ev.mentioned ? `Answer ${ev.qi + 1}: ${lget().brand} named${ev.rank ? ` (#${ev.rank})` : ''}` : `Answer ${ev.qi + 1}: ${lget().brand} not named`)
  } else if (ev.type === 'q.error') {
    useLive.setState((s) => ({ qs: s.qs.map((x) => (x.qi === ev.qi ? { ...x, stage: 'error', tDone: now } : x)) }))
  } else if (ev.type === 'run.progress') {
    useLive.setState({ summary: ev.summary })
  } else if (ev.type === 'run.done') {
    useLive.setState({ summary: ev.summary, status: 'done' })
    say('Audit complete')
    setTimeout(() => { useLive.setState({ freeze: false }); doneCb?.() }, 2200)
  } else if (ev.type === 'run.error') {
    useLive.setState({ status: 'error', err: ev.error, freeze: false })
  }
}

let doneCb: (() => void) | null = null
let es: EventSource | null = null
let timers: number[] = []
const stopAll = () => { es?.close(); es = null; timers.forEach(clearTimeout); timers = [] }

export async function startLive(o: { brand: string; category: string; total: number; tabs: number; headed?: boolean }, onStart: () => void, onDone?: () => void) {
  stopAll(); doneCb = onDone ?? null
  let r: Response, j: any
  try {
    r = await fetch('/api/audit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(o) })
    j = await r.json()
  } catch { useLive.setState({ mode: 'script', status: 'error', err: 'Live audit needs the local audit server. Start it with: pnpm live' }); return }
  if (!r.ok) { useLive.setState({ status: 'error', err: j.error || 'could not start' }); return }
  useLive.setState({ mode: 'live', runId: j.id, freeze: true, status: 'running' }); onStart()
  es = new EventSource(`/api/audit/${j.id}/events`)
  es.onmessage = (m) => { const ev = JSON.parse(m.data); apply(ev); if (ev.type === 'run.done' || ev.type === 'run.error') stopAll() }
  es.onerror = () => { if (lget().status === 'running' && es?.readyState === EventSource.CLOSED) useLive.setState({ status: 'error', err: 'connection lost', freeze: false }) }
}
export async function replayRun(id: string, speed: number, onStart: () => void, onDone?: () => void, brandOverride?: string) {
  stopAll(); doneCb = onDone ?? null
  const r = await fetch(`/api/runs/${id}`).then((x) => (x.ok ? x : fetch(`/runs/${id}.json`)))
  if (!r.ok) { useLive.setState({ status: 'error', err: 'run not found' }); return }
  const run = await r.json()
  const brand = (brandOverride || '').trim()
  const rescore = brand && brand !== run.brand
  let results: any[] = []
  const events = run.events.filter((e: any) => e.type !== 'q.partial').map((ev: any) => {
    if (!rescore) return ev
    if (ev.type === 'run.start') { results = new Array(ev.total).fill(null); return { ...ev, brand } }
    if (ev.type === 'q.done') { const p = parseAnswer({ text: ev.text, heads: [], cells: [], chips: ev.domains }, brand); results[ev.qi] = { ...ev, ...p }; return { ...ev, ...p } }
    if (ev.type === 'q.error') { results[ev.qi] = { error: ev.error }; return ev }
    if (ev.type === 'run.progress' || ev.type === 'run.done') return { ...ev, summary: summarize(results, brand, results.length) }
    return ev
  })
  useLive.setState({ mode: 'replay', runId: id, freeze: true, status: 'running' }); onStart()
  for (const ev of events) timers.push(window.setTimeout(() => apply(ev), ev.t / speed))
}
export function leaveLive() { stopAll(); useLive.setState({ mode: 'script', status: 'idle', freeze: false, qs: [], summary: null, log: [] }) }

/* ───────────── a canvas window shows one real question ───────────── */
const ansLen = (a: Answer) => a.intro.length + a.items.reduce((n, i) => n + i.name.length + i.reason.length + 3, 0)
function reasonFor(text: string, name: string) {
  const i = text.toLowerCase().indexOf(name.toLowerCase())
  if (i < 0) return ''
  let s = text.slice(i + name.length, i + name.length + 150).split('\n')[0]
  s = s.replace(/^\s*\([^)]*\)\s*/, '').replace(/^[\s:–—-]+/, '').replace(/\s+/g, ' ').trim()
  return s.length > 52 ? s.slice(0, 50).replace(/\s\S*$/, '') + '…' : s
}
export function toAnswer(text: string, brands: string[], target: string): Answer {
  const first = text.split('\n').find((l) => l.trim().length > 12) || ''
  const intro = first.length > 92 ? first.slice(0, 90).replace(/\s\S*$/, '') + '…' : first
  let list = brands.slice(0, 4)
  if (brands.includes(target) && !list.includes(target)) list = [...brands.slice(0, 3), target]
  return { intro, items: list.map((name) => ({ name, reason: reasonFor(text, name), me: name === target })) }
}

const TYPE_MS = 1300, REVEAL_MS = 3600
export function liveSession(i: number, now: number): Session {
  const L = lget()
  const mine = L.qs.filter((x) => x.qi % 12 === i)
  const started = mine.filter((x) => x.stage !== 'queued')
  const cur = started.length ? started[started.length - 1] : mine[0]
  const empty: Answer = { intro: '', items: [] }
  if (!cur) return { i, qi: 0, provider: 'gemini', q: '', ans: empty, total: 0, stage: 'boot', typed: 0, shown: 0, mentioned: false, rank: 0 } as Session
  const base = { i, qi: cur.qi, provider: 'gemini' as const, q: cur.q, mentioned: cur.mentioned, rank: cur.rank ?? 0 }
  if (cur.stage === 'queued') return { ...base, ans: empty, total: 0, stage: 'boot', typed: 0, shown: 0 } as Session
  if (cur.stage === 'run') {
    const dt = now - cur.t0
    return dt < TYPE_MS ? ({ ...base, ans: empty, total: 0, stage: 'type', typed: Math.floor((cur.q.length * dt) / TYPE_MS), shown: 0 } as Session) : ({ ...base, ans: empty, total: 0, stage: 'think', typed: cur.q.length, shown: 0 } as Session)
  }
  if (cur.stage === 'error') return { ...base, ans: empty, total: 0, stage: 'think', typed: cur.q.length, shown: 0 } as Session
  const ans = toAnswer(cur.text, cur.brands, L.brand), total = ansLen(ans), dt = now - cur.tDone
  return dt < REVEAL_MS ? ({ ...base, ans, total, stage: 'answer', typed: cur.q.length, shown: Math.floor((total * dt) / REVEAL_MS) } as Session) : ({ ...base, ans, total, stage: 'done', typed: cur.q.length, shown: total } as Session)
}
