import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { AnimatePresence, motion } from 'motion/react'
import { CalendarClock, Check, Inbox, Play, Plus, Trash2, X } from 'lucide-react'
import { attach } from './live'
import { useEdge } from './edge'

/* Workspace: what is waiting for a person (Inbox) and what runs by itself (Routines). All state lives on the backend. */
type Needs = { kind: 'approval'; runId: string; brand: string; docs: number; keys: string[]; approvalId: string; at: number }
type Result = { runId: string; at: number; why: string; status: string; mentioned?: number; total?: number; delta?: number | null; routineId: string; title: string; brand: string }
type Routine = { id: string; title: string; brand: string; mode: 'quick' | 'fresh'; schedule: any; summary: string; enabled: boolean; nextRunAt: number; runs: { runId: string; at: number; status: string; mentioned?: number; total?: number; delta?: number | null; why: string }[] }
type Inbox = { needs: Needs[]; results: Result[]; running: { id: string; brand: string } | null }

export const useWork = create<{ open: boolean; tab: 'inbox' | 'routines'; inbox: Inbox | null; routines: Routine[]; brands: string[] }>(() => ({ open: false, tab: 'inbox', inbox: null, routines: [], brands: [] }))
const get = (u: string) => fetch(u, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
const send = async (u: string, method: string, body?: any) => {
  const r = await fetch(u, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
  return j
}
export async function refreshWork() {
  const [inbox, rt] = await Promise.all([get('/api/inbox').catch(() => null), get('/api/routines').catch(() => null)])
  useWork.setState({ inbox, ...(rt ? { routines: rt.routines, brands: rt.brands } : {}) })
}
/** polls while the backend is on; faster while the panel is open */
export function useWorkPoll() {
  const online = useEdge((s) => s.online), open = useWork((s) => s.open)
  useEffect(() => {
    if (online === false) { useWork.setState({ inbox: null }); return }
    refreshWork(); const id = setInterval(refreshWork, open ? 4000 : 15000); return () => clearInterval(id)
  }, [online, open])
}
export const useNeeds = () => useWork((s) => (s.inbox ? s.inbox.needs.length + s.inbox.results.length : 0))

const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago` }
const when = (t: number) => { const d = new Date(t), today = new Date(); const day = d.toDateString() === today.toDateString() ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); return `${day} ${d.toTimeString().slice(0, 5)}` }
const Delta = ({ d }: { d?: number | null }) => d == null ? null : <span className={`rounded-full px-1.5 py-px text-[10.5px] font-bold ${d > 0 ? 'bg-emerald-100 text-emerald-700' : d < 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>{d > 0 ? `+${d}` : d === 0 ? 'no change' : d}</span>

function InboxTab() {
  const inbox = useWork((s) => s.inbox)
  const approve = async (n: Needs) => {
    await send(`/api/approve/${n.approvalId}`, 'POST', { decisions: Object.fromEntries(n.keys.map((k) => [k, 'approve'])) }).catch(() => {})
    refreshWork()
  }
  if (!inbox) return <div className="px-4 py-10 text-center text-[13px] text-slate-400">Backend is off.</div>
  const empty = !inbox.needs.length && !inbox.results.length
  return (
    <div className="space-y-2 px-3 py-3">
      {empty && <div className="px-2 py-10 text-center text-[13px] text-slate-400"><Check size={22} className="mx-auto mb-2 text-emerald-500" />Nothing is waiting for you.</div>}
      {inbox.needs.map((n) => (
        <div key={n.approvalId} className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.1em] text-amber-700"><span className="live-dot" style={{ ['--c' as any]: '#d97706' }} />Needs you · {ago(n.at)}</div>
          <div className="mt-1 text-[13.5px] font-semibold text-slate-800">{n.brand}: {n.docs} documents wait for the owner</div>
          <div className="mt-2 flex gap-2">
            <button onClick={() => attach(n.runId)} className="h-8 rounded-full border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700">Open the run</button>
            <button onClick={() => approve(n)} className="flex h-8 items-center gap-1 rounded-full bg-emerald-600 px-3 text-[12px] font-semibold text-white"><Check size={13} strokeWidth={3} />Approve all</button>
          </div>
        </div>
      ))}
      {inbox.results.map((r) => (
        <div key={r.runId} className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">{r.why === 'manual' ? 'Run now' : 'Scheduled'} · {ago(r.at)}<button onClick={() => send('/api/routines/seen', 'POST', { runId: r.runId }).then(refreshWork)} className="ml-auto rounded-full px-2 py-0.5 font-semibold text-slate-500 hover:bg-slate-100">Dismiss</button></div>
          <div className="mt-1 text-[13.5px] font-semibold text-slate-800">{r.title}</div>
          {r.status === 'done' ? <div className="mt-1 flex items-center gap-2 text-[13px] text-slate-600"><b className="tnum text-[18px] text-slate-900">{r.mentioned}<span className="text-slate-300">/{r.total}</span></b>answers name {r.brand}<Delta d={r.delta} /></div> : <div className="mt-1 text-[12.5px] text-rose-600">Run {r.status}.</div>}
        </div>
      ))}
    </div>
  )
}

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
function RoutinesTab() {
  const { routines, brands } = useWork()
  const [adding, setAdding] = useState(false)
  const [brand, setBrand] = useState('Elmich')
  const [mode, setMode] = useState<'quick' | 'fresh'>('quick')
  const [kind, setKind] = useState<'weekly' | 'daily' | 'interval'>('weekly')
  const [days, setDays] = useState<number[]>([1])
  const [at, setAt] = useState('09:00')
  const [minutes, setMinutes] = useState(60)
  const [err, setErr] = useState('')
  const create = async () => {
    setErr('')
    try { await send('/api/routines', 'POST', { brand, mode, schedule: kind === 'interval' ? { kind, minutes } : kind === 'daily' ? { kind, at } : { kind, days, at } }); setAdding(false); refreshWork() } catch (e: any) { setErr(e.message) }
  }
  return (
    <div className="space-y-2 px-3 py-3">
      {routines.map((r) => {
        const last = r.runs[0]
        return (
          <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1"><div className="truncate text-[13.5px] font-semibold text-slate-800">{r.title}</div><div className="text-[11.5px] text-slate-500">{r.summary} · {r.mode === 'fresh' ? 'real Gemini' : 'saved answers'}</div></div>
              <button title={r.enabled ? 'Pause' : 'Resume'} onClick={() => send(`/api/routines/${r.id}`, 'PATCH', { enabled: !r.enabled }).then(refreshWork)} className={`relative h-5 w-9 flex-none rounded-full transition-colors ${r.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${r.enabled ? 'left-[18px]' : 'left-0.5'}`} /></button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-slate-500">
              {r.enabled ? <>Next: <b className="whitespace-nowrap text-slate-700">{when(r.nextRunAt)}</b></> : 'Paused'}
              {last && <span className="flex items-center gap-1">· last {last.status === 'running' ? 'running…' : last.status === 'done' ? `${last.mentioned}/${last.total}` : last.status}<Delta d={last.delta} /></span>}
              <span className="ml-auto flex gap-1">
                <button onClick={() => send(`/api/routines/${r.id}/run`, 'POST').then(refreshWork).catch((e) => setErr(e.message))} title="Run now" className="grid h-7 w-7 place-items-center rounded-full text-slate-500 hover:bg-slate-100"><Play size={13} fill="currentColor" /></button>
                <button onClick={() => send(`/api/routines/${r.id}`, 'DELETE').then(refreshWork)} title="Delete" className="grid h-7 w-7 place-items-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={13} /></button>
              </span>
            </div>
          </div>
        )
      })}
      {!routines.length && !adding && <div className="px-2 py-8 text-center text-[13px] text-slate-400"><CalendarClock size={22} className="mx-auto mb-2" />No routines yet. A routine measures a brand again on a schedule.</div>}
      {err && <div className="rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] text-amber-900">{err}</div>}
      {adding ? (
        <div className="space-y-2.5 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-3">
          <div className="flex gap-2">
            <select value={brand} onChange={(e) => setBrand(e.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-[13px]">{(brands.length ? brands : ['Elmich']).map((b) => <option key={b}>{b}</option>)}</select>
            <select value={mode} onChange={(e) => setMode(e.target.value as any)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-[13px]"><option value="quick">Saved answers</option><option value="fresh">Real Gemini</option></select>
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 text-[12px] font-semibold">{(['weekly', 'daily', 'interval'] as const).map((k) => <button key={k} onClick={() => setKind(k)} className={`rounded-md py-1 ${kind === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{k === 'interval' ? 'Every X min' : k[0].toUpperCase() + k.slice(1)}</button>)}</div>
          {kind === 'weekly' && <div className="flex gap-1">{DAYS.map((d, i) => <button key={i} onClick={() => setDays((x) => (x.includes(i) ? x.filter((y) => y !== i) : [...x, i]))} className={`h-8 flex-1 rounded-full text-[12px] font-semibold ${days.includes(i) ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200'}`}>{d}</button>)}</div>}
          {kind !== 'interval' ? <input type="time" value={at} onChange={(e) => setAt(e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px]" /> : <label className="flex items-center gap-2 text-[12.5px] text-slate-600">Every<input type="number" min={5} max={1440} value={minutes} onChange={(e) => setMinutes(+e.target.value)} className="h-9 w-24 rounded-lg border border-slate-200 bg-white px-3 text-[13px]" />minutes (5 to 1,440)</label>}
          <div className="flex gap-2"><button onClick={create} className="h-9 flex-1 rounded-xl bg-indigo-600 text-[13px] font-semibold text-white hover:bg-indigo-700">Create routine</button><button onClick={() => setAdding(false)} className="h-9 rounded-xl px-3 text-[13px] font-semibold text-slate-500 hover:bg-slate-100">Cancel</button></div>
          <div className="text-[11px] leading-snug text-slate-400">Routines only measure again and report the change. Nothing is drafted or published without the owner.</div>
        </div>
      ) : <button onClick={() => setAdding(true)} className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 text-[13px] font-semibold text-slate-500 hover:border-indigo-300 hover:text-indigo-600"><Plus size={15} />New routine</button>}
    </div>
  )
}

export function Workspace() {
  const { open, tab, inbox } = useWork()
  const n = inbox ? inbox.needs.length + inbox.results.length : 0
  return (
    <AnimatePresence>
      {open && (
        <motion.aside initial={{ x: 400, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 400, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 32 }} className="absolute bottom-4 right-4 top-4 z-30 flex w-[380px] flex-col overflow-hidden rounded-[22px] border border-slate-200 bg-white/95 shadow-[0_40px_100px_-30px_rgba(15,23,42,.45)] backdrop-blur-xl">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3"><Inbox size={17} className="text-indigo-600" /><span className="text-[14.5px] font-semibold tracking-tight">Workspace</span><button onClick={() => useWork.setState({ open: false })} className="ml-auto grid h-7 w-7 place-items-center rounded-full text-slate-400 hover:bg-slate-100"><X size={15} /></button></div>
          <div className="mx-3 mt-3 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 text-[12.5px] font-semibold">
            {([['inbox', 'Inbox'], ['routines', 'Routines']] as const).map(([k, t]) => <button key={k} onClick={() => useWork.setState({ tab: k })} className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 ${tab === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{t}{k === 'inbox' && n > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">{n}</span>}</button>)}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{tab === 'inbox' ? <InboxTab /> : <RoutinesTab />}</div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

