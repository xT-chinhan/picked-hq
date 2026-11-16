import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, ChevronDown, History, Play, Radio, Square, X, Zap } from 'lucide-react'
import { LIVE_ORDER, phaseOf, setLivePhase, useSim, type Phase } from './sim'
import { replayRun, setPhaseHook, startLive, stopLive, useLive } from './live'
import { useEdge } from './edge'

setPhaseHook((p) => setLivePhase(p as Phase | null))
type Brand = { name: string; website: string; note: string; logo?: string; runs?: number }
const FALLBACK: Brand[] = [
  { name: 'Elmich', website: 'https://elmich.vn', note: 'Pitch brand', logo: '/brands/elmich.png' }, { name: 'Lock&Lock', website: 'https://www.locknlock.vn', note: 'Market leader', logo: '/brands/locknlock.png' },
  { name: 'Sunhouse', website: 'https://sunhouse.com.vn', note: 'Local rival', logo: '/brands/sunhouse.png' }, { name: 'Zojirushi', website: 'https://www.zojirushi.com.vn', note: 'Premium import', logo: '/brands/zojirushi.png' },
]
type Saved = { id: string; brand: string; total: number; mentioned: number; startedAt: number }
const NAME: Record<Phase, string> = { intake: 'Shop', mining: 'Signals', research: 'Research', analysis: 'Analysis', content: 'Content', citations: 'Citations', sync: 'Channel Sync', qa: 'QA', risk: 'Risk Gate', approve: 'Approve', publish: 'Publish', track: 'Track', impact: 'Impact' }

/** Running state in the top bar: where the run is, a one-tap approve while the owner decision is pending, and stop. */
function RunPill() {
  const { mode, status, qs, total, approval, err } = useLive()
  const phase = useSim((s) => phaseOf(s.t))
  const done = qs.filter((q) => q.stage === 'done' || q.stage === 'error').length
  const step = Math.max(0, LIVE_ORDER.indexOf(phase)), pct = status === 'done' ? 100 : Math.round(((step + (phase === 'research' && total ? done / total : 0)) / (LIVE_ORDER.length - 1)) * 100)
  const waiting = mode === 'live' && approval?.status === 'pending'
  const approve = () => fetch(`/api/approve/${approval.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decisions: Object.fromEntries(approval.docs.map((d: any) => [d.key, 'approve'])) }) })
  return (
    <div className="flex items-center gap-1.5">
      <div className="relative flex h-8 items-center gap-2 overflow-hidden rounded-full bg-slate-100 pl-3 pr-3.5 text-[12.5px] font-semibold text-slate-700">
        <span className="absolute inset-y-0 left-0 bg-indigo-100/80 transition-[width] duration-700" style={{ width: `${pct}%` }} />
        <span className="relative flex items-center gap-2">
          {status === 'running' ? <span className="live-dot" style={{ ['--c' as any]: mode === 'replay' ? '#6366f1' : '#e11d48' }} /> : status === 'done' ? <Check size={14} strokeWidth={3} className="text-emerald-600" /> : <X size={14} className="text-rose-500" />}
          {status === 'error' ? 'Stopped' : status === 'done' ? 'Done' : mode === 'replay' ? 'Replay' : NAME[phase]}
          {phase === 'research' && status === 'running' && <span className="tnum font-medium text-slate-500">{done}/{total}</span>}
        </span>
      </div>
      {waiting && <button onClick={approve} className="flex h-8 items-center gap-1.5 rounded-full bg-emerald-600 px-3 text-[12.5px] font-semibold text-white shadow-[0_8px_20px_-10px_rgba(5,150,105,.8)] hover:bg-emerald-700"><Check size={14} strokeWidth={3} />Approve</button>}
      <button title="Stop and go back to the demo loop" onClick={stopLive} className="grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100">{status === 'running' ? <Square size={13} fill="currentColor" /> : <X size={16} />}</button>
      {status === 'error' && err && <div className="absolute right-0 top-10 z-40 w-[280px] rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] text-amber-900 shadow">{err}</div>}
    </div>
  )
}

export default function LiveControl() {
  const [open, setOpen] = useState(false)
  const [brands, setBrands] = useState<Brand[]>(FALLBACK)
  const [category, setCategory] = useState('hộp cơm giữ nhiệt')
  const [brand, setBrand] = useState('Elmich')
  const [mode, setMode] = useState<'quick' | 'fresh'>('quick')
  const [more, setMore] = useState(false)
  const [website, setWebsite] = useState('')
  const [runs, setRuns] = useState<Saved[]>([])
  const [pick, setPick] = useState('')
  const [speed, setSpeed] = useState(8)
  const [busy, setBusy] = useState(false)
  const { mode: lm, status, err } = useLive()
  const online = useEdge((s) => s.online)
  const live = lm !== 'script'

  useEffect(() => {
    if (!open) return
    fetch('/api/brands', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject())).then((j) => { setBrands(j.brands); setCategory(j.category) }).catch(() => {})
    fetch('/api/runs').then((r) => (r.ok ? r.json() : Promise.reject())).catch(() => fetch('/runs/index.json').then((r) => r.json())).then((l: Saved[]) => { setRuns(l); setPick((p) => p || l.find((x) => x.total >= 40)?.id || l[0]?.id || '') }).catch(() => setRuns([]))
  }, [open])
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [open])

  const known = brands.find((b) => b.name.toLowerCase() === brand.trim().toLowerCase())
  const offline = online === false
  const run = async () => {
    if (!brand.trim() || busy) return
    setBusy(true)
    const ok = await startLive({ brand: brand.trim(), category, website: website.trim() || undefined, mode, replace: true })
    setBusy(false)
    if (ok) setOpen(false)
  }
  const replay = () => { if (pick) { setOpen(false); replayRun(pick, speed, brand.trim() || undefined) } }

  if (live) return <RunPill />
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex h-8 items-center gap-1.5 rounded-full bg-slate-900 px-3.5 text-[12.5px] font-semibold text-white hover:bg-slate-800"><Radio size={14} />Audit a brand</button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }} className="absolute right-0 top-11 z-40 w-[360px] rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_24px_60px_-20px_rgba(15,23,42,.35)]">
            <div className="text-[14px] font-semibold tracking-tight">Audit a brand</div>
            <div className="text-[12px] text-slate-500">Which brand does Gemini recommend, and why not yours?</div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {brands.map((b) => (
                <button key={b.name} onClick={() => { setBrand(b.name); setWebsite('') }} className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors ${brand === b.name ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <span className="grid h-10 w-10 flex-none place-items-center overflow-hidden rounded-[10px] border border-slate-100 bg-white">{b.logo ? <img src={b.logo} alt="" className="h-8 w-8 object-contain" /> : <span className="text-[15px] font-bold text-slate-400">{b.name[0]}</span>}</span>
                  <span className="min-w-0"><span className="block truncate text-[14px] font-semibold text-slate-800">{b.name}</span><span className="block truncate text-[11.5px] text-slate-500">{b.note}</span></span>
                </button>
              ))}
            </div>
            <input value={known ? '' : brand} onChange={(e) => setBrand(e.target.value)} placeholder="…or type another brand" className="mt-2 h-9 w-full rounded-lg border border-slate-200 px-3 text-[13px] outline-none focus:border-indigo-400" />

            <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 text-[12.5px] font-semibold">
              {([['quick', 'Quick', '~1 min · saved answers'], ['fresh', 'Fresh', '~4 min · real Gemini']] as const).map(([k, t, d]) => (
                <button key={k} onClick={() => setMode(k)} className={`rounded-lg px-2 py-1.5 text-left leading-tight transition-colors ${mode === k ? 'bg-white text-slate-900 shadow-[0_1px_3px_rgba(15,23,42,.12)]' : 'text-slate-500'}`}>
                  <span className="flex items-center gap-1">{k === 'quick' ? <Zap size={13} /> : <Radio size={13} />}{t}</span><span className="block text-[10.5px] font-medium text-slate-400">{d}</span>
                </button>
              ))}
            </div>

            <button onClick={run} disabled={offline || busy || !brand.trim()} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-[14px] font-semibold text-white transition-colors hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400">
              <Play size={15} fill="currentColor" />{busy ? 'Starting…' : offline ? 'Backend is off' : `Run for ${brand.trim() || '…'}`}
            </button>
            {offline && <div className="mt-2 text-[11.5px] text-amber-800">NaN-Team đang tạm khóa để phát triển dự án. You can still replay a saved run below.</div>}
            {status === 'error' && !offline && err && <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] text-amber-900">{err}</div>}

            <button onClick={() => setMore((m) => !m)} className="mt-3 flex w-full items-center gap-1.5 text-[11.5px] font-semibold text-slate-400 hover:text-slate-600"><ChevronDown size={13} className={`transition-transform ${more ? 'rotate-180' : ''}`} />More options</button>
            {more && (
              <div className="mt-2 space-y-2">
                <div><label className="text-[10.5px] font-semibold uppercase tracking-[.1em] text-slate-400">Category</label><input value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-[13px] outline-none focus:border-indigo-400" /></div>
                <div><label className="text-[10.5px] font-semibold uppercase tracking-[.1em] text-slate-400">Website {known && <span className="normal-case tracking-normal text-slate-400">· default {known.website.replace('https://', '')}</span>}</label><input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-[13px] outline-none focus:border-indigo-400" /></div>
                <div className="flex items-center gap-2 border-t border-slate-100 pt-2 text-[10.5px] font-semibold uppercase tracking-[.1em] text-slate-400"><History size={12} />Replay only (no pipeline)</div>
                <div className="flex gap-2">
                  <select value={pick} onChange={(e) => setPick(e.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-[12px]">{runs.length ? runs.map((r) => <option key={r.id} value={r.id}>{r.brand} · {r.mentioned}/{r.total} · {new Date(r.startedAt).toLocaleDateString()}</option>) : <option value="">No saved runs</option>}</select>
                  <select value={speed} onChange={(e) => setSpeed(+e.target.value)} className="h-9 w-[62px] rounded-lg border border-slate-200 bg-white px-1 text-[12px]">{[1, 4, 8, 16].map((n) => <option key={n} value={n}>{n}×</option>)}</select>
                  <button onClick={replay} disabled={!pick} className="h-9 rounded-lg bg-slate-900 px-3 text-[12.5px] font-semibold text-white disabled:opacity-40">Replay</button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
