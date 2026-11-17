import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { Check, Info } from 'lucide-react'

/* "What this replaces": the work a small brand usually pays an agency for, set against what the team did here.
   Picked's times are measured on this machine from saved runs; the agency hours and the hourly rate are assumptions you can change. */
type Measured = { xray: { n: number; medianMs: number | null }; audit: { n: number; medianMs: number | null; questions: number } }
type Task = { id: string; name: string; hours: number; monthly?: boolean; picked: string; ms?: (m: Measured) => number | null }

const TASKS: Task[] = [
  { id: 'audit', name: 'AI-readiness and technical audit', hours: 6, picked: 'Business X-ray', ms: (m) => m.xray.medianMs },
  { id: 'research', name: 'Buyer-question research: who the AI names, and why not you', hours: 8, picked: 'Audit run (asks Gemini)', ms: (m) => m.audit.medianMs },
  { id: 'rivals', name: 'Competitor and citation analysis', hours: 4, picked: 'Part of the same audit run' },
  { id: 'content', name: 'FAQ, about page and outreach pitch from verified facts', hours: 8, picked: 'Part of the same audit run, fact-checked' },
  { id: 'schema', name: 'Structured data, llms.txt, publishing', hours: 3, picked: 'Published after you approve' },
  { id: 'monthly', name: 'Monthly re-measurement and report', hours: 5, monthly: true, picked: 'Scheduled re-run', ms: (m) => m.audit.medianMs },
]
const HUMAN = { setup: 1.5, monthly: 0.5 } // the owner still reviews and approves: counted, not hidden
const fmtT = (ms: number | null | undefined) => (ms == null ? 'not measured yet' : ms < 90000 ? `${Math.round(ms / 1000)} s` : `${(ms / 60000).toFixed(1)} min`)
const usd = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`

export function CostCard() {
  const [m, setM] = useState<Measured | null>(null)
  const [rate, setRate] = useState(30), [hours, setHours] = useState<Record<string, number>>(() => Object.fromEntries(TASKS.map((t) => [t.id, t.hours])))
  useEffect(() => {
    fetch('/api/measured').then((r) => (r.ok ? r.json() : Promise.reject())).catch(() => fetch('/measured.json').then((r) => r.json())).then(setM).catch(() => setM({ xray: { n: 0, medianMs: null }, audit: { n: 0, medianMs: null, questions: 40 } }))
  }, [])
  const t = useMemo(() => {
    const setup = TASKS.filter((x) => !x.monthly).reduce((s, x) => s + (hours[x.id] || 0), 0), mon = TASKS.filter((x) => x.monthly).reduce((s, x) => s + (hours[x.id] || 0), 0)
    const agency = { first: (setup + mon) * rate, year: (setup + mon * 12) * rate }, picked = { first: (HUMAN.setup + HUMAN.monthly) * rate, year: (HUMAN.setup + HUMAN.monthly * 12) * rate }
    return { setup, mon, agency, picked, saveYear: agency.year - picked.year, pct: agency.year ? Math.round(((agency.year - picked.year) / agency.year) * 100) : 0 }
  }, [hours, rate])
  const max = Math.max(t.agency.year, 1)
  return (
    <div className="space-y-4">
      <div className="rounded-[22px] border border-line bg-white p-5">
        <div className="text-[12.5px] font-semibold uppercase tracking-[.16em] text-faint">One small brand · 12 months</div>
        <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-1"><span className="tnum text-[44px] font-semibold leading-none tracking-[-0.04em] text-ink">{usd(t.saveYear)}</span><span className="pb-1.5 text-[16px] text-mute">saved, about {t.pct}% less than the agency route</span></div>
        <div className="mt-4 space-y-2.5">
          {[['SEO/GEO agency', t.agency.year, '#111112', `${usd(t.agency.first)} in month 1, then ${usd(t.mon * rate)} a month`], ['Picked, with you approving', t.picked.year, '#0064d4', `${HUMAN.setup} h of your review at the start, ${HUMAN.monthly} h a month`]].map(([label, v, color, note]) => (
            <div key={label as string}>
              <div className="flex items-baseline justify-between text-[15px]"><span className="font-semibold text-ink">{label}</span><span className="tnum font-semibold text-ink">{usd(v as number)}</span></div>
              <div className="mt-1 h-3 overflow-hidden rounded-full bg-surface"><motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(1.5, ((v as number) / max) * 100)}%` }} transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }} className="h-full rounded-full" style={{ background: color as string }} /></div>
              <div className="mt-0.5 text-[13px] text-mute">{note}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-[22px] border border-line bg-white">
        <div className="grid grid-cols-[1fr_92px_190px] gap-3 border-b border-line px-4 py-2.5 text-[12.5px] font-semibold uppercase tracking-[.12em] text-faint"><span>The work</span><span className="text-right">Agency hours</span><span>Picked, measured</span></div>
        {TASKS.map((x, i) => (
          <motion.div key={x.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }} className="grid grid-cols-[1fr_92px_190px] items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
            <div><div className="text-[15px] font-medium leading-snug text-ink">{x.name}</div>{x.monthly && <div className="text-[13px] text-faint">every month</div>}</div>
            <input type="number" min={0} max={200} value={hours[x.id]} onChange={(e) => setHours({ ...hours, [x.id]: Math.max(0, Number(e.target.value) || 0) })} aria-label={`Agency hours for ${x.name}`} className="tnum h-9 w-full rounded-xl border border-line bg-white px-2 text-right text-[15px] text-ink outline-none focus:border-faint" />
            <div className="flex items-center gap-2 text-[14.5px] text-ink"><Check size={15} strokeWidth={3} className="flex-none text-ok" /><span><b className="font-semibold">{x.ms ? (m ? fmtT(x.ms(m)) : '…') : 'Included'}</b><span className="block text-[12.5px] leading-tight text-faint">{x.picked}</span></span></div>
          </motion.div>
        ))}
        <div className="flex items-center gap-3 border-t border-line bg-surface px-4 py-3 text-[15px]"><span className="font-semibold text-ink">Hourly rate</span><span className="text-mute">$</span><input type="number" min={1} max={500} value={rate} onChange={(e) => setRate(Math.max(1, Number(e.target.value) || 1))} aria-label="Hourly rate in US dollars" className="tnum h-9 w-24 rounded-xl border border-line bg-white px-2 text-right text-ink outline-none focus:border-faint" /><span className="text-mute">per hour, for both sides</span></div>
      </div>

      <div className="flex gap-3 rounded-[20px] bg-surface p-4 text-[14.5px] leading-snug text-mute">
        <Info size={18} className="mt-0.5 flex-none text-faint" />
        <div>
          <p><b className="font-semibold text-ink">What is measured:</b> Picked's times are medians of runs saved on this machine ({m ? `${m.xray.n} site X-rays, ${m.audit.n} full audits of ${m.audit.questions} questions` : '…'}). <b className="font-semibold text-ink">What is assumed:</b> the agency hours and the hourly rate; change them to match a quote you have received.</p>
          <p className="mt-1.5"><b className="font-semibold text-ink">What still needs a person:</b> you approve what gets published, and link-building, PR and brand strategy are not in this comparison.</p>
        </div>
      </div>
    </div>
  )
}
