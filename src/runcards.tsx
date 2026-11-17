import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { AlertTriangle, ArrowRight, Check, Globe, Loader2, Workflow } from 'lucide-react'
import { Face } from './avatars'
import { Feed, Result, Scanner, Typed, startAnalyze, confirmAnalyze, useAnalyze, type Report } from './Analyze'
import { useLive } from './live'
import { Card, exec } from './SystemOne'
import { useOffice } from './Office'
import { OFFLINE_MSG } from './edge'
import { patch, personOf, type CMsg } from './chat'

/* Real jobs, shown inside the conversation while they happen. Each card starts its own job once, streams what the job reports,
   and leaves a small snapshot in the message so it still reads after a reload. */
const started = new Set<number>()
const done = (thread: string, m: CMsg, res: any) => patch(thread, m.id, { res })

function Shell({ m, title, state, children }: { m: CMsg; title: string; state: 'work' | 'done' | 'warn'; children: ReactNode }) {
  const p = personOf(m.who)
  return (
    <motion.div initial={{ opacity: 0, y: 14, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 26 }} className="w-full max-w-[860px] overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_24px_60px_-38px_rgba(15,23,42,.45)]">
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
        {p && <Face av={p.av} size={32} />}
        <div className="min-w-0 flex-1"><div className="text-[14px] font-semibold leading-tight text-slate-900">{p?.name}<span className="font-normal text-slate-400"> · {p?.role}</span></div><div className={`truncate text-[15px] ${state === 'work' ? 'shimmer font-medium' : 'text-slate-600'}`}>{title}</div></div>
        <span className={`flex flex-none items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold ${state === 'work' ? 'bg-indigo-50 text-indigo-600' : state === 'done' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
          {state === 'work' ? <><Loader2 size={14} className="animate-spin" />Working</> : state === 'done' ? <><Check size={14} strokeWidth={3} />Done</> : <><AlertTriangle size={14} />Stopped</>}
        </span>
      </div>
      <div className="p-4">{children}</div>
    </motion.div>
  )
}

/* a short script of what the agent is doing right now, ticking until the job answers */
function Pending({ lines }: { lines: string[] }) {
  const [i, setI] = useState(0)
  useEffect(() => { const id = setInterval(() => setI((n) => Math.min(lines.length - 1, n + 1)), 2600); return () => clearInterval(id) }, [lines.length])
  return (
    <div className="space-y-1.5">
      {lines.slice(0, i + 1).map((l, k) => (
        <motion.div key={k} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2.5 text-[15.5px]">
          {k < i ? <Check size={15} strokeWidth={3} className="text-emerald-500" /> : <Loader2 size={15} className="animate-spin text-indigo-500" />}
          <span className={k < i ? 'text-slate-400' : 'shimmer font-medium'}>{l}</span>
        </motion.div>
      ))}
    </div>
  )
}

/* ───────────── Business X-ray ───────────── */
function Xray({ thread, m }: { thread: string; m: CMsg }) {
  const a = useAnalyze(), mine = a.owner === m.id
  const input = (m.run as any).input as string
  useEffect(() => { if (started.has(m.id) || m.res) return; started.add(m.id); useAnalyze.setState({ owner: m.id }); void startAnalyze(input) }, [])
  useEffect(() => { if (mine && a.phase === 'done' && a.report && !m.res) done(thread, m, { report: a.report, feed: a.feed }) }, [mine, a.phase, a.report])
  const host = (a.input || input).replace(/^https?:\/\//, '').replace(/\/$/, '')
  if (m.res?.report) return <Done m={m} title={`${(m.res.report as Report).brand}: ${(m.res.report as Report).siteScore ?? '–'}/100 agent-readiness`}><Report r={m.res.report} feed={m.res.feed} /></Done>
  if (!mine) return <Shell m={m} title={`X-ray of ${host}`} state="warn"><div className="text-[15px] text-slate-500">This analysis was interrupted. Ask again to rerun it.</div></Shell>
  if (a.phase === 'error') return <Shell m={m} title={`X-ray of ${host}`} state="warn"><div className="text-[15.5px] text-amber-900">{a.err || OFFLINE_MSG}</div></Shell>
  if (a.phase === 'confirm' && a.resolved) return (
    <Shell m={m} title="Is this the one?" state="work">
      <div className="flex items-center gap-4"><div className="min-w-0 flex-1"><div className="truncate text-[18px] font-semibold text-slate-900">{a.resolved.name} · {a.resolved.url.replace(/^https?:\/\//, '')}</div><div className="truncate text-[14px] text-slate-500">{a.resolved.verified ? `Page title: ${a.resolved.title}` : `The page title does not mention the name${a.resolved.title ? ` (“${a.resolved.title}”)` : ''}: check before going on.`}</div></div>
        <button onClick={() => void confirmAnalyze()} className="h-11 rounded-xl bg-indigo-600 px-5 text-[15px] font-semibold text-white hover:bg-indigo-700">Yes, analyze</button></div>
    </Shell>
  )
  if (a.phase === 'resolving' || a.phase === 'idle') return <Shell m={m} title={`Looking up ${input}…`} state="work"><Pending lines={['Finding the official website…', 'Checking the page title matches the name…']} /></Shell>
  if (a.phase === 'done' && a.report) return <Done m={m} title={`${a.report.brand}: ${a.report.siteScore ?? '–'}/100 agent-readiness`}><Report r={a.report} feed={a.feed} /></Done>
  return (
    <Shell m={m} title={`Reading ${host}`} state="work">
      <div className="grid grid-cols-[260px_1fr] gap-5"><Scanner host={host} steps={a.steps} done={false} replay={false} t0={a.t0} /><Feed feed={a.feed} live /></div>
    </Shell>
  )
}
const Done = ({ m, title, children }: { m: CMsg; title: string; children: ReactNode }) => <Shell m={m} title={title} state="done">{children}</Shell>
function Report({ r, feed }: { r: Report; feed?: any[] }) {
  const [log, setLog] = useState(false)
  return (
    <div>
      <button onClick={() => setLog((v) => !v)} className="mb-1 text-[13.5px] font-semibold text-indigo-600 hover:underline">{log ? 'Hide' : 'Show'} what the agents did · {(r.ms / 1000).toFixed(0)} s · {r.evidence.length} pieces of evidence</button>
      {log && feed && <div className="mt-2 rounded-xl bg-slate-50 p-3"><Feed feed={feed} live={false} /></div>}
      <Result r={r} compact />
    </div>
  )
}

/* ───────────── live audit (the whole pipeline, in the chat) ───────────── */
let auditOwner = 0
const STAGES: [string, (L: any) => { state: 'idle' | 'run' | 'done'; note?: string }][] = [
  ['Asking Gemini the buyer questions', (L) => { const n = L.qs.filter((q: any) => q.stage === 'done').length; return { state: L.summary && n >= L.total && L.total ? 'done' : L.qs.length ? 'run' : 'idle', note: L.total ? `${n}/${L.total}` : '' } }],
  ['Why the brand gets skipped', (L) => ({ state: L.analysis ? 'done' : L.summary ? 'run' : 'idle', note: L.analysis ? `${L.analysis.missed.length} questions miss it` : '' })],
  ['Auditing the website', (L) => ({ state: L.site ? 'done' : L.analysis ? 'run' : 'idle', note: L.site ? `${L.site.score}/100` : '' })],
  ['Collecting sourced facts', (L) => ({ state: L.facts ? 'done' : L.site ? 'run' : 'idle', note: L.facts ? `${L.facts.facts?.length ?? 0} facts` : '' })],
  ['Writing FAQ, about page and pitch', (L) => ({ state: L.content ? 'done' : L.facts ? 'run' : 'idle', note: L.content ? `${L.content.faqs.length} FAQs` : '' })],
  ['Fact-check council and risk gate', (L) => ({ state: L.risk ? 'done' : L.content ? 'run' : 'idle', note: L.council ? `${L.council.unanimous}/${L.council.sentences} unanimous` : '' })],
  ['Waiting for the owner', (L) => ({ state: L.approval && L.approval.status !== 'pending' ? 'done' : L.risk ? 'run' : 'idle', note: L.approval?.status ?? '' })],
]
function Audit({ thread, m }: { thread: string; m: CMsg }) {
  const L = useLive(), act = (m.run as any).act
  const [err, setErr] = useState('')
  useEffect(() => {
    if (started.has(m.id) || m.res) return; started.add(m.id); auditOwner = m.id
    void exec(act, false, -1).then((r) => { if (!r.text || /Could not start|Không chạy/.test(r.text)) setErr(r.text) }).catch((e) => setErr(String(e.message || e)))
  }, [])
  const mine = auditOwner === m.id
  const fin = mine && (L.status === 'done' || (L.mode === 'replay' && L.summary && L.qs.length && L.qs.every((q) => q.stage === 'done')))
  useEffect(() => { if (fin && !m.res) done(thread, m, { brand: L.brand, summary: L.summary, site: L.site?.score ?? null }) }, [fin])
  const title = `${act.type === 'replay' ? 'Replaying saved answers for' : 'Auditing'} ${act.brand || L.brand || 'the brand'}`
  if (m.res?.summary || m.res?.interrupted) return <Shell m={m} title={m.res.interrupted ? `${title} (interrupted)` : title} state={m.res.interrupted ? 'warn' : 'done'}>{m.res.summary ? <Summary s={m.res.summary} site={m.res.site} /> : <div className="text-[15px] text-slate-500">This run was interrupted. Ask again to rerun it.</div>}</Shell>
  if (err || (mine && L.status === 'error')) return <Shell m={m} title={title} state="warn"><div className="text-[15.5px] text-amber-900">{err || L.err}</div></Shell>
  const s = STAGES.map(([name, f]) => ({ name, ...f(L) }))
  const cur = s.findIndex((x) => x.state === 'run')
  return (
    <Shell m={m} title={title} state={fin ? 'done' : 'work'}>
      <div className="grid grid-cols-[1fr_1fr] gap-6">
        <div className="space-y-1">
          {s.map((x, i) => (
            <div key={x.name} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
              <span className="grid h-6 w-6 flex-none place-items-center">{x.state === 'done' ? <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white"><Check size={12} strokeWidth={3.5} /></span> : x.state === 'run' ? <span className="relative grid h-3 w-3 place-items-center"><span className="absolute h-3 w-3 animate-ping rounded-full bg-indigo-400 opacity-60" /><span className="h-2.5 w-2.5 rounded-full bg-indigo-500" /></span> : <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />}</span>
              <span className={`flex-1 text-[15px] ${x.state === 'run' ? 'shimmer font-semibold' : x.state === 'idle' ? 'text-slate-400' : 'font-medium text-slate-800'}`}>{x.name}</span>
              {x.note && <span className="tnum text-[13.5px] text-slate-500">{x.note}</span>}
              {i === cur && L.total > 0 && x.state === 'run' && i === 0 && <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100"><motion.span className="block h-full bg-indigo-500" animate={{ width: `${(L.qs.filter((q) => q.stage === 'done').length / L.total) * 100}%` }} /></span>}
            </div>
          ))}
        </div>
        <div className="min-w-0">
          {L.summary && <Summary s={L.summary} site={L.site?.score ?? null} />}
          <div className="mt-3 space-y-1">{L.log.slice(0, 4).map((l) => <motion.div key={l.id} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-2 text-[14px] text-slate-500"><span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-slate-300" /><Typed k={`al${l.id}`} text={l.text} className={l === L.log[0] ? 'text-slate-800' : ''} /></motion.div>)}</div>
        </div>
      </div>
      {L.approval?.status === 'pending' && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3"><span className="flex-1 text-[15px] font-medium text-amber-900">The owner has {L.approval.docs?.length ?? 'some'} documents to approve.</span>
          <button onClick={() => void exec({ type: 'approve' }, false, -1)} className="h-10 rounded-xl bg-emerald-600 px-5 text-[15px] font-semibold text-white">Approve</button>
          <button onClick={() => void exec({ type: 'reject' }, false, -1)} className="h-10 rounded-xl bg-white px-5 text-[15px] font-semibold text-slate-700 ring-1 ring-slate-300">Reject</button></div>
      )}
      <button onClick={() => useOffice.setState({ open: false })} className="mt-3 flex items-center gap-1.5 text-[13.5px] font-semibold text-indigo-600 hover:underline"><Workflow size={14} />Watch the same run on the workflow canvas<ArrowRight size={13} /></button>
    </Shell>
  )
}
function Summary({ s, site }: { s: any; site: number | null }) {
  const rate = Math.round((s.mentioned / (s.answered || 1)) * 100)
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <div className="flex items-end gap-2"><span className="tnum text-[34px] font-semibold leading-none" style={{ color: rate >= 25 ? '#16a34a' : '#e11d48' }}>{s.mentioned}<span className="text-slate-300">/{s.total}</span></span><span className="pb-1 text-[14px] text-slate-500">answers name {s.brand}</span></div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">{[['Top 3', s.top3], ['Avg rank', s.avgRank ?? '–'], ['Website', site != null ? `${site}/100` : '–']].map(([k, v]) => <div key={k as string} className="rounded-xl bg-white py-1.5"><div className="tnum text-[17px] font-semibold text-slate-900">{v}</div><div className="text-[12.5px] text-slate-500">{k}</div></div>)}</div>
      <div className="mt-2 space-y-1">{(s.competitors ?? []).slice(0, 3).map((r: any) => <div key={r.name} className="flex items-center gap-2 text-[13.5px]"><span className="w-24 truncate text-slate-600">{r.name}</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-white"><motion.div initial={{ width: 0 }} animate={{ width: `${(r.count / (s.answered || 1)) * 100}%` }} className="h-full rounded-full bg-slate-400" /></div><span className="tnum w-6 text-right text-slate-500">{r.count}</span></div>)}</div>
    </div>
  )
}

/* ───────────── every other real job: ask Gemini, use apps, review a page, read the numbers on screen ───────────── */
const HINTS: Record<string, string[]> = {
  ask: ['Opening a fresh anonymous Gemini tab…', 'Typing your question exactly as written…', 'Waiting for the answer to finish…', 'Reading which brands it names…'],
  apps: ['Looking at the connected apps…', 'Choosing the right tool…', 'Calling it and reading the result…'],
  browse: ['Opening the page in the agent browser…', 'Reading the page…', 'Scoring how readable it is for AI assistants…'],
  profile: ['Loading the saved Gemini answers…', 'Scoring them for this brand…'],
}
const TITLE: Record<string, (a: any) => string> = {
  ask: (a) => `Asking Gemini: “${String(a.q).slice(0, 70)}”`, apps: () => 'Using the connected apps', browse: (a) => `${a.review ? 'Reviewing' : 'Opening'} ${a.url}`, profile: (a) => `Profile of ${a.brand}`,
  explain: () => 'What is on screen', rivals: () => 'Who Gemini names most', score: () => 'How often the brand is named', help: () => 'What I can do', shop: () => 'The published shop page', approve: () => 'Owner approval', reject: () => 'Owner approval',
}
function Exec({ thread, m }: { thread: string; m: CMsg }) {
  const act = (m.run as any).act
  const [err, setErr] = useState('')
  useEffect(() => {
    if (started.has(m.id) || m.res) return; started.add(m.id)
    void exec(act, false, -1).then((r) => done(thread, m, { text: r.text, card: r.card })).catch((e) => setErr(/offline|Failed to fetch/.test(String(e.message)) ? OFFLINE_MSG : String(e.message || e)))
  }, [])
  const title = (TITLE[act.type] ?? (() => act.type))(act)
  if (m.res?.interrupted) return <Shell m={m} title={title} state="warn"><div className="text-[15px] text-slate-500">This job was interrupted. Ask again to rerun it.</div></Shell>
  if (err) return <Shell m={m} title={title} state="warn"><div className="text-[15.5px] text-amber-900">{err}</div></Shell>
  if (!m.res) return <Shell m={m} title={title} state="work"><Pending lines={HINTS[act.type] ?? ['Working on it…']} /></Shell>
  const card = m.res.card
  return (
    <Shell m={m} title={title} state="done">
      {act.type === 'browse' && <div className="mb-2 flex items-center gap-2 text-[14px] font-medium text-sky-700"><Globe size={15} />The page is open in the browser on the right.</div>}
      <div className="text-[16px] leading-relaxed text-slate-800">{m.old ? m.res.text : <Typed k={`ex${m.id}`} text={m.res.text} />}</div>
      {card && card.kind !== 'answer' && <Card c={card} />}
      {card?.kind === 'answer' && (
        <div className="mt-3 rounded-2xl bg-slate-50 p-3">
          <div className="flex flex-wrap gap-1.5">{card.brands.slice(0, 8).map((b: string, i: number) => <motion.span key={b} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.06 }} className={`rounded-full px-2.5 py-1 text-[13.5px] font-medium ${b === card.brand ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>{i + 1}. {b}</motion.span>)}</div>
          <div className="mt-2 whitespace-pre-wrap text-[14.5px] leading-snug text-slate-600">{m.old ? card.text.slice(0, 900) : <Typed k={`an${m.id}`} text={card.text.slice(0, 900)} />}</div>
          <div className="mt-2 text-[12.5px] font-semibold uppercase tracking-[.1em] text-emerald-600">Real · gemini.google.com · {(card.ms / 1000).toFixed(1)} s</div>
        </div>
      )}
    </Shell>
  )
}

export function RunCard({ thread, m }: { thread: string; m: CMsg }) {
  const k = m.run!.kind
  return k === 'xray' ? <Xray thread={thread} m={m} /> : k === 'audit' ? <Audit thread={thread} m={m} /> : <Exec thread={thread} m={m} />
}
