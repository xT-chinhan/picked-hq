import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, Check, Globe, Loader2, ScanSearch, ShieldCheck, Sparkles, X } from 'lucide-react'
import { Face } from './avatars'
import { OFFLINE_MSG, probe } from './edge'

/* Business X-ray: type any company; Scrapling reads it, the site audit scores it, REA takes the live page apart, Ana writes the findings.
   Everything shown comes from the tools' own output; each finding names the evidence it rests on. */
type StepId = 'scrape' | 'audit' | 'rea' | 'synth'
type Step = { status: 'idle' | 'running' | 'done' | 'failed' | 'skipped'; ms?: number; data?: any; error?: string; note?: string }
type Evidence = { id: string; source: string; label: string; detail: string; ref?: string }
type Finding = { layer: string; title: string; why: string; fix: string; evidence: string[] }
type Report = { id: string; url: string; brand: string; ms: number; partial: boolean; siteScore: number | null; blocked: boolean; layers: { id: string; name: string; score: number | null; counted: number; passed: number }[]; evidence: Evidence[]; headline: string; findings: Finding[]; strengths: { title: string; evidence: string[] }[]; by: string; status: Record<string, string>; tools?: { scrape: { pages: number; robots: string; llms: string } | null; rea: { domNodes: number; scripts: number; thirdParty: number; evidence: any } | null } }
type Phase = 'idle' | 'resolving' | 'confirm' | 'running' | 'done' | 'error'
type Preset = { id: string; brand: string; url: string; siteScore: number | null }

const BLANK: Record<StepId, Step> = { scrape: { status: 'idle' }, audit: { status: 'idle' }, rea: { status: 'idle' }, synth: { status: 'idle' } }
export const useAnalyze = create<{ open: boolean; phase: Phase; input: string; resolved: { url: string; name: string; title?: string; verified?: boolean } | null; steps: Record<StepId, Step>; report: Report | null; err: string; replay: boolean; presets: Preset[]; showEvidence: boolean }>(() => ({ open: false, phase: 'idle', input: '', resolved: null, steps: BLANK, report: null, err: '', replay: false, presets: [], showEvidence: false }))
const set = useAnalyze.setState

const TOOLS: { id: StepId; name: string; what: string }[] = [
  { id: 'scrape', name: 'Scrapling', what: 'Reads the site' },
  { id: 'audit', name: 'Site audit', what: '39 readiness checks' },
  { id: 'rea', name: 'REA', what: 'Takes the live page apart' },
  { id: 'synth', name: 'Ana', what: 'Writes the findings' },
]
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
  set({ presets: list })
}
/** A site goes straight to the job; a company name is resolved to its website first and shown for confirmation. */
export async function startAnalyze(input: string) {
  const text = input.trim(); if (!text) return
  es?.close(); set({ input: text, phase: 'resolving', err: '', report: null, steps: BLANK, resolved: null, replay: false, showEvidence: false })
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
    else if (ev.type === 'an.done') { set((s) => ({ phase: 'done', report: ev.report, steps: { ...s.steps, synth: { ...s.steps.synth, data: { findings: ev.report.findings.length, by: ev.report.by } } } })); es?.close(); loadPresets() }
    else if (ev.type === 'an.error') { set({ phase: 'error', err: ev.error }); es?.close() }
  }
  es.onerror = () => { if (useAnalyze.getState().phase === 'running' && es?.readyState === EventSource.CLOSED) { probe(); set({ phase: 'error', err: OFFLINE_MSG }) } }
}
async function run(url: string) {
  set({ phase: 'running', steps: BLANK, report: null })
  try { follow((await post('/api/analyze', { input: url })).id) }
  catch (e: any) {
    if (e.running) { set({ input: e.running.url.replace(/^https?:\/\//, ''), err: '' }); follow(e.running.id); return } // someone else started one: join it
    probe(); set({ phase: 'error', err: /fetch|Failed/i.test(String(e.message)) ? OFFLINE_MSG : e.message })
  }
}
export async function replayAnalysis(id: string) {
  es?.close()
  // the backend first (it has the newest runs), the bundled copy when it is off or the network is down
  const r = await fetch(`/api/analyses/${id}`).then((x) => (x.ok ? x.json() : Promise.reject())).catch(() => fetch(`/analyses/${id}.json`).then((x) => x.json())).catch(() => null)
  if (!r) { set({ phase: 'error', err: 'That saved analysis is not available.' }); return }
  const steps = Object.fromEntries((['scrape', 'audit', 'rea', 'synth'] as StepId[]).map((k) => [k, { status: (r.status?.[k] ?? 'done') as Step['status'] }])) as Record<StepId, Step>
  set({ open: true, phase: 'running', input: r.url, resolved: null, report: null, steps: BLANK, replay: true, err: '' })
  // replay the four steps at a watchable pace, then the report
  for (let i = 0; i < 4; i++) {
    const k = (['scrape', 'audit', 'rea', 'synth'] as StepId[])[i]
    await new Promise((x) => setTimeout(x, 450))
    if (useAnalyze.getState().phase !== 'running') return
    set((s) => ({ steps: { ...s.steps, [k]: { status: 'running' } } }))
    await new Promise((x) => setTimeout(x, 700))
    set((s) => ({ steps: { ...s.steps, [k]: { status: steps[k].status, ms: undefined, data: briefOf(k, r) } } }))
  }
  set({ phase: 'done', report: r })
}
function briefOf(k: StepId, r: Report) {
  if (k === 'scrape') return r.tools?.scrape ? { pages: r.tools.scrape.pages, robots: r.tools.scrape.robots, llms: r.tools.scrape.llms } : undefined
  if (k === 'audit') return { score: r.siteScore }
  if (k === 'rea') return r.tools?.rea ? { domNodes: r.tools.rea.domNodes, scripts: r.tools.rea.scripts, thirdParty: r.tools.rea.thirdParty } : undefined
  return { findings: r.findings.length, by: r.by }
}

const fmt = (n?: number | null) => (n == null ? '–' : n.toLocaleString())
function StepCard({ t, s, i }: { t: (typeof TOOLS)[number]; s: Step; i: number }) {
  const d = s.data, running = s.status === 'running'
  const blocked = t.id === 'scrape' && s.status === 'done' && d?.pages === 0 // the tool ran, but the site would not let it read anything
  const icon = t.id === 'scrape' ? <Globe size={22} /> : t.id === 'audit' ? <ShieldCheck size={22} /> : t.id === 'rea' ? <ScanSearch size={22} /> : <Face av="a26" size={44} />
  const line =
    s.status === 'failed' ? s.error : s.status === 'skipped' ? s.note || 'skipped' : !d ? (running ? 'Working…' : t.what)
    : t.id === 'scrape' ? (blocked ? 'Blocked: the site would not let the reader in' : `${d.pages} pages · llms.txt ${d.llms ?? '?'}`) : t.id === 'audit' ? `${d.score ?? '–'}/100${d.pass != null ? ` · ${d.pass} pass, ${d.warn} warn, ${d.fail} fail` : ''}`
    : t.id === 'rea' ? `${fmt(d.domNodes)} DOM nodes · ${d.scripts} scripts${d.thirdParty != null ? ` · ${d.thirdParty} third-party` : ''}` : `${d.findings} findings · written by ${d.by}`
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * i }} className={`relative flex-1 rounded-2xl border p-4 transition-colors ${running ? 'border-indigo-300 bg-indigo-50/50' : blocked ? 'border-amber-200 bg-amber-50/50' : s.status === 'done' ? 'border-emerald-200 bg-emerald-50/30' : s.status === 'failed' ? 'border-rose-200 bg-rose-50/40' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-center gap-3">
        <span className={`grid h-11 w-11 flex-none place-items-center rounded-xl ${t.id === 'synth' ? '' : 'bg-slate-900 text-white'}`}>{icon}</span>
        <div className="min-w-0 flex-1"><div className="text-[17px] font-semibold leading-tight tracking-tight text-slate-900">{t.name}</div><div className="text-[13px] text-slate-500">{t.what}</div></div>
        <span className="flex-none">{running ? <Loader2 size={20} className="animate-spin text-indigo-500" /> : blocked ? <X size={20} strokeWidth={3} className="text-amber-500" /> : s.status === 'done' ? <Check size={20} strokeWidth={3} className="text-emerald-500" /> : s.status === 'failed' ? <X size={20} className="text-rose-500" /> : <span className="block h-3 w-3 rounded-full bg-slate-200" />}</span>
      </div>
      <div className="mt-3 min-h-[40px] text-[14.5px] leading-snug text-slate-700">{line}</div>
      {s.ms != null && <div className="absolute right-4 top-4 text-[11px] font-medium text-slate-400">{(s.ms / 1000).toFixed(1)} s</div>}
    </motion.div>
  )
}

const LAYER_COLOR: Record<string, string> = { reach: '#0891b2', understand: '#7c3aed', trust: '#d97706' }
const LAYER_NAME: Record<string, string> = { reach: 'Reachable', understand: 'Understandable', trust: 'Quotable' }
function Result({ r }: { r: Report }) {
  const [open, setOpen] = useState<string>('')
  const byId = new Map(r.evidence.map((e) => [e.id, e]))
  const tone = (v: number | null) => (v == null ? '#cbd5e1' : v >= 75 ? '#16a34a' : v >= 50 ? '#d97706' : '#e11d48')
  const reaIds = r.evidence.filter((e) => e.ref)
  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mt-5 grid grid-cols-[300px_1fr] gap-6">
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
        <div className="flex items-start gap-3"><Sparkles size={22} className="mt-1 flex-none text-indigo-600" /><div className="text-[22px] font-semibold leading-snug tracking-tight text-slate-900">{r.headline || `${r.brand}: what stands in the way`}</div></div>
        <div className="mt-3 space-y-2.5">
          {r.findings.map((f, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + i * 0.1 }} className="rounded-2xl border border-slate-200 bg-white p-4" style={{ borderLeft: `5px solid ${LAYER_COLOR[f.layer] ?? '#94a3b8'}` }}>
              <div className="flex items-center gap-2"><span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[.1em] text-white" style={{ background: LAYER_COLOR[f.layer] ?? '#94a3b8' }}>{LAYER_NAME[f.layer] ?? f.layer}</span><span className="text-[17px] font-semibold leading-snug text-slate-900">{f.title}</span></div>
              {f.why && <div className="mt-1.5 text-[14.5px] leading-snug text-slate-600">{f.why}</div>}
              {f.fix && <div className="mt-1 text-[14.5px] leading-snug text-slate-800"><b className="font-semibold text-emerald-700">Fix · </b>{f.fix}</div>}
              <div className="mt-2 flex flex-wrap gap-1.5">{f.evidence.map((id) => <button key={id} onClick={() => setOpen(open === `${i}${id}` ? '' : `${i}${id}`)} className={`rounded-full px-2.5 py-0.5 font-mono text-[11.5px] font-semibold ${byId.get(id)?.source === 'REA' ? 'bg-indigo-100 text-indigo-700' : byId.get(id)?.source === 'Scrapling' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{id.replace('A:', '')}</button>)}</div>
              {f.evidence.map((id) => open === `${i}${id}` && byId.get(id) && <div key={id} className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-[13px] leading-snug text-slate-600"><b className="text-slate-800">{byId.get(id)!.source} · {byId.get(id)!.label}</b><br />{byId.get(id)!.detail}{byId.get(id)!.ref && <><br /><span className="font-mono text-[11px] text-indigo-600">{byId.get(id)!.ref}</span></>}</div>)}
            </motion.div>
          ))}
          {!r.findings.length && <div className="rounded-2xl bg-slate-50 p-4 text-[15px] text-slate-500">Nothing blocking was found in the evidence collected.</div>}
        </div>
        {r.strengths.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{r.strengths.map((s) => <span key={s.title} className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[14px] font-medium text-emerald-800"><Check size={14} strokeWidth={3} />{s.title}</span>)}</div>}
        {reaIds.length > 0 && <div className="mt-4 text-[12.5px] text-slate-500"><span className="font-semibold text-slate-700">REA evidence ids</span> (content-addressed, re-checkable): {reaIds.map((e) => <span key={e.id} className="mr-2 font-mono text-[11px] text-indigo-600">{e.ref!.slice(0, 18)}…</span>)}</div>}
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
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white"><ScanSearch size={22} /></span>
              <div><div className="text-[24px] font-semibold leading-none tracking-tight text-slate-900">Business X-ray</div><div className="mt-1 text-[14.5px] text-slate-500">Pick any business. Real tools read it and report back.</div></div>
              <button onClick={() => set({ open: false })} className="ml-auto grid h-9 w-9 place-items-center rounded-full text-slate-400 hover:bg-slate-100"><X size={18} /></button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); void startAnalyze(val) }} className="mt-5 flex gap-3">
              <input ref={box} value={val} onChange={(e) => setVal(e.target.value)} placeholder="A website or a company name, e.g. highlandscoffee.com.vn" disabled={busy} className="h-14 min-w-0 flex-1 rounded-2xl border border-slate-200 px-5 text-[17px] outline-none focus:border-indigo-400 disabled:bg-slate-50" />
              <button disabled={busy || !val.trim()} className="flex h-14 items-center gap-2 rounded-2xl bg-slate-900 px-7 text-[17px] font-semibold text-white hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400">Analyze<ArrowRight size={18} /></button>
            </form>
            {s.presets.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[13.5px] text-slate-500"><span>Saved runs</span>{s.presets.slice(0, 8).map((p) => <button key={p.id} onClick={() => void replayAnalysis(p.id)} disabled={busy} className="rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-slate-700 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50">{p.brand.slice(0, 22)}{p.siteScore != null ? ` · ${p.siteScore}` : ''}</button>)}</div>
            )}

            {s.phase === 'confirm' && s.resolved && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-5 flex items-center gap-4 rounded-2xl border border-amber-200 bg-amber-50/60 px-5 py-4">
                <div className="min-w-0 flex-1"><div className="text-[13px] font-semibold uppercase tracking-[.1em] text-amber-700">Is this the one?</div><div className="mt-0.5 truncate text-[18px] font-semibold text-slate-900">{s.resolved.name} · {s.resolved.url.replace(/^https?:\/\//, '')}</div><div className="truncate text-[14px] text-slate-500">{s.resolved.verified ? `Page title: ${s.resolved.title}` : `The page title does not mention the name${s.resolved.title ? ` ("${s.resolved.title}")` : ''}: check before going on.`}</div></div>
                <button onClick={() => void confirmAnalyze()} className="h-12 rounded-xl bg-indigo-600 px-6 text-[16px] font-semibold text-white hover:bg-indigo-700">Yes, analyze</button>
              </motion.div>
            )}
            {s.phase === 'resolving' && <div className="mt-5 flex items-center gap-3 text-[16px] text-slate-500"><Loader2 size={20} className="animate-spin" />Looking up the official website…</div>}
            {s.phase === 'error' && <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-[16px] text-amber-900">{s.err}</div>}

            {(s.phase === 'running' || s.phase === 'done') && (
              <div className="mt-5">
                <div className="flex gap-3">{TOOLS.map((t, i) => <StepCard key={t.id} t={t} s={s.steps[t.id]} i={i} />)}</div>
                {s.replay && <div className="mt-2 text-[12.5px] text-slate-400">Replay of a saved run, same data as when it was measured.</div>}
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
