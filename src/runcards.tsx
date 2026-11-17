import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { AlertTriangle, ArrowRight, Check, Globe, Loader2, Workflow } from 'lucide-react'
import { Face } from './avatars'
import { Compass as Chrome } from 'lucide-react'
import { Feed, Scanner, startAnalyze, confirmAnalyze, useAnalyze, type Report } from './Analyze'
import { Typed, TypedMd } from './Typed'
import { CostCard } from './savings'
import { PageReviewView, Ranking, ReportView, isBlocked, type PageReview } from './report'
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
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 28 }} className="w-full max-w-[860px] overflow-hidden rounded-[22px] border border-line bg-white">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        {p && <Face av={p.av} size={32} plain />}
        <div className="min-w-0 flex-1"><div className="text-[14px] font-semibold leading-tight text-ink">{p?.name}<span className="font-normal text-faint"> · {p?.role}</span></div><div className={`truncate text-[15.5px] ${state === 'work' ? 'shimmer font-medium' : 'text-mute'}`}>{title}</div></div>
        <span className={`flex flex-none items-center gap-1.5 text-[14px] font-medium ${state === 'work' ? 'text-mute' : state === 'done' ? 'text-ok' : 'text-warn'}`}>
          {state === 'work' ? <><Loader2 size={15} className="animate-spin" />Working</> : state === 'done' ? <><Check size={15} strokeWidth={3} />Done</> : <><AlertTriangle size={15} />Stopped</>}
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
          {k < i ? <Check size={15} strokeWidth={3} className="text-ok" /> : <Loader2 size={15} className="animate-spin text-accent" />}
          <span className={k < i ? 'text-faint' : 'shimmer font-medium'}>{l}</span>
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
  if (!mine) return <Shell m={m} title={`X-ray of ${host}`} state="warn"><div className="text-[15px] text-mute">This analysis was interrupted. Ask again to rerun it.</div></Shell>
  if (a.phase === 'error') return <Shell m={m} title={`X-ray of ${host}`} state="warn"><div className="text-[15.5px] text-warn">{a.err || OFFLINE_MSG}</div></Shell>
  if (a.phase === 'confirm' && a.resolved) return (
    <Shell m={m} title="Is this the one?" state="work">
      <div className="flex items-center gap-4"><div className="min-w-0 flex-1"><div className="truncate text-[18px] font-semibold text-ink">{a.resolved.name} · {a.resolved.url.replace(/^https?:\/\//, '')}</div><div className="truncate text-[14px] text-mute">{a.resolved.verified ? `Page title: ${a.resolved.title}` : `The page title does not mention the name${a.resolved.title ? ` (“${a.resolved.title}”)` : ''}: check before going on.`}</div></div>
        <button onClick={() => void confirmAnalyze()} className="h-11 rounded-xl bg-accent px-5 text-[15px] font-semibold text-white hover:bg-accent">Yes, analyze</button></div>
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
      <button onClick={() => setLog((v) => !v)} className="mb-3 text-[13.5px] font-semibold text-accent hover:underline">{log ? 'Hide' : 'Show'} what the agents did while they worked</button>
      {log && feed && <div className="mb-4 rounded-xl bg-surface p-3"><Feed feed={feed} live={false} /></div>}
      <ReportView r={r} extra={isBlocked(r) ? <ExtensionBridge url={r.url} /> : undefined} />
    </div>
  )
}

/* A site that blocks bots is not bypassed. The visitor opens it in their own Chrome and the NaN extension reads it from there,
   with the visitor's own session; the review comes back here. */
function ExtensionBridge({ url }: { url: string }) {
  const host = url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '')
  const [since] = useState(() => Date.now()), [opened, setOpened] = useState(false), [got, setGot] = useState<{ review: PageReview; title: string; url: string } | null>(null)
  useEffect(() => {
    if (!opened || got) return
    const id = setInterval(async () => {
      const j = await fetch(`/api/page/reviews?since=${since}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      const hit = j?.reviews?.find((x: any) => x.host === host)
      if (hit) setGot(hit)
    }, 2000)
    return () => clearInterval(id)
  }, [opened, got])
  if (got) return <PageReviewView review={got.review} title={got.title} url={got.url} />
  return (
    <div className="rounded-[22px] border border-surface bg-gradient-to-br from-surface to-white p-5">
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-white text-ink ring-1 ring-line"><Chrome size={24} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[21px] font-semibold tracking-[-0.025em] text-ink">{host} turns our robot away</div>
          <p className="mt-1 text-[15.5px] leading-snug text-mute">We do not disguise ourselves to get past a block. Open the page in <b className="font-semibold text-ink">your own Chrome</b> instead: the NaN extension reads what you can see, and the review appears here.</p>
          <ol className="mt-3 space-y-1.5 text-[15px] text-ink">
            {['Open the site in your Chrome', 'Click the NaN extension, then “Review this page”', 'The score and checks land in this chat'].map((t, i) => <li key={t} className="flex items-center gap-2.5"><span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-white text-[13px] font-bold text-ink ring-1 ring-line">{i + 1}</span>{t}</li>)}
          </ol>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button onClick={() => { window.open(url, '_blank', 'noopener'); setOpened(true) }} className="flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[15px] font-semibold text-white hover:bg-black"><Chrome size={17} />Open {host} in my Chrome<ArrowRight size={15} /></button>
            {opened && <span className="flex items-center gap-2 text-[14.5px] font-medium text-warn"><Loader2 size={15} className="animate-spin" /><span className="shimmer">Waiting for the extension…</span></span>}
          </div>
        </div>
      </div>
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
  if (m.res?.summary || m.res?.interrupted) return <Shell m={m} title={m.res.interrupted ? `${title} (interrupted)` : title} state={m.res.interrupted ? 'warn' : 'done'}>{m.res.summary ? <Summary s={m.res.summary} site={m.res.site} /> : <div className="text-[15px] text-mute">This run was interrupted. Ask again to rerun it.</div>}</Shell>
  if (err || (mine && L.status === 'error')) return <Shell m={m} title={title} state="warn"><div className="text-[15.5px] text-warn">{err || L.err}</div></Shell>
  const s = STAGES.map(([name, f]) => ({ name, ...f(L) }))
  const cur = s.findIndex((x) => x.state === 'run')
  return (
    <Shell m={m} title={title} state={fin ? 'done' : 'work'}>
      <div className="grid grid-cols-[1fr_1fr] gap-6">
        <div className="space-y-1">
          {s.map((x, i) => (
            <div key={x.name} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
              <span className="grid h-6 w-6 flex-none place-items-center">{x.state === 'done' ? <span className="grid h-5 w-5 place-items-center rounded-full bg-ink text-white"><Check size={12} strokeWidth={3.5} /></span> : x.state === 'run' ? <span className="relative grid h-3 w-3 place-items-center"><span className="absolute h-3 w-3 animate-ping rounded-full bg-accent opacity-60" /><span className="h-2.5 w-2.5 rounded-full bg-accent" /></span> : <span className="h-2.5 w-2.5 rounded-full bg-line" />}</span>
              <span className={`flex-1 text-[15px] ${x.state === 'run' ? 'shimmer font-semibold' : x.state === 'idle' ? 'text-faint' : 'font-medium text-ink'}`}>{x.name}</span>
              {x.note && <span className="tnum text-[13.5px] text-mute">{x.note}</span>}
              {i === cur && L.total > 0 && x.state === 'run' && i === 0 && <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface"><motion.span className="block h-full bg-accent" animate={{ width: `${(L.qs.filter((q) => q.stage === 'done').length / L.total) * 100}%` }} /></span>}
            </div>
          ))}
        </div>
        <div className="min-w-0">
          {L.summary && <Summary s={L.summary} site={L.site?.score ?? null} />}
          <div className="mt-3 space-y-1">{L.log.slice(0, 4).map((l) => <motion.div key={l.id} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-2 text-[14px] text-mute"><span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-slate-300" /><Typed k={`al${l.id}`} text={l.text} className={l === L.log[0] ? 'text-ink' : ''} /></motion.div>)}</div>
        </div>
      </div>
      {L.approval?.status === 'pending' && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-surface bg-surface px-4 py-3"><span className="flex-1 text-[15px] font-medium text-warn">The owner has {L.approval.docs?.length ?? 'some'} documents to approve.</span>
          <button onClick={() => void exec({ type: 'approve' }, false, -1)} className="h-10 rounded-xl bg-ink px-5 text-[15px] font-semibold text-white">Approve</button>
          <button onClick={() => void exec({ type: 'reject' }, false, -1)} className="h-10 rounded-xl bg-white px-5 text-[15px] font-semibold text-ink ring-1 ring-slate-300">Reject</button></div>
      )}
      <button onClick={() => useOffice.setState({ open: false })} className="mt-3 flex items-center gap-1.5 text-[13.5px] font-semibold text-accent hover:underline"><Workflow size={14} />Watch the same run on the workflow canvas<ArrowRight size={13} /></button>
    </Shell>
  )
}
function Summary({ s, site }: { s: any; site: number | null }) {
  const rate = Math.round((s.mentioned / (s.answered || 1)) * 100)
  return (
    <div className="rounded-2xl bg-surface p-3">
      <div className="flex items-end gap-2"><span className="tnum text-[34px] font-semibold leading-none" style={{ color: rate >= 25 ? '#16a34a' : '#e11d48' }}>{s.mentioned}<span className="text-slate-300">/{s.total}</span></span><span className="pb-1 text-[14px] text-mute">answers name {s.brand}</span></div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">{[['Top 3', s.top3], ['Avg rank', s.avgRank != null ? Number(s.avgRank).toFixed(1) : '–'], ['Website', site != null ? `${site}/100` : '–']].map(([k, v]) => <div key={k as string} className="rounded-xl bg-white py-1.5"><div className="tnum text-[17px] font-semibold text-ink">{v}</div><div className="text-[12.5px] text-mute">{k}</div></div>)}</div>
      <div className="mt-2 space-y-1">{(s.competitors ?? []).slice(0, 3).map((r: any) => <div key={r.name} className="flex items-center gap-2 text-[13.5px]"><span className="w-24 truncate text-mute">{r.name}</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-white"><motion.div initial={{ width: 0 }} animate={{ width: `${(r.count / (s.answered || 1)) * 100}%` }} className="h-full rounded-full bg-slate-400" /></div><span className="tnum w-6 text-right text-mute">{r.count}</span></div>)}</div>
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
  if (m.res?.interrupted) return <Shell m={m} title={title} state="warn"><div className="text-[15px] text-mute">This job was interrupted. Ask again to rerun it.</div></Shell>
  if (err) return <Shell m={m} title={title} state="warn"><div className="text-[15.5px] text-warn">{err}</div></Shell>
  if (!m.res) return <Shell m={m} title={title} state="work"><Pending lines={HINTS[act.type] ?? ['Working on it…']} /></Shell>
  const card = m.res.card
  return (
    <Shell m={m} title={title} state="done">
      {act.type === 'browse' && <div className="mb-2 flex items-center gap-2 text-[14px] font-medium text-accent"><Globe size={15} />The page is open in the browser on the right.</div>}
      <div className="text-[16px] leading-relaxed text-ink">{m.old ? <TypedMd k={`ex${m.id}`} text={m.res.text} /> : <TypedMd k={`ex${m.id}`} text={m.res.text} />}</div>
      {card && card.kind !== 'answer' && <Card c={card} />}
      {card?.kind === 'answer' && (
        <div className="mt-3 space-y-3">
          <Ranking brands={card.brands} target={card.brand} ms={card.ms} />
          <div className="rounded-[20px] border border-line bg-white p-4"><div className="mb-1.5 text-[12.5px] font-bold uppercase tracking-[.16em] text-faint">What Gemini said</div><div className="text-[15px] leading-relaxed text-ink"><TypedMd k={`an${m.id}`} text={card.text.slice(0, 1200)} /></div></div>
        </div>
      )}
    </Shell>
  )
}

export function RunCard({ thread, m }: { thread: string; m: CMsg }) {
  const k = m.run!.kind
  if (k === 'cost') return <Shell m={m} title="What this replaces" state="done"><CostCard /></Shell>
  return k === 'xray' ? <Xray thread={thread} m={m} /> : k === 'audit' ? <Audit thread={thread} m={m} /> : <Exec thread={thread} m={m} />
}
