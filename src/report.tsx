import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { AlertTriangle, ArrowRight, Check, ChevronDown, Minus, Sparkles, X } from 'lucide-react'
import { Typed } from './Typed'
import type { Report } from './Analyze'

/* Answer templates: a score gauge, a three-axis radar, a fix plan in columns, expandable findings, a ranking, an evidence table.
   One typographic system: Fraunces for the big words and numbers, Inter for reading, mono for ids. */
export const tone = (v: number | null) => (v == null ? '#8b9096' : v >= 75 ? '#1a7f4b' : v >= 50 ? '#9a6700' : '#b42318')
export const grade = (v: number | null) => (v == null ? 'Not scored' : v >= 85 ? 'Excellent' : v >= 70 ? 'Good' : v >= 50 ? 'Needs work' : 'At risk')
const LAYER: Record<string, { name: string; color: string; hint: string }> = {
  reach: { name: 'Reachable', color: '#111112', hint: 'Can an AI crawler get in and read it?' },
  understand: { name: 'Understandable', color: '#111112', hint: 'Is the meaning clear and structured?' },
  trust: { name: 'Quotable', color: '#111112', hint: 'Would an assistant dare to quote it?' },
}
const SRC: Record<string, string> = { Scrapling: 'Site read', REA: 'Live page', 'Site audit': 'Readiness check' }

export function Eyebrow({ children, color = '#8b9096' }: { children: ReactNode; color?: string }) {
  return <div className="flex items-center gap-2.5 text-[12.5px] font-bold uppercase tracking-[.16em]" style={{ color }}><span className="h-px w-5" style={{ background: color }} />{children}</div>
}

function CountUp({ to, ms = 900 }: { to: number; ms?: number }) {
  const [v, setV] = useState(0)
  useEffect(() => { const t0 = performance.now(); let raf = 0; const f = (t: number) => { const p = Math.min(1, (t - t0) / ms); setV(Math.round(to * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(f) }; raf = requestAnimationFrame(f); return () => cancelAnimationFrame(raf) }, [to])
  return <>{v}</>
}

/** The big score ring. */
export function Gauge({ score, size = 176, label = true }: { score: number | null; size?: number; label?: boolean }) {
  const r = size / 2 - 12, c = tone(score)
  return (
    <div className="relative flex-none" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eceef0" strokeWidth={size > 120 ? 12 : 9} />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={c} strokeWidth={size > 120 ? 12 : 9} strokeLinecap="round" pathLength={1} initial={{ pathLength: 0 }} animate={{ pathLength: (score ?? 0) / 100 }} transition={{ duration: 1.1, ease: [0.2, 0.8, 0.2, 1] }} />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <div className="tnum font-semibold leading-none tracking-[-0.05em] text-ink" style={{ fontSize: size * 0.34 }}>{score == null ? '–' : <CountUp to={score} />}</div>
        {label && <div className="mt-1.5 text-[13px] font-semibold uppercase tracking-[.12em]" style={{ color: c }}>{grade(score)}</div>}
      </div>
    </div>
  )
}

/** Three scores as a triangle: the shape shows at a glance which side is weak. */
export function Radar({ layers }: { layers: Report['layers'] }) {
  const W = 290, S = 215, cx = W / 2, cy = S / 2 + 8, R = 66
  const ang = [-90, 30, 150].map((d) => (d * Math.PI) / 180)
  const pt = (i: number, f: number) => [cx + Math.cos(ang[i]) * R * f, cy + Math.sin(ang[i]) * R * f]
  const poly = (f: number[]) => f.map((v, i) => pt(i, v).join(',')).join(' ')
  const vals = layers.slice(0, 3).map((l) => (l.score ?? 0) / 100)
  if (layers.length < 3) return null
  return (
    <svg width={W} height={S} viewBox={`0 0 ${W} ${S}`} className="max-w-full flex-none">
      {[0.25, 0.5, 0.75, 1].map((f) => <polygon key={f} points={poly([f, f, f])} fill="none" stroke="#e6e8ea" strokeWidth="1" />)}
      {[0, 1, 2].map((i) => <line key={i} x1={cx} y1={cy} x2={pt(i, 1)[0]} y2={pt(i, 1)[1]} stroke="#e6e8ea" />)}
      <motion.polygon points={poly(vals)} fill="#11111214" stroke="#111112" strokeWidth="2.5" strokeLinejoin="round" initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} style={{ transformOrigin: `${cx}px ${cy}px` }} transition={{ type: 'spring', stiffness: 120, damping: 16, delay: 0.25 }} />
      {vals.map((v, i) => <circle key={i} cx={pt(i, v)[0]} cy={pt(i, v)[1]} r="5" fill={tone(layers[i].score)} stroke="#fff" strokeWidth="2" />)}
      {layers.slice(0, 3).map((l, i) => { const [x, y] = pt(i, 1.3); return <text key={l.id} x={x} y={y} textAnchor="middle" className="fill-mute" fontSize="13" fontWeight="600">{LAYER[l.id]?.name ?? l.name}</text> })}
    </svg>
  )
}

/** Severity of a finding, read from the audit checks it rests on. */
function severity(f: Report['findings'][number], r: Report): 0 | 1 | 2 {
  let s: 0 | 1 | 2 = 0
  for (const id of f.evidence) { const e = r.evidence.find((x) => x.id === id); if (!e) continue; if (/^FAIL/.test(e.detail)) s = 2; else if (/^WARN/.test(e.detail) && s < 1) s = 1 }
  return s
}
const SEV = [
  { name: 'Later', color: '#8b9096', bg: '#f7f8f9', ring: '#e6e8ea' },
  { name: 'Next', color: '#9a6700', bg: '#f7f8f9', ring: '#e6e8ea' },
  { name: 'Fix first', color: '#b42318', bg: '#f7f8f9', ring: '#e6e8ea' },
]

export function isBlocked(r: Report) {
  const words = Number(/;\s*(\d+) words/.exec(r.evidence.find((e) => e.id === 'S1')?.detail ?? '')?.[1] ?? 999)
  return r.blocked || r.tools?.scrape?.pages === 0 || r.evidence.some((e) => e.id === 'A:bot-reachability') || words < 40
}

export function ReportView({ r, extra }: { r: Report; extra?: ReactNode }) {
  const [open, setOpen] = useState(0), [ev, setEv] = useState(false)
  const byId = new Map(r.evidence.map((e) => [e.id, e]))
  const host = r.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '')
  // one order everywhere: the most serious first, numbered once, so "3" means the same finding in the plan and in the list
  const plan = r.findings.map((f, i) => ({ f, s: severity(f, r), o: i })).sort((a, b) => b.s - a.s || a.o - b.o).map((x, i) => ({ ...x, i }))
  const cols = [2, 1, 0].map((s) => ({ s, items: plan.filter((p) => p.s === s) })).filter((c) => c.items.length)
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="space-y-6">
      <section className="rounded-[22px] p-5" style={{ background: '#fff', boxShadow: 'inset 0 0 0 1px #e6e8ea' }}>
        <div className="flex flex-wrap items-center gap-x-7 gap-y-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2"><Gauge score={r.siteScore} size={158} /><Radar layers={r.layers} /></div>
          <div className="min-w-[300px] flex-1">
            <Eyebrow>Agent-readiness · {host}</Eyebrow>
            <h3 className="mt-2 text-[26px] font-semibold leading-[1.15] tracking-[-0.03em] text-ink"><Typed k={`h${r.id}`} text={r.headline || `${r.brand}: what stands in the way`} caret /></h3>
            <div className="mt-4 grid grid-cols-3 gap-2.5">
              {r.layers.map((l, i) => (
                <div key={l.id} className="rounded-2xl bg-surface px-3 py-2.5">
                  <div className="flex items-baseline justify-between"><span className="text-[13px] font-semibold text-mute">{LAYER[l.id]?.name ?? l.name}</span><span className="tnum text-[22px] font-semibold leading-none tracking-[-0.03em] text-ink">{l.score ?? '–'}</span></div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"><motion.div initial={{ width: 0 }} animate={{ width: `${l.score ?? 0}%` }} transition={{ delay: 0.3 + i * 0.12, duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }} className="h-full rounded-full bg-ink" /></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {extra}

      {cols.length > 0 && (
        <section>
          <Eyebrow>The fix plan</Eyebrow>
          <div className="mt-3 grid items-start gap-3" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
            {cols.map((c, ci) => (
              <motion.div key={c.s} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + ci * 0.1 }} className="rounded-[20px] p-3" style={{ background: SEV[c.s].bg, boxShadow: `inset 0 0 0 1px ${SEV[c.s].ring}` }}>
                <div className="mb-2 flex items-center gap-2 px-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: SEV[c.s].color }} /><span className="text-[16.5px] font-semibold tracking-[-0.01em] text-ink">{SEV[c.s].name}</span><span className="ml-auto text-[13px] font-semibold text-faint">{c.items.length}</span></div>
                <div className="space-y-2">
                  {c.items.map(({ f, i }) => (
                    <button key={i} onClick={() => setOpen(i)} className="block w-full rounded-2xl bg-white p-3 text-left ring-1 ring-line transition-colors hover:ring-faint">
                      <div className="flex items-start gap-2.5"><span className="mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full text-[12.5px] font-bold text-white" style={{ background: '#111112' }}>{i + 1}</span><span className="text-[15px] font-semibold leading-snug text-ink">{f.title}</span></div>
                      {f.fix && <div className="mt-1.5 flex gap-1.5 pl-[34px] text-[13.5px] leading-snug text-mute"><ArrowRight size={13} className="mt-[3px] flex-none text-accent" />{f.fix}</div>}
                    </button>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {r.findings.length > 0 && (
        <section>
          <Eyebrow>Why each one matters</Eyebrow>
          <div className="mt-3 divide-y divide-line overflow-hidden rounded-[20px] bg-white ring-1 ring-line">
            {plan.map(({ f, i }) => {
              const L = LAYER[f.layer], on = open === i
              return (
                <div key={i}>
                  <button onClick={() => setOpen(on ? -1 : i)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface">
                    <span className="grid h-7 w-7 flex-none place-items-center rounded-full text-[13px] font-bold text-white" style={{ background: '#111112' }}>{i + 1}</span>
                    <span className="min-w-0 flex-1"><span className="block text-[16px] font-semibold leading-snug text-ink">{f.title}</span><span className="text-[13px] font-medium text-faint">{L?.name ?? f.layer}</span></span>
                    <ChevronDown size={18} className={`flex-none text-faint transition-transform ${on ? 'rotate-180' : ''}`} />
                  </button>
                  {on && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="overflow-hidden px-4 pb-4">
                      <div className="ml-10 space-y-3">
                        {f.why && <p className="text-[15.5px] leading-relaxed text-mute">{f.why}</p>}
                        {f.fix && <div className="flex gap-3 rounded-2xl bg-surface px-4 py-3 text-[15px] leading-snug text-ink"><Check size={18} strokeWidth={3} className="mt-0.5 flex-none text-ok" /><span><b className="font-semibold">How to fix it · </b>{f.fix}</span></div>}
                        <div className="flex flex-wrap gap-1.5">{f.evidence.map((id) => { const e = byId.get(id); return <span key={id} title={e?.detail} className="rounded-full bg-surface px-2.5 py-0.5 font-mono text-[12px] font-semibold text-mute">{SRC[e?.source ?? ''] ?? e?.source ?? ''} · {id.replace('A:', '')}</span> })}</div>
                      </div>
                    </motion.div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}
      {!r.findings.length && <div className="rounded-2xl bg-surface p-4 text-[15.5px] text-mute">Nothing blocking was found in the evidence collected.</div>}

      {r.strengths.length > 0 && (
        <section>
          <Eyebrow>What is already working</Eyebrow>
          <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-2.5">{r.strengths.map((s) => <div key={s.title} className="flex gap-2.5 rounded-2xl bg-surface px-3.5 py-3 text-[14.5px] leading-snug text-ink"><Check size={17} strokeWidth={3} className="mt-0.5 flex-none text-ok" />{s.title}</div>)}</div>
        </section>
      )}

      <section>
        <button onClick={() => setEv((v) => !v)} className="flex items-center gap-2 text-[14px] font-semibold text-mute hover:text-ink"><Sparkles size={14} />{ev ? 'Hide' : 'Show'} the evidence · {r.evidence.length} pieces · {(r.ms / 1000).toFixed(0)} s<ChevronDown size={15} className={`transition-transform ${ev ? 'rotate-180' : ''}`} /></button>
        {ev && (
          <div className="mt-3 overflow-hidden rounded-2xl ring-1 ring-line">
            <table className="w-full text-left text-[13.5px]"><tbody>{r.evidence.map((e) => <tr key={e.id} className="border-b border-line last:border-0"><td className="w-[120px] whitespace-nowrap px-3 py-2 font-semibold text-ink">{SRC[e.source] ?? e.source}</td><td className="w-[170px] px-3 py-2 text-mute">{e.label}</td><td className="px-3 py-2 text-mute">{e.detail}{e.ref && <div className="mt-0.5 font-mono text-[11.5px] text-indigo-500">{e.ref.slice(0, 26)}…</div>}</td></tr>)}</tbody></table>
          </div>
        )}
      </section>
    </motion.div>
  )
}

/** One page read in a real browser (the agent's, or the visitor's own through the extension). */
export type PageReview = { score: number; summary: string; checks: { id: string; status: 'pass' | 'warn' | 'fail'; label: string; detail: string }[] }
export function PageReviewView({ review, title, url }: { review: PageReview; title?: string; url?: string }) {
  const icon = { pass: <Check size={15} strokeWidth={3.5} className="text-ok" />, warn: <Minus size={15} strokeWidth={3.5} className="text-warn" />, fail: <X size={15} strokeWidth={3.5} className="text-bad" /> }
  const n = { pass: 0, warn: 0, fail: 0 }; review.checks.forEach((c) => n[c.status]++)
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-[22px] p-4" style={{ background: '#fff', boxShadow: 'inset 0 0 0 1px #e6e8ea' }}>
      <div className="flex items-center gap-5"><Gauge score={review.score} size={120} label={false} />
        <div className="min-w-0 flex-1"><Eyebrow>Page review</Eyebrow>
          <div className="mt-1 truncate text-[22px] font-semibold tracking-[-0.03em] text-ink">{title || url}</div>
          <div className="mt-1 text-[14.5px] leading-snug text-mute">{review.summary}</div>
          <div className="mt-2 flex gap-2 text-[13px] font-semibold"><span className="rounded-full bg-surface px-2.5 py-0.5 text-ok">{n.pass} pass</span><span className="rounded-full bg-surface px-2.5 py-0.5 text-warn">{n.warn} warn</span><span className="rounded-full bg-surface px-2.5 py-0.5 text-bad">{n.fail} fail</span></div></div></div>
      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-x-5 gap-y-1.5">{review.checks.map((c) => <div key={c.id} className="flex items-start gap-2.5 py-1 text-[14.5px] leading-snug"><span className="mt-[3px] flex-none">{icon[c.status]}</span><span><b className="font-semibold text-ink">{c.label}</b> <span className="text-mute">{c.detail}</span></span></div>)}</div>
    </motion.div>
  )
}

/** A ranked answer: who an assistant names, in order, with the target brand lit. */
export function Ranking({ brands, target, ms }: { brands: string[]; target: string; ms?: number }) {
  const hit = brands.findIndex((b) => b.toLowerCase() === target.toLowerCase())
  return (
    <div className="rounded-[20px] bg-surface p-4">
      <div className="mb-2.5 flex items-center gap-2.5">
        <Eyebrow>{hit >= 0 ? `${target} is named #${hit + 1}` : `${target} is not named`}</Eyebrow>
        {ms != null && <span className="ml-auto text-[12.5px] font-semibold uppercase tracking-[.1em] text-faint">Real · gemini.google.com · {(ms / 1000).toFixed(1)} s</span>}
      </div>
      <div className="space-y-1.5">
        {brands.slice(0, 7).map((b, i) => (
          <motion.div key={b} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.07 }} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${i === hit ? 'bg-white ring-2 ring-ink' : 'bg-white ring-1 ring-line'}`}>
            <span className={`tnum w-7 text-[22px] font-semibold leading-none tracking-[-0.03em] ${i === hit ? 'text-ink' : 'text-faint'}`}>{i + 1}</span>
            <span className="flex-1 text-[16px] font-semibold text-ink">{b}</span>
            <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-surface sm:block"><motion.div initial={{ width: 0 }} animate={{ width: `${100 - i * 13}%` }} transition={{ delay: 0.2 + i * 0.07, duration: 0.6 }} className="h-full rounded-full" style={{ background: i === hit ? '#111112' : '#c4c8cc' }} /></div>
            {i === hit && <span className="rounded-full bg-ink px-2 py-0.5 text-[12px] font-bold text-white">YOU</span>}
          </motion.div>
        ))}
      </div>
      {hit < 0 && <div className="mt-2.5 flex items-center gap-2 text-[14px] font-medium text-bad"><AlertTriangle size={15} />Buyers asking this question are not shown {target}.</div>}
    </div>
  )
}
