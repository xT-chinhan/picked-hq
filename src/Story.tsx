import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { AnimatePresence, motion } from 'motion/react'
import { Check, Sparkles, X } from 'lucide-react'
import openai from '@lobehub/icons-static-svg/icons/openai.svg'
import gemini from '@lobehub/icons-static-svg/icons/gemini-color.svg'
import { usePhase } from './sim'
import { useLive } from './live'

/* The story sheets (positioning, business case, what is next) and the council scene. Everything here is presentation: no backend needed. */
export const useStory = create<{ open: boolean; slide: number }>(() => ({ open: false, slide: 0 }))
export const SLIDES = 3

/* ───────────── 1 · positioning matrix ───────────── */
type Dot = { n: string; sub: string; x: number; y: number; c: string; hero?: boolean }
const DOTS: Dot[] = [
  { n: 'Enterprise GEO dashboards', sub: 'measure, then hand you a report', x: 22, y: 20, c: '#94a3b8' },
  { n: 'RoMes', sub: 'general agent workspace', x: 70, y: 76, c: '#0ea5e9' },
  { n: 'Muse', sub: 'general browser agent', x: 56, y: 84, c: '#f97316' },
  { n: 'Picked', sub: 'measures, fixes, ships with the owner', x: 82, y: 18, c: '#4f46e5', hero: true },
]
function Matrix() {
  return (
    <div className="relative h-[330px] rounded-2xl border border-slate-200 bg-slate-50/60">
      <div className="absolute inset-x-0 top-1/2 h-px bg-slate-200" /><div className="absolute inset-y-0 left-1/2 w-px bg-slate-200" />
      <span className="absolute left-3 top-2 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-400">Built for AI recommendation (GEO)</span>
      <span className="absolute bottom-2 left-3 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-400">General purpose</span>
      <span className="absolute bottom-2 right-3 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-400">Acts for you →</span>
      <span className="absolute left-3 top-1/2 -mt-5 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-400">← Reports only</span>
      {DOTS.map((d, i) => (
        <motion.div key={d.n} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.25 + i * 0.22, type: 'spring', stiffness: 260, damping: 20 }} className="absolute -translate-x-1/2 -translate-y-1/2 text-center" style={{ left: `${d.x}%`, top: `${d.y}%` }}>
          <div className={`mx-auto grid place-items-center rounded-full text-white ${d.hero ? 'h-14 w-14 shadow-[0_14px_36px_-10px_rgba(79,70,229,.8)]' : 'h-9 w-9'}`} style={{ background: d.c }}>{d.hero ? <Check size={26} strokeWidth={3.2} /> : <span className="h-2 w-2 rounded-full bg-white/80" />}</div>
          <div className={`mt-1.5 whitespace-nowrap font-semibold ${d.hero ? 'text-[14px] text-indigo-700' : 'text-[12px] text-slate-700'}`}>{d.n}</div>
          <div className="whitespace-nowrap text-[10.5px] text-slate-500">{d.sub}</div>
        </motion.div>
      ))}
    </div>
  )
}
const LEARNED: [string, string][] = [['RoMes', 'Agents with a soul and a queue of what needs a person'], ['Muse', 'Hand control back to the human at the hard moment'], ['GEO dashboards', 'Measure first, in numbers a shop owner understands']]

/* ───────────── 2 · business case ───────────── */
function Bar({ label, v, max, c, text, delay }: { label: string; v: number; max: number; c: string; text: string; delay: number }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[12.5px]"><span className="font-medium text-slate-600">{label}</span><b className="tnum text-slate-900">{text}</b></div>
      <div className="h-6 overflow-hidden rounded-full bg-slate-100"><motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(3, (v / max) * 100)}%` }} transition={{ delay, duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }} className="h-full rounded-full" style={{ background: c }} /></div>
    </div>
  )
}

/* ───────────── 3 · what is next ───────────── */
const NEXT: { t: string; d: string; tag: string }[] = [
  { t: 'Deep page analysis', d: 'Any competitor page read like an engineer would: structure, data, network, with every finding cited.', tag: 'REA' },
  { t: 'Rival intelligence', d: 'Pixels, sitemaps, llms.txt, AI-crawler stance and positioning history, re-checked every week.', tag: 'Marketing teardown' },
  { t: 'Whole-site facts', d: 'Crawl a shop site politely (robots.txt first) into clean text, so every claim has a source.', tag: 'Scraping' },
  { t: 'Report notebook', d: 'Every audit as a notebook with charts, opened in Colab or kept in Drive.', tag: 'Data science' },
  { t: 'NaN in your browser', d: 'A side panel beside any page: ask, review for AI readability, hand back control.', tag: 'Chrome extension' },
  { t: 'Picked as a tool', d: 'Other agents call audit and approve through MCP, so it fits inside any workflow.', tag: 'MCP' },
]

export function Story() {
  const { open, slide } = useStory()
  const titles = ['Where Picked sits', 'The business case', 'What comes next']
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => useStory.setState({ open: false })} className="absolute inset-0 z-40 grid place-items-center bg-slate-900/25">
          <motion.div key="sheet" initial={{ y: 28, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 28 }} onClick={(e) => e.stopPropagation()} className="w-[940px] max-w-[94%] rounded-[28px] border border-slate-200 bg-white p-7 shadow-[0_50px_120px_-30px_rgba(15,23,42,.5)]">
            <div className="flex items-center gap-2"><Sparkles size={17} className="text-indigo-600" /><span className="text-[19px] font-semibold tracking-tight">{titles[slide]}</span>
              <div className="ml-auto flex items-center gap-1.5">{Array.from({ length: SLIDES }).map((_, i) => <button key={i} onClick={() => useStory.setState({ slide: i })} className={`h-2 rounded-full transition-all ${i === slide ? 'w-7 bg-indigo-600' : 'w-2 bg-slate-300'}`} />)}</div>
              <button onClick={() => useStory.setState({ open: false })} className="ml-3 grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-slate-100"><X size={16} /></button></div>
            <AnimatePresence mode="wait">
              <motion.div key={slide} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.28 }} className="mt-5 min-h-[420px]">
                {slide === 0 && (
                  <div className="grid grid-cols-[1.35fr_1fr] gap-6">
                    <Matrix />
                    <div className="flex flex-col justify-center">
                      <div className="text-[13px] leading-snug text-slate-600">We studied two general agent products from the inside. They show what works. None of them knows whether an AI assistant recommends a shop, and none stops a false claim before the owner sees it.</div>
                      <div className="mt-4 space-y-2.5">{LEARNED.map(([a, b], i) => <motion.div key={a} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 + i * 0.15 }} className="rounded-xl bg-slate-50 px-3.5 py-2.5"><div className="text-[11px] font-semibold uppercase tracking-[.12em] text-indigo-600">Learned from {a}</div><div className="text-[12.5px] text-slate-700">{b}</div></motion.div>)}</div>
                    </div>
                  </div>
                )}
                {slide === 1 && (
                  <div className="grid grid-cols-[1.2fr_1fr] gap-8">
                    <div className="space-y-5 pt-2">
                      <Bar label="Marketing agency, per month" v={15} max={15} c="#94a3b8" text="15,000k ₫" delay={0.2} />
                      <Bar label="Picked, per month (target)" v={0.99} max={15} c="#4f46e5" text="under 1,000k ₫" delay={0.5} />
                      <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.2, type: 'spring', stiffness: 240, damping: 18 }} className="inline-flex items-baseline gap-2 rounded-2xl bg-emerald-50 px-4 py-2"><span className="text-[34px] font-semibold leading-none tracking-tight text-emerald-600">−93%</span><span className="text-[12.5px] text-emerald-800">cost for the same job</span></motion.div>
                      <div className="text-[11.5px] text-slate-400">Targets from the pilot plan, not measured results yet.</div>
                    </div>
                    <div className="space-y-2.5">
                      {[['Who pays', 'The shop owner, monthly'], ['Who approves', 'The shop owner, on a phone'], ['Pilot', '3 months, 10 shops, one department'], ['The proof', 'Share of answers that name the shop, before and after']].map(([k, v], i) => <motion.div key={k} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.15 }} className="rounded-xl border border-slate-200 px-4 py-3"><div className="text-[10.5px] font-semibold uppercase tracking-[.12em] text-slate-400">{k}</div><div className="text-[13.5px] font-medium text-slate-800">{v}</div></motion.div>)}
                    </div>
                  </div>
                )}
                {slide === 2 && (
                  <div className="grid grid-cols-3 gap-3.5">
                    {NEXT.map((n, i) => <motion.div key={n.t} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.09 }} className="rounded-2xl border border-slate-200 p-4"><span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.1em] text-indigo-600">{n.tag}</span><div className="mt-2.5 text-[14.5px] font-semibold tracking-tight text-slate-900">{n.t}</div><div className="mt-1 text-[12.5px] leading-snug text-slate-500">{n.d}</div><div className="mt-3 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-400">Next</div></motion.div>)}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400"><span>← → change slide · V close</span><span>Illustrative where marked · AI for Business Innovation 2026</span></div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ───────────── council scene: three models of different families vote on each sentence ───────────── */
const SIM_SENTENCES = [
  { s: 'Made of 304 stainless steel.', v: [1, 1, 1] }, { s: 'Keeps food hot for up to 6 hours.', v: [1, 1, 1] },
  { s: 'Same-day delivery in District 7.', v: [1, 0, 1] }, { s: 'The best lunch box in Vietnam.', v: [0, 0, 0] },
]
const LABEL: Record<string, [string, string]> = { 'flash-low': ['Gemini 3.8', gemini], 'hydrogen-med': ['Gemini 4', gemini], astra: ['GPT-6 Astra', openai], sol: ['GPT-6.1 Sol', openai] }
const lab = (id: string): [string, string] => LABEL[id] ?? [id, gemini]
export function Council() {
  const phase = usePhase(), mode = useLive((s) => s.mode), c = useLive((s) => s.council), risk = useLive((s) => s.risk)
  const show = phase === 'qa' || phase === 'risk'
  const [tick, setTick] = useState(0)
  useEffect(() => { if (show) setTick((x) => x + 1) }, [show])
  const live = mode !== 'script' && !!c
  const engines: string[] = live ? c.engines.map((e: any) => e.engine) : ['flash-low', 'hydrogen-med', 'astra']
  const text: Record<string, string> = Object.fromEntries((risk?.items ?? []).map((i: any) => [i.id, i.sentence]))
  const rows: { s: string; v: number[] }[] = live
    ? Object.entries(c.votes as Record<string, { engine: string; supported: boolean }[]>).slice(0, 5).map(([id, vs]) => ({ s: text[id] ?? id, v: engines.map((e) => (vs.find((x) => x.engine === e)?.supported ? 1 : 0)) }))
    : SIM_SENTENCES
  return (
    <AnimatePresence>
      {show && (
        <motion.div key={tick} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ type: 'spring', stiffness: 260, damping: 28 }} className="pointer-events-none absolute right-5 top-5 z-20 w-[360px] rounded-[20px] border border-slate-200 bg-white p-4 shadow-[0_30px_70px_-30px_rgba(15,23,42,.45)]">
          <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[.14em] text-slate-400"><span className="live-dot" />Fact-check council<span className={`ml-auto rounded-full px-2 py-px ${live ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>{live ? 'Real' : 'Simulated'}</span></div>
          <div className="mt-2.5 flex gap-2">{engines.map((e, i) => <motion.div key={e} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.12 }} className="flex flex-1 items-center gap-1.5 rounded-xl bg-slate-50 px-2 py-1.5"><img src={lab(e)[1]} alt="" className="h-4 w-4" /><span className="truncate text-[11px] font-semibold text-slate-700">{lab(e)[0]}</span></motion.div>)}</div>
          <div className="mt-3 space-y-2">
            {rows.map((r, k) => {
              const yes = r.v.filter(Boolean).length, ok = yes * 2 > r.v.length, base = 0.7 + k * 0.85
              return (
                <div key={k} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1 truncate text-[12px] text-slate-700">{r.s}</div>
                  <div className="flex gap-1">{r.v.map((v, j) => <motion.span key={j} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: base + j * 0.22, type: 'spring', stiffness: 420, damping: 18 }} className="grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: v ? '#16a34a' : '#e11d48' }}>{v ? '✓' : '✗'}</motion.span>)}</div>
                  <motion.span initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: base + r.v.length * 0.22 + 0.1, type: 'spring', stiffness: 320, damping: 16 }} className={`w-[74px] rounded-full px-2 py-0.5 text-center text-[10px] font-bold uppercase tracking-[.06em] ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{ok ? (yes === r.v.length ? 'Unanimous' : 'Majority') : 'Blocked'}</motion.span>
                </div>
              )
            })}
          </div>
          <div className="mt-3 text-[10.5px] leading-snug text-slate-400">Three models from different families judge every sentence against the sourced facts. The majority decides; a tie blocks.</div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
