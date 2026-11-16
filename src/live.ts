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
  mode: 'script' | 'live' | 'replay'; status: 'idle' | 'running' | 'done' | 'error'; runId: string; brand: string; category: string; website: string; total: number
  qs: LQ[]; summary: Summary | null; log: { id: number; text: string }[]; freeze: boolean; err: string
  site: any; facts: any; factsNote: string; factsPages: number; analysis: { missed: string[]; sources: { domain: string; count: number }[] } | null
  content: any; contentPreview: string; risk: any; approval: any; publish: any; track: any; at: Record<string, number>; phased: boolean
}
const FRESH = { qs: [], summary: null, log: [], err: '', website: '', site: null, facts: null, factsNote: '', factsPages: 0, analysis: null, content: null, contentPreview: '', risk: null, approval: null, publish: null, track: null, at: {}, phased: false }
export const useLive = create<L>(() => ({ mode: 'script', status: 'idle', runId: '', brand: '', category: '', total: 0, freeze: false, ...FRESH } as L))
export const lget = () => useLive.getState()
export const isLive = () => useLive.getState().mode !== 'script'

/** the canvas clock hooks in here to follow the phases the pipeline announces */
let phaseHook: (p: string | null) => void = () => {}
export const setPhaseHook = (f: (p: string | null) => void) => { phaseHook = f }

const blank = (qi: number, q: string): LQ => ({ qi, q, stage: 'queued', t0: 0, tDone: 0, text: '', brands: [], mentioned: false, rank: null, domains: [], ms: 0 })
let logId = 0
const say = (text: string) => useLive.setState((s) => ({ log: [{ id: ++logId, text }, ...s.log].slice(0, 6) }))
const stamp = (k: string) => useLive.setState((s) => ({ at: { ...s.at, [k]: Date.now() } }))

export function apply(ev: any) {
  const now = Date.now()
  switch (ev.type) {
    case 'run.start':
      useLive.setState({ ...FRESH, brand: ev.brand, category: ev.category, total: ev.total, qs: ev.questions.map((q: string, i: number) => blank(i, q)), status: 'running' })
      say(ev.reused ? 'Replaying saved Gemini answers' : `Opening ${ev.tabs} Gemini tabs`); break
    case 'questions': useLive.setState({ website: ev.website || '' }); stamp('questions'); break
    case 'phase': useLive.setState({ phased: true }); phaseHook(ev.phase); break
    case 'q.start':
      useLive.setState((s) => ({ qs: s.qs.map((x) => (x.qi === ev.qi ? { ...x, stage: 'run', t0: now } : x)) }))
      say(`Tab ${ev.slot + 1} asked "${ev.q.slice(0, 44)}${ev.q.length > 44 ? '…' : ''}"`); break
    case 'q.done':
      useLive.setState((s) => ({ qs: s.qs.map((x) => (x.qi === ev.qi ? { ...x, stage: 'done', tDone: now, text: ev.text, brands: ev.brands, mentioned: ev.mentioned, rank: ev.rank, domains: ev.domains, ms: ev.ms } : x)) }))
      say(ev.mentioned ? `Answer ${ev.qi + 1}: ${lget().brand} named${ev.rank ? ` (#${ev.rank})` : ''}` : `Answer ${ev.qi + 1}: ${lget().brand} not named`); break
    case 'q.error': useLive.setState((s) => ({ qs: s.qs.map((x) => (x.qi === ev.qi ? { ...x, stage: 'error', tDone: now } : x)) })); break
    case 'run.progress': useLive.setState({ summary: ev.summary }); break
    case 'research.done': useLive.setState({ summary: ev.summary }); say('All answers collected'); break
    case 'analysis.done': useLive.setState({ analysis: { missed: ev.missed, sources: ev.sources } }); stamp('analysis'); say(`${ev.missed.length} questions did not name the brand`); break
    case 'site.done': useLive.setState({ site: ev.audit }); stamp('site'); say(`Website audit: ${ev.audit.score}/100`); break
    case 'facts.done': useLive.setState({ facts: ev.facts, factsNote: ev.note || '', factsPages: ev.pages?.length ?? 0 }); stamp('facts'); say(ev.facts ? `${ev.facts.facts.length} sourced facts from the website` : 'No readable website facts'); break
    case 'content.done': useLive.setState({ content: ev.content, contentPreview: ev.preview?.llms || '' }); stamp('content'); say(`Drafted ${ev.content.faqs.length} FAQs, an about page and a pitch`); break
    case 'risk.done': useLive.setState({ risk: ev.risk }); stamp('risk'); say('Risk gate checked every sentence'); break
    case 'approval.requested': useLive.setState({ approval: { ...ev.approval, status: 'pending', decisions: null } }); stamp('approval'); say('Waiting for the owner to approve'); break
    case 'approval.done': useLive.setState((s) => ({ approval: s.approval ? { ...s.approval, status: ev.status, decisions: ev.decisions } : s.approval })); stamp('approved'); say(`Owner ${ev.status}`); break
    case 'publish.done': useLive.setState({ publish: ev }); stamp('publish'); say(ev.skipped ? 'Nothing approved to publish' : 'Shop page published'); break
    case 'track.done': useLive.setState({ track: ev }); stamp('track'); break
    case 'stage.error': say(`${ev.stage}: ${ev.error}`); break
    case 'run.done':
      useLive.setState({ summary: ev.summary, status: 'done' })
      say('Run complete'); break
    case 'run.error': useLive.setState({ status: 'error', err: ev.error }); break
  }
}

let es: EventSource | null = null
let timers: number[] = []
const stopAll = () => { es?.close(); es = null; timers.forEach(clearTimeout); timers = [] }

export async function startLive(o: { brand: string; category: string; website: string; total: number; tabs: number; headed?: boolean; reuse?: string; autoApprove?: boolean }) {
  stopAll()
  let r: Response, j: any
  try {
    r = await fetch('/api/audit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(o) })
    j = await r.json()
  } catch { useLive.setState({ mode: 'script', status: 'error', err: 'Live audit needs the local audit server. Start it with: pnpm live' }); return }
  if (!r.ok) { useLive.setState({ status: 'error', err: j.error || 'could not start' }); return }
  useLive.setState({ mode: 'live', runId: j.id, status: 'running', ...FRESH }); phaseHook('mining')
  es = new EventSource(`/api/audit/${j.id}/events`)
  es.onmessage = (m) => { const ev = JSON.parse(m.data); apply(ev); if (ev.type === 'run.done' || ev.type === 'run.error') stopAll() }
  es.onerror = () => { if (lget().status === 'running' && es?.readyState === EventSource.CLOSED) useLive.setState({ status: 'error', err: 'connection lost' }) }
}

/** Replays a saved run. A run saved before phases existed gets research → analysis phases synthesised. */
export async function replayRun(id: string, speed: number, brandOverride?: string) {
  stopAll()
  const r = await fetch(`/api/runs/${id}`).then((x) => (x.ok ? x : fetch(`/runs/${id}.json`)))
  if (!r.ok) { useLive.setState({ status: 'error', err: 'run not found' }); return }
  const run = await r.json()
  const brand = (brandOverride || '').trim(), rescore = brand && brand !== run.brand
  let results: any[] = []
  let events: any[] = run.events.filter((e: any) => e.type !== 'q.partial').map((ev: any) => {
    if (!rescore) return ev
    if (ev.type === 'run.start') { results = new Array(ev.total).fill(null); return { ...ev, brand } }
    if (ev.type === 'q.done') { const p = parseAnswer({ text: ev.text, heads: [], cells: [], chips: ev.domains }, brand); results[ev.qi] = { ...ev, ...p }; return { ...ev, ...p } }
    if (ev.type === 'q.error') { results[ev.qi] = { error: ev.error }; return ev }
    if (['run.progress', 'run.done', 'research.done'].includes(ev.type)) return { ...ev, summary: summarize(results, brand, results.length) }
    return ev
  })
  if (!events.some((e) => e.type === 'phase')) {
    const done = events.find((e) => e.type === 'run.done')
    events = [{ t: 0, type: 'phase', phase: 'research' }, ...events, ...(done ? [{ t: done.t + 2200 * speed, type: 'phase', phase: 'analysis' }] : [])].sort((a, b) => a.t - b.t)
  }
  useLive.setState({ mode: 'replay', runId: id, status: 'running', ...FRESH }); phaseHook('mining')
  for (const ev of events) timers.push(window.setTimeout(() => apply(ev), ev.t / speed))
}
export function leaveLive() { stopAll(); phaseHook(null); useLive.setState({ mode: 'script', status: 'idle', freeze: false, ...FRESH }) }

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
