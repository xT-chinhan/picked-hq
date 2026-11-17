import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, ArrowRight, Check, ChevronDown, Loader2, Lock, ScanSearch, Sparkles, X } from 'lucide-react'
import { tick } from './ticker'
import { Typed } from './Typed'
import { Face } from './avatars'
import { OFFLINE_MSG, probe } from './edge'

/* Business X-ray: type any company; Scrapling reads it, the site audit scores it, REA takes the live page apart, Ana writes the findings.
   Everything shown comes from the tools' own output; each finding names the evidence it rests on. */
type StepId = 'scrape' | 'audit' | 'rea' | 'synth'
type Step = { status: 'idle' | 'running' | 'done' | 'failed' | 'skipped'; ms?: number; data?: any; error?: string; note?: string }
type Evidence = { id: string; source: string; label: string; detail: string; ref?: string }
type Finding = { layer: string; title: string; why: string; fix: string; evidence: string[] }
export type Report = { id: string; url: string; brand: string; ms: number; partial: boolean; siteScore: number | null; blocked: boolean; layers: { id: string; name: string; score: number | null; counted: number; passed: number }[]; evidence: Evidence[]; headline: string; findings: Finding[]; strengths: { title: string; evidence: string[] }[]; by: string; status: Record<string, string>; tools?: { scrape: { pages: number; robots: string; llms: string } | null; rea: { domNodes: number; scripts: number; thirdParty: number; evidence: any } | null } }
export type Line = { id: number; kind: 'head' | 'act' | 'find' | 'warn'; step: StepId; text: string }
type Phase = 'idle' | 'resolving' | 'confirm' | 'running' | 'done' | 'error'
type Preset = { id: string; brand: string; url: string; siteScore: number | null }

const BLANK: Record<StepId, Step> = { scrape: { status: 'idle' }, audit: { status: 'idle' }, rea: { status: 'idle' }, synth: { status: 'idle' } }
export const useAnalyze = create<{ open: boolean; phase: Phase; input: string; resolved: { url: string; name: string; title?: string; verified?: boolean } | null; steps: Record<StepId, Step>; report: Report | null; err: string; replay: boolean; presets: Preset[]; showEvidence: boolean; feed: Line[]; t0: number; showLog: boolean; owner: number }>(() => ({ open: false, phase: 'idle', input: '', resolved: null, steps: BLANK, report: null, err: '', replay: false, presets: [], showEvidence: false, feed: [], t0: 0, showLog: false, owner: 0 }))
const set = useAnalyze.setState

const ORDER: StepId[] = ['scrape', 'audit', 'rea', 'synth']
const TOOLS: { id: StepId; name: string; what: string; color: string }[] = [
  { id: 'scrape', name: 'Reading the website', what: 'Pages, prices, contacts, the note for AI', color: '#0064d4' },
  { id: 'audit', name: 'Checking AI readiness', what: '39 checks an assistant cares about', color: '#0064d4' },
  { id: 'rea', name: 'Inspecting the live page', what: 'What really loads, in a real browser', color: '#0064d4' },
  { id: 'synth', name: 'Writing the verdict', what: 'Findings, each tied to evidence', color: '#0064d4' },
]
const SRC_NAME: Record<string, string> = { Scrapling: 'Site read', REA: 'Live page', 'Site audit': 'Readiness check' }

/* The narration: while a step runs, the agent says what it is doing right now (true descriptions of the step, never numbers);
   when the step returns, the real numbers it found are streamed in. */
const SAY: Record<StepId, (host: string) => string[]> = {
  scrape: (h) => [`Opening ${h}…`, 'Asking the site which pages a reader may visit…', 'Looking for a note left for AI assistants (llms.txt)…', 'Following links from the homepage…', 'Reading product and about pages…', 'Collecting prices, contacts and structured data…'],
  audit: () => ['Checking whether AI crawlers are let in…', 'Looking at what the page shows without JavaScript…', 'Looking for structured data an assistant can quote…', 'Checking trust pages: about, contact, privacy…', 'Testing how missing pages behave…', 'Scoring all 39 checks…'],
  rea: () => ['Opening the live page in a real browser…', 'Watching every network request…', 'Counting scripts and outside services…', 'Mapping the page structure…', 'Fingerprinting what was seen, so anyone can re-check it…'],
  synth: () => ['Laying out everything the agents found…', 'Weighing what keeps an AI from recommending this brand…', 'Drafting the findings…', 'Dropping any claim with no evidence behind it…', 'Writing the fix for each finding…'],
}
const PACE: Record<StepId, number> = { scrape: 2300, audit: 1000, rea: 2900, synth: 5200 }
let lineId = 0
const push = (kind: Line['kind'], step: StepId, text: string) => set((s) => ({ feed: [...s.feed, { id: ++lineId, kind, step, text }] }))
const clipTo = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t)
function foundLines(k: StepId, d: any, r?: Report | null): [Line['kind'], string][] {
  const out: [Line['kind'], string][] = []
  const ev = (src: string) => (r?.evidence ?? []).filter((e) => e.source === src).slice(0, 2).map((e) => ['find', `${e.label}: ${clipTo(e.detail, 120)}`] as [Line['kind'], string])
  if (k === 'scrape') {
    if (!d) return out
    if (d.pages === 0) return [['warn', 'The site would not let our reader in.']]
    out.push(['find', `Read ${d.pages} pages${d.words ? ` · ${d.words.toLocaleString()} words` : ''}`])
    if (d.title) out.push(['find', `Homepage calls itself “${clipTo(d.title, 80)}”`])
    if (d.jsonld?.length) out.push(['find', `Structured data found: ${d.jsonld.join(', ')}`])
    out.push(d.llms === 'found' ? ['find', 'llms.txt found: the site leaves a note for AI assistants'] : ['warn', 'No llms.txt: nothing written for AI assistants'])
    if (!d.title && r) out.push(...ev('Scrapling'))
  } else if (k === 'audit') {
    if (!d) return out
    if (d.blocked) out.push(['warn', 'The site blocks automated checks'])
    out.push(['find', `Readiness score ${d.score ?? '–'}/100${d.pass != null ? ` · ${d.pass} passed, ${d.warn} warnings, ${d.fail} failed` : ''}`])
    // the worst problems, one per line: failures first
    const issues: { s: string; t: string; d: string }[] = d.issues ?? (r?.evidence ?? []).filter((e) => e.id.startsWith('A:')).map((e) => ({ s: /^FAIL/.test(e.detail) ? 'fail' : 'warn', t: e.label, d: e.detail.replace(/^(FAIL|WARN):\s*/, '').replace(/\s*Fix:.*$/s, '') })).sort((a, b) => (a.s === 'fail' ? 0 : 1) - (b.s === 'fail' ? 0 : 1)).slice(0, 4)
    for (const i of issues.slice(0, 4)) out.push(['warn', `${i.s === 'fail' ? 'Failed' : 'Weak'}: ${i.t}${i.d ? ` — ${clipTo(i.d, 90)}` : ''}`])
  } else if (k === 'rea') {
    if (!d) return out
    out.push(['find', `${fmt(d.domNodes)} elements on the live page · ${d.scripts} scripts`])
    if (d.thirdParty != null) out.push([d.thirdParty > 3 ? 'warn' : 'find', `${d.thirdParty} outside service${d.thirdParty === 1 ? '' : 's'} loading with the page`])
    if (d.endpoints) out.push(['find', `${d.endpoints} network endpoints seen`])
  } else if (d) out.push(['find', `${d.findings} findings, each tied to evidence`])
  return out
}
let narr = 0
function narrate(k: StepId) {
  clearTimeout(narr)
  const st = useAnalyze.getState(), host = st.input.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const lines = SAY[k](host).slice(0, st.replay ? 3 : 99)
  push('head', k, TOOLS.find((t) => t.id === k)!.name)
  let i = 0
  const next = () => {
    if (useAnalyze.getState().steps[k].status !== 'running' || i >= lines.length) return
    push('act', k, lines[i++])
    narr = window.setTimeout(next, useAnalyze.getState().replay ? 650 / replaySpeed : PACE[k] * (0.8 + Math.random() * 0.4))
  }
  next()
}
// react to step changes, whoever drives them (a live job, a joined job or a replay)
useAnalyze.subscribe((s, p) => {
  if (s.steps === p.steps) return
  for (const k of ORDER) {
    const a = s.steps[k], b = p.steps[k]
    if (a === b) continue
    if (a.status === 'running' && b.status !== 'running') narrate(k)
    else if (b.status === 'running' && a.status !== 'running') {
      clearTimeout(narr)
      if (a.status === 'failed') push('warn', k, `Could not finish ${TOOLS.find((t) => t.id === k)!.name.toLowerCase()}; going on with what we have.`)
      else if (a.status === 'skipped') push('warn', k, `Skipped ${TOOLS.find((t) => t.id === k)!.name.toLowerCase()}${a.note ? ` (${a.note})` : ''}.`)
      else for (const [kind, text] of foundLines(k, a.data, s.report)) push(kind, k, text)
    } else if (a.status === 'done' && b.status === 'done' && a.data && !b.data) for (const [kind, text] of foundLines(k, a.data, s.report)) push(kind, k, text)
  }
})

const looksLikeSite = (s: string) => /^https?:\/\//i.test(s) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(s.trim())
const post = async (url: string, body: any) => { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { offline: !!j.offline, running: j.running }); return j }

let es: EventSource | null = null
export function openAnalyze(input?: string) {
  set({ open: true, ...(input ? { input } : {}) })
  loadPresets()
  if (input) void startAnalyze(input)
}
export async function loadPresets() {
  const list = await fetch('/api/analyses', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject())).then((j) => j.analyses).catch(() => fetch('/analyses/index.json').then((r) => r.json()).catch(() => []))
  const seen = new Set<string>() // newest run per site only
  set({ presets: (list as Preset[]).filter((x) => { const h = x.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, ''); return !seen.has(h) && !!seen.add(h) }) })
}
/** A site goes straight to the job; a company name is resolved to its website first and shown for confirmation. */
export async function startAnalyze(input: string) {
  const text = input.trim(); if (!text) return
  es?.close(); set({ input: text, phase: 'resolving', err: '', report: null, steps: BLANK, resolved: null, replay: false, showEvidence: false, feed: [], showLog: false })
  try {
    const r = await post('/api/analyze/resolve', { input: text })
    if (r.unresolved) { set({ phase: 'error', err: `Could not find a website for "${r.name}". Paste the address instead.` }); return }
    if (!looksLikeSite(text)) { set({ phase: 'confirm', resolved: { url: r.url, name: r.name, title: r.title, verified: r.verified } }); return }
    await run(r.url)
  } catch (e: any) { probe(); set({ phase: 'error', err: /fetch|Failed|offline/i.test(String(e.message)) ? OFFLINE_MSG : e.message }) }
}
export async function confirmAnalyze() { const r = useAnalyze.getState().resolved; if (r) await run(r.url) }
/** Follows a job on the server; every event so far is replayed first, so a second window or a reload simply catches up. */
function follow(id: string) {
  es?.close()
  es = new EventSource(`/api/analyze/${id}/events`)
  es.onmessage = (m) => {
    const ev = JSON.parse(m.data)
    if (ev.type === 'an.start') set({ input: ev.host })
    else if (ev.type === 'an.step') set((s) => ({ steps: { ...s.steps, [ev.step]: { status: ev.status, ms: ev.ms, data: ev.data, error: ev.error, note: ev.note } } }))
    else if (ev.type === 'an.done') { set((s) => ({ report: ev.report, steps: { ...s.steps, synth: { ...s.steps.synth, data: { findings: ev.report.findings.length, by: ev.report.by } } } })); es?.close(); loadPresets(); setTimeout(() => { if (useAnalyze.getState().phase === 'running') set({ phase: 'done' }) }, 1600) } // a beat to see the last line land
    else if (ev.type === 'an.error') { set({ phase: 'error', err: ev.error }); es?.close() }
  }
  es.onerror = () => { if (useAnalyze.getState().phase === 'running' && es?.readyState === EventSource.CLOSED) { probe(); set({ phase: 'error', err: OFFLINE_MSG }) } }
}
async function run(url: string) {
  set({ phase: 'running', steps: BLANK, report: null, feed: [], t0: Date.now(), showLog: false })
  try { follow((await post('/api/analyze', { input: url })).id) }
  catch (e: any) {
    if (e.running) { set({ input: e.running.url.replace(/^https?:\/\//, ''), err: '' }); follow(e.running.id); return } // someone else started one: join it
    probe(); set({ phase: 'error', err: /fetch|Failed/i.test(String(e.message)) ? OFFLINE_MSG : e.message })
  }
}
let replaySpeed = 1
export async function replayAnalysis(id: string, opts: { speed?: number; inline?: boolean } = {}) {
  replaySpeed = opts.speed ?? 1
  es?.close()
  // the backend first (it has the newest runs), the bundled copy when it is off or the network is down
  const r = await fetch(`/api/analyses/${id}`).then((x) => (x.ok ? x.json() : Promise.reject())).catch(() => fetch(`/analyses/${id}.json`).then((x) => x.json())).catch(() => null)
  if (!r) { set({ phase: 'error', err: 'That saved analysis is not available.' }); return }
  const steps = Object.fromEntries((['scrape', 'audit', 'rea', 'synth'] as StepId[]).map((k) => [k, { status: (r.status?.[k] ?? 'done') as Step['status'] }])) as Record<StepId, Step>
  set({ open: !opts.inline, phase: 'running', input: r.url.replace(/^https?:\/\//, '').replace(/\/$/, ''), resolved: null, report: null, steps: BLANK, replay: true, err: '', feed: [], t0: Date.now(), showLog: false })
  // replay the four steps at a watchable pace (the narration streams while each one "runs"), then the report
  const rr = r as Report
  for (const k of ORDER) {
    await new Promise((x) => setTimeout(x, 350 / replaySpeed))
    if (useAnalyze.getState().phase !== 'running') return
    set((s) => ({ report: null, steps: { ...s.steps, [k]: { status: 'running' } } }))
    await new Promise((x) => setTimeout(x, (3 * 650 + 400) / replaySpeed))
    if (useAnalyze.getState().phase !== 'running') return
    useAnalyze.setState({ report: rr }, false) // lets the narration quote saved evidence; cleared before the next step runs
    set((s) => ({ steps: { ...s.steps, [k]: { status: steps[k].status, ms: undefined, data: briefOf(k, rr) } } }))
    set({ report: null })
  }
  set((s) => ({ report: rr, steps: { ...s.steps, synth: { ...s.steps.synth } } }))
  await new Promise((x) => setTimeout(x, 1400 / replaySpeed))
  set({ phase: 'done', report: r })
}
function briefOf(k: StepId, r: Report) {
  if (k === 'scrape') return r.tools?.scrape ? { pages: r.tools.scrape.pages, robots: r.tools.scrape.robots, llms: r.tools.scrape.llms } : undefined
  if (k === 'audit') return { score: r.siteScore }
  if (k === 'rea') return r.tools?.rea ? { domNodes: r.tools.rea.domNodes, scripts: r.tools.rea.scripts, thirdParty: r.tools.rea.thirdParty } : undefined
  return { findings: r.findings.length, by: r.by }
}

const fmt = (n?: number | null) => (n == null ? '–' : n.toLocaleString())
export { Typed }

function Clock({ t0, frozen }: { t0: number; frozen?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => { if (frozen != null) { if (ref.current) ref.current.textContent = `${(frozen / 1000).toFixed(1)} s`; return } return tick(() => { if (ref.current) ref.current.textContent = `${((Date.now() - t0) / 1000).toFixed(1)} s` }) }, [t0, frozen])
  return <span ref={ref} className="tnum" />
}

/* Left: the page the agents are looking at, a scan beam in the colour of the current step, and the four steps. */
export function Scanner({ host, steps, done, replay, t0, ms }: { host: string; steps: Record<StepId, Step>; done: boolean; replay: boolean; t0: number; ms?: number }) {
  const cur = TOOLS.find((t) => steps[t.id].status === 'running')
  done = done || (!cur && steps.synth.status !== 'idle')
  const color = cur?.color ?? '#10b981'
  const lit = ORDER.filter((k) => steps[k].status === 'done').length
  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_-26px_rgba(15,23,42,.45)]">
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2.5">
          <span className="flex gap-1.5">{['#f87171', '#fbbf24', '#34d399'].map((c) => <span key={c} className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />)}</span>
          <span className="ml-1 flex min-w-0 flex-1 items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[13px] text-slate-600 ring-1 ring-slate-200"><Lock size={11} className="flex-none text-ok" /><span className="truncate">{host}</span></span>
        </div>
        <div className="relative h-[196px] overflow-hidden px-4 py-4">
          <div className="flex items-center gap-2"><div className="h-5 w-5 rounded-md bg-slate-200" /><div className="h-3 w-24 rounded bg-slate-200" /><div className="ml-auto flex gap-2">{[0, 1, 2].map((i) => <div key={i} className="h-2.5 w-10 rounded bg-slate-100" />)}</div></div>
          <div className="mt-4 grid grid-cols-[1.25fr_1fr] gap-3">
            <div className="space-y-2">
              {[92, 78, 64].map((w, i) => <motion.div key={i} animate={{ backgroundColor: lit > i ? `${TOOLS[i].color}33` : '#e2e8f0' }} className="h-3.5 rounded" style={{ width: `${w}%` }} />)}
              {[100, 96, 88, 70].map((w, i) => <div key={i} className="h-2 rounded bg-slate-100" style={{ width: `${w}%` }} />)}
            </div>
            <motion.div animate={{ backgroundColor: lit > 2 ? `${TOOLS[2].color}26` : '#f1f5f9' }} className="h-[84px] rounded-xl" />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">{[0, 1, 2].map((i) => <motion.div key={i} animate={{ backgroundColor: lit > 3 ? `${TOOLS[3].color}22` : '#f8fafc' }} className="h-9 rounded-lg ring-1 ring-slate-100" />)}</div>
          {!done && <div className="scanbeam pointer-events-none absolute inset-x-0 h-14" style={{ background: `linear-gradient(180deg, transparent, ${color}2e 70%, ${color})`, borderBottom: `2px solid ${color}`, boxShadow: `0 6px 18px -4px ${color}` }} />}
          {done && <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="absolute inset-0 grid place-items-center bg-white/55 backdrop-blur-[1px]"><span className="grid h-14 w-14 place-items-center rounded-full bg-ink text-white shadow-lg"><Check size={28} strokeWidth={3} /></span></motion.div>}
        </div>
      </div>
      <div className="mt-4 space-y-1">
        {TOOLS.map((t) => {
          const st = steps[t.id].status, run = st === 'running'
          return (
            <div key={t.id} className={`flex items-center gap-3 rounded-xl px-3 py-2 transition-colors ${run ? 'bg-slate-50' : ''}`}>
              <span className="grid h-6 w-6 flex-none place-items-center">
                {run ? <span className="relative grid h-3 w-3 place-items-center"><span className="absolute h-3 w-3 animate-ping rounded-full opacity-60" style={{ background: t.color }} /><span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} /></span>
                  : st === 'done' ? <span className="grid h-5 w-5 place-items-center rounded-full text-white" style={{ background: t.color }}><Check size={12} strokeWidth={3.5} /></span>
                  : st === 'failed' || st === 'skipped' ? <AlertTriangle size={16} className="text-warn" /> : <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />}
              </span>
              <span className={`text-[15px] ${run ? 'shimmer font-semibold' : st === 'idle' ? 'text-slate-400' : 'font-medium text-slate-800'}`}>{t.name}</span>
            </div>
          )
        })}
      </div>
      <div className="mt-3 px-3 text-[12.5px] text-slate-400">{replay ? 'Replay of a saved run, same data as when it was measured' : <>Live · <Clock t0={t0} frozen={done ? ms : undefined} /></>}</div>
    </div>
  )
}

/* Right: the agent's running commentary, streamed. */
export function Feed({ feed, live, tall }: { feed: Line[]; live: boolean; tall?: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = box.current; if (!el) return
    // follow the stream while it types, then stop
    let n = 0
    const stop = tick(() => { el.scrollTop = el.scrollHeight; if (++n > 30) stop() })
    return stop
  }, [feed.length])
  const last = feed[feed.length - 1]
  return (
    <div className="relative">
      <div className="mb-3 flex items-center gap-3">
        <span className="relative"><Face av="a26" size={40} />{live && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-ink" />}</span>
        <div><div className="text-[16px] font-semibold leading-tight text-slate-900">Ana</div><div className="text-[13px] text-slate-500">{live ? <span className="shimmer">thinking out loud…</span> : 'done'}</div></div>
      </div>
      <div ref={box} className={`${tall ? 'h-[330px]' : 'max-h-[300px]'} overflow-y-auto pr-2 [mask-image:linear-gradient(180deg,transparent,#000_28px)]`}>
        <div className="space-y-1.5 pt-6">
          {feed.map((l) => {
            const isLive = live && l === last && l.kind === 'act'
            const color = TOOLS.find((t) => t.id === l.step)!.color
            if (l.kind === 'head') return <motion.div key={l.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 pb-0.5 pt-3 text-[11.5px] font-bold uppercase tracking-[.14em]" style={{ color }}><span className="h-px w-5" style={{ background: color }} />{l.text}</motion.div>
            return (
              <motion.div key={l.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="flex items-start gap-2.5">
                <span className="mt-[3px] grid h-5 w-5 flex-none place-items-center">
                  {l.kind === 'find' ? <Sparkles size={15} style={{ color }} /> : l.kind === 'warn' ? <AlertTriangle size={15} className="text-warn" /> : isLive ? <Loader2 size={14} className="animate-spin text-slate-400" /> : <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />}
                </span>
                <Typed k={`${l.id}`} text={l.text} caret={l === last && live} className={`text-[15.5px] leading-snug ${l.kind === 'act' ? (isLive ? 'shimmer' : 'text-slate-400') : l.kind === 'warn' ? 'font-medium text-warn' : 'font-medium text-slate-900'}`} />
              </motion.div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const LAYER_COLOR: Record<string, string> = { reach: '#0891b2', understand: '#7c3aed', trust: '#d97706' }
const LAYER_NAME: Record<string, string> = { reach: 'Reachable', understand: 'Understandable', trust: 'Quotable' }
export function Result({ r, compact }: { r: Report; compact?: boolean }) {
  const [open, setOpen] = useState<string>('')
  const byId = new Map(r.evidence.map((e) => [e.id, e]))
  const tone = (v: number | null) => (v == null ? '#cbd5e1' : v >= 75 ? '#16a34a' : v >= 50 ? '#d97706' : '#e11d48')
  const reaIds = r.evidence.filter((e) => e.ref)
  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className={`mt-5 grid gap-6 ${compact ? 'grid-cols-1' : 'grid-cols-[300px_1fr]'}`}>
      <div>
        <div className="flex items-end gap-2"><span className="tnum text-[84px] font-semibold leading-none tracking-tight" style={{ color: tone(r.siteScore) }}>{r.siteScore ?? '–'}</span><span className="pb-3 text-[20px] text-slate-300">/100</span></div>
        <div className="mt-1 text-[14px] text-slate-500">{r.blocked ? 'This site blocks automated audits.' : 'Agent-readiness of the site'}</div>
        <div className="mt-5 space-y-3">
          {r.layers.map((l, i) => (
            <div key={l.id}>
              <div className="flex items-baseline justify-between text-[15px]"><span className="font-semibold text-slate-800">{l.name}</span><span className="tnum font-semibold" style={{ color: tone(l.score) }}>{l.score ?? '–'}</span></div>
              <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-100"><motion.div initial={{ width: 0 }} animate={{ width: `${l.score ?? 0}%` }} transition={{ delay: 0.2 + i * 0.12, duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }} className="h-full rounded-full" style={{ background: tone(l.score) }} /></div>
            </div>
          ))}
        </div>
        <div className="mt-5 text-[13px] leading-snug text-slate-400">{r.partial ? 'Partial: some steps did not finish. ' : ''}{(r.ms / 1000).toFixed(0)} s · {r.evidence.length} pieces of evidence</div>
      </div>
      <div className="min-w-0">
        <div className="flex items-start gap-3"><Sparkles size={22} className="mt-1 flex-none text-accent" /><Typed k={`h${r.id}`} text={r.headline || `${r.brand}: what stands in the way`} caret className="text-[22px] font-semibold leading-snug tracking-tight text-slate-900" /></div>
        <div className="mt-3 space-y-2.5">
          {r.findings.map((f, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + i * 0.1 }} className="rounded-2xl border border-slate-200 bg-white p-4" style={{ borderLeft: `5px solid ${LAYER_COLOR[f.layer] ?? '#94a3b8'}` }}>
              <div className="flex items-center gap-2"><span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[.1em] text-white" style={{ background: LAYER_COLOR[f.layer] ?? '#94a3b8' }}>{LAYER_NAME[f.layer] ?? f.layer}</span><span className="text-[17px] font-semibold leading-snug text-slate-900">{f.title}</span></div>
              {f.why && <div className="mt-1.5 text-[14.5px] leading-snug text-slate-600">{f.why}</div>}
              {f.fix && <div className="mt-1 text-[14.5px] leading-snug text-slate-800"><b className="font-semibold text-ok">Fix · </b>{f.fix}</div>}
              <div className="mt-2 flex flex-wrap gap-1.5">{f.evidence.map((id) => <button key={id} onClick={() => setOpen(open === `${i}${id}` ? '' : `${i}${id}`)} className={`rounded-full px-2.5 py-0.5 font-mono text-[11.5px] font-semibold ${byId.get(id)?.source === 'REA' ? 'bg-surface text-accent' : byId.get(id)?.source === 'Scrapling' ? 'bg-surface text-ok' : 'bg-slate-100 text-slate-600'}`}>{id.replace('A:', '')}</button>)}</div>
              {f.evidence.map((id) => open === `${i}${id}` && byId.get(id) && <div key={id} className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-[13px] leading-snug text-slate-600"><b className="text-slate-800">{SRC_NAME[byId.get(id)!.source] ?? byId.get(id)!.source} · {byId.get(id)!.label}</b><br />{byId.get(id)!.detail}{byId.get(id)!.ref && <><br /><span className="font-mono text-[11px] text-accent">{byId.get(id)!.ref}</span></>}</div>)}
            </motion.div>
          ))}
          {!r.findings.length && <div className="rounded-2xl bg-slate-50 p-4 text-[15px] text-slate-500">Nothing blocking was found in the evidence collected.</div>}
        </div>
        {r.strengths.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{r.strengths.map((s) => <span key={s.title} className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-[14px] font-medium text-ok"><Check size={14} strokeWidth={3} />{s.title}</span>)}</div>}
        {reaIds.length > 0 && <div className="mt-4 text-[12.5px] text-slate-500"><span className="font-semibold text-slate-700">Evidence fingerprints</span> (anyone can re-check them): {reaIds.map((e) => <span key={e.id} className="mr-2 font-mono text-[11px] text-accent">{e.ref!.slice(0, 18)}…</span>)}</div>}
      </div>
    </motion.div>
  )
}

export function Analyze() {
  const s = useAnalyze(), box = useRef<HTMLInputElement>(null)
  const [val, setVal] = useState('')
  useEffect(() => { if (s.open) { setVal(s.input); setTimeout(() => box.current?.focus(), 80) } }, [s.open])
  const busy = s.phase === 'resolving' || s.phase === 'running'
  return (
    <AnimatePresence>
      {s.open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => set({ open: false })} className="fixed inset-0 z-[70] grid place-items-center bg-slate-900/30 backdrop-blur-sm">
          <motion.div initial={{ y: 28, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 28 }} onClick={(e) => e.stopPropagation()} className="max-h-[calc(100dvh-40px)] w-[1180px] max-w-[96vw] overflow-y-auto rounded-[28px] border border-slate-200 bg-white p-7 shadow-[0_50px_120px_-30px_rgba(15,23,42,.5)]">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent text-white"><ScanSearch size={22} /></span>
              <div><div className="text-[24px] font-semibold leading-none tracking-tight text-slate-900">Business X-ray</div><div className="mt-1 text-[14.5px] text-slate-500">Pick any business. Our agents read it live and report back.</div></div>
              <button onClick={() => set({ open: false })} className="ml-auto grid h-9 w-9 place-items-center rounded-full text-slate-400 hover:bg-slate-100"><X size={18} /></button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); void startAnalyze(val) }} className="mt-5 flex gap-3">
              <input ref={box} value={val} onChange={(e) => setVal(e.target.value)} placeholder="A website or a company name, e.g. highlandscoffee.com.vn" disabled={busy} className="h-14 min-w-0 flex-1 rounded-2xl border border-slate-200 px-5 text-[17px] outline-none focus:border-accent disabled:bg-slate-50" />
              <button disabled={busy || !val.trim()} className="flex h-14 items-center gap-2 rounded-2xl bg-slate-900 px-7 text-[17px] font-semibold text-white hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400">Analyze<ArrowRight size={18} /></button>
            </form>
            {s.presets.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[13.5px] text-slate-500"><span>Saved runs</span>{s.presets.slice(0, 8).map((p) => <button key={p.id} onClick={() => void replayAnalysis(p.id)} disabled={busy} className="rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-slate-700 hover:border-accent hover:text-accent disabled:opacity-50">{p.brand.slice(0, 22)}{p.siteScore != null ? ` · ${p.siteScore}` : ''}</button>)}</div>
            )}

            {s.phase === 'confirm' && s.resolved && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-5 flex items-center gap-4 rounded-2xl border border-surface bg-surface px-5 py-4">
                <div className="min-w-0 flex-1"><div className="text-[13px] font-semibold uppercase tracking-[.1em] text-warn">Is this the one?</div><div className="mt-0.5 truncate text-[18px] font-semibold text-slate-900">{s.resolved.name} · {s.resolved.url.replace(/^https?:\/\//, '')}</div><div className="truncate text-[14px] text-slate-500">{s.resolved.verified ? `Page title: ${s.resolved.title}` : `The page title does not mention the name${s.resolved.title ? ` ("${s.resolved.title}")` : ''}: check before going on.`}</div></div>
                <button onClick={() => void confirmAnalyze()} className="h-12 rounded-xl bg-accent px-6 text-[16px] font-semibold text-white hover:bg-accent">Yes, analyze</button>
              </motion.div>
            )}
            {s.phase === 'resolving' && <div className="mt-5 flex items-center gap-3 text-[16px] text-slate-500"><Loader2 size={20} className="animate-spin" />Looking up the official website…</div>}
            {s.phase === 'error' && <div className="mt-5 rounded-2xl border border-surface bg-surface px-5 py-4 text-[16px] text-warn">{s.err}</div>}

            {s.phase === 'running' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6 grid grid-cols-[360px_1fr] gap-7">
                <Scanner host={s.input.replace(/^https?:\/\//, '').replace(/\/$/, '')} steps={s.steps} done={false} replay={s.replay} t0={s.t0} />
                <Feed feed={s.feed} live tall />
              </motion.div>
            )}
            {s.phase === 'done' && s.report && (
              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3">
                <button onClick={() => set({ showLog: !s.showLog })} className="flex w-full items-center gap-3 text-left">
                  <Face av="a26" size={30} />
                  <span className="min-w-0 flex-1 truncate text-[14.5px] text-slate-600"><b className="font-semibold text-slate-900">Ana read {s.report.tools?.scrape?.pages ?? '–'} pages, ran 39 checks and inspected the live page</b> · {(s.report.ms / 1000).toFixed(0)} s · {s.report.evidence.length} pieces of evidence</span>
                  <span className="flex flex-none items-center gap-1 text-[13px] font-semibold text-accent">{s.showLog ? 'Hide' : 'Show'} the log<ChevronDown size={15} className={`transition-transform ${s.showLog ? 'rotate-180' : ''}`} /></span>
                </button>
                {s.showLog && <div className="mt-3 border-t border-slate-200 pt-3"><Feed feed={s.feed} live={false} /></div>}
              </div>
            )}
            {s.phase === 'done' && s.report && <Result r={s.report} />}
            {s.phase === 'idle' && <div className="mt-8 grid grid-cols-4 gap-3 text-[14px] text-slate-500">{TOOLS.map((t) => <div key={t.id} className="rounded-2xl bg-slate-50 px-4 py-3"><div className="font-semibold text-slate-800">{t.name}</div>{t.what}</div>)}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
