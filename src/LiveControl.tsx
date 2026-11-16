import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, History, Play, Radio, RotateCcw, X } from 'lucide-react'
import { setLivePhase, type Phase } from './sim'
import { leaveLive, replayRun, setPhaseHook, startLive, useLive } from './live'

setPhaseHook((p) => setLivePhase(p as Phase | null))
const PRESETS: [string, string][] = [['Elmich', 'https://elmich.vn'], ['Lock&Lock', 'https://www.locknlock.vn'], ['Sunhouse', 'https://sunhouse.com.vn'], ['Zojirushi', 'https://www.zojirushi.com.vn']]
type Saved = { id: string; brand: string; total: number; mentioned: number; startedAt: number }

export default function LiveControl() {
  const [open, setOpen] = useState(false)
  const [brand, setBrand] = useState('Elmich')
  const [category, setCategory] = useState('hộp cơm giữ nhiệt')
  const [website, setWebsite] = useState('https://elmich.vn')
  const [quick, setQuick] = useState(true)
  const [total, setTotal] = useState(40)
  const [tabs, setTabs] = useState(4)
  const [headed, setHeaded] = useState(false)
  const [runs, setRuns] = useState<Saved[]>([])
  const [pick, setPick] = useState('')
  const [speed, setSpeed] = useState(8)
  const { mode, status, qs, total: lt, err } = useLive()
  const done = qs.filter((q) => q.stage === 'done' || q.stage === 'error').length

  useEffect(() => {
    if (!open) return
    fetch('/api/runs').then((r) => (r.ok ? r.json() : Promise.reject())).catch(() => fetch('/runs/index.json').then((r) => r.json())).then((l: Saved[]) => { setRuns(l); setPick((p) => p || l[0]?.id || '') }).catch(() => setRuns([]))
  }, [open])

  const go = () => { setOpen(false); startLive({ brand, category, website, total, tabs, headed, reuse: quick ? (runs.find((r) => r.total >= 40)?.id ?? '') : '' }) }
  const replay = () => { if (!pick) return; setOpen(false); replayRun(pick, speed, brand) }
  const live = mode !== 'script'

  return (
    <div className="relative">
      {!live ? (
        <button onClick={() => setOpen((o) => !o)} className="flex h-8 items-center gap-1.5 rounded-full bg-slate-900 px-3 text-[12.5px] font-semibold text-white hover:bg-slate-800"><Radio size={14} />Live audit</button>
      ) : (
        <div className="flex items-center gap-1">
          <span className="flex h-8 items-center gap-2 rounded-full bg-rose-50 px-3 text-[12.5px] font-semibold text-rose-600">
            {status === 'running' ? <span className="live-dot" style={{ ['--c' as any]: '#e11d48' }} /> : status === 'done' ? <Check size={14} strokeWidth={3} /> : <X size={14} />}
            {mode === 'replay' ? 'Replay' : 'Live'} · <span className="tnum">{done}/{lt}</span>
          </span>
          <button title="Back to the demo loop" onClick={leaveLive} className="grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100"><RotateCcw size={15} /></button>
        </div>
      )}
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="absolute right-0 top-11 z-40 w-[340px] rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_24px_60px_-20px_rgba(15,23,42,.35)]">
            <div className="text-[13px] font-semibold tracking-tight">Audit a brand live</div>
            <div className="text-[11.5px] text-slate-500">Real Gemini tabs ask real buyer questions.</div>
            <label className="mt-3 block text-[10.5px] font-semibold uppercase tracking-[.1em] text-slate-400">Brand</label>
            <input value={brand} onChange={(e) => setBrand(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-[13px] outline-none focus:border-indigo-400" />
            <div className="mt-2 flex flex-wrap gap-1.5">{PRESETS.map(([b, w]) => <button key={b} onClick={() => { setBrand(b); setWebsite(w) }} className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${brand === b ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{b}</button>)}</div>
            <label className="mt-3 block text-[10.5px] font-semibold uppercase tracking-[.1em] text-slate-400">Category</label>
            <input value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-[13px] outline-none focus:border-indigo-400" />
            <label className="mt-3 block text-[10.5px] font-semibold uppercase tracking-[.1em] text-slate-400">Website</label>
            <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-[13px] outline-none focus:border-indigo-400" />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div><label className="text-[10.5px] font-semibold uppercase tracking-[.1em] text-slate-400">Questions</label>
                <select value={total} onChange={(e) => setTotal(+e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[13px]">{[8, 12, 24, 40].map((n) => <option key={n}>{n}</option>)}</select></div>
              <div><label className="text-[10.5px] font-semibold uppercase tracking-[.1em] text-slate-400">Parallel tabs</label>
                <select value={tabs} onChange={(e) => setTabs(+e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[13px]">{[2, 3, 4, 6].map((n) => <option key={n}>{n}</option>)}</select></div>
            </div>
            <label className="mt-3 flex items-center gap-2 text-[12px] text-slate-600"><input type="checkbox" checked={quick} onChange={(e) => setQuick(e.target.checked)} />Reuse saved Gemini answers (fast rehearsal)</label>
            <label className="mt-3 flex items-center gap-2 text-[12px] text-slate-600"><input type="checkbox" checked={headed} onChange={(e) => setHeaded(e.target.checked)} />Show the real browser windows</label>
            <button onClick={go} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-[13.5px] font-semibold text-white hover:bg-indigo-700"><Play size={15} fill="#fff" />Run live audit</button>
            <div className="my-3 border-t border-slate-100" />
            <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[.1em] text-slate-400"><History size={12} />Replay a saved real run</div>
            <div className="mt-2 flex gap-2">
              <select value={pick} onChange={(e) => setPick(e.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-[12px]">{runs.length ? runs.map((r) => <option key={r.id} value={r.id}>{r.brand} · {r.mentioned}/{r.total} · {new Date(r.startedAt).toLocaleTimeString().slice(0, 5)}</option>) : <option value="">No saved runs</option>}</select>
              <select value={speed} onChange={(e) => setSpeed(+e.target.value)} className="h-9 w-[64px] rounded-lg border border-slate-200 bg-white px-1 text-[12px]">{[1, 4, 8, 16].map((n) => <option key={n} value={n}>{n}×</option>)}</select>
              <button onClick={replay} disabled={!pick} className="h-9 rounded-lg bg-slate-900 px-3 text-[12.5px] font-semibold text-white disabled:opacity-40">Replay</button>
            </div>
            <div className="mt-2 text-[11px] leading-snug text-slate-400">Replay re-scores the saved answers for the brand typed above.</div>
            {status === 'error' && <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">{err}</div>}
          </motion.div>
        )}
      </AnimatePresence>
      {status === 'error' && live && <div className="absolute right-0 top-10 z-40 w-[260px] rounded-lg bg-rose-50 px-3 py-2 text-[11.5px] text-rose-700 shadow">{err}</div>}
    </div>
  )
}
