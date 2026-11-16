import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { AnimatePresence, motion } from 'motion/react'
import { Check } from 'lucide-react'
import { Avatar, BENCH, COUNCIL, PEOPLE, tint, useTints, type Person } from './avatars'
import { useLive } from './live'

/* The office: the whole company standing by. Click anyone to call them; "Call everyone" wakes the team in turn. */
export const useOffice = create<{ open: boolean }>(() => ({ open: !/[?&](t|nowake|nocam)\b/.test(location.search) }))

const LEAD = ['nan', 'lia', 'mina', 'ana', 'sy', 'mira', 'theo', 'quinn', 'rhea', 'pax', 'tara', 'owner']
const BY = (id: string) => PEOPLE.find((p) => p.id === id)!
const SCOUTS = PEOPLE.filter((p) => p.id.startsWith('scout'))

function Slot({ p, size, i, called, say, edge, onCall, label = true }: { p: Person; size: number; i: number; called: boolean; say: boolean; edge?: 'l' | 'r'; onCall: (p: Person) => void; label?: boolean }) {
  return (
    <motion.button initial={{ opacity: 0, y: 26, scale: 0.7 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.15 + i * 0.07, type: 'spring', stiffness: 260, damping: 16 }} onClick={() => onCall(p)} className="group relative flex flex-col items-center outline-none" title={`${p.name}: ${p.role}`}>
      <AnimatePresence>
        {called && say && (
          <motion.div key="say" initial={{ opacity: 0, y: 8, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4 }} className={`absolute bottom-full z-10 mb-1 w-max max-w-[210px] rounded-2xl ${edge === 'l' ? 'left-0' : edge === 'r' ? 'right-0' : ''} bg-slate-900 px-3 py-1.5 text-center text-[14px] font-medium leading-snug text-white shadow-[0_14px_30px_-12px_rgba(15,23,42,.6)]`}>
            {p.line}<span className={`absolute top-full -mt-1 h-2.5 w-2.5 rotate-45 bg-slate-900 ${edge === 'l' ? 'left-8' : edge === 'r' ? 'right-8' : 'left-1/2 -translate-x-1/2'}`} />
          </motion.div>
        )}
      </AnimatePresence>
      <span className="transition-transform duration-200 group-hover:-translate-y-1.5"><Avatar av={p.av} size={size} state={called ? 'called' : 'idle'} delay={(i * 0.37) % 3} color={p.color} /></span>
      {label && <span className="mt-1.5 text-[16px] font-semibold leading-none tracking-tight text-slate-900">{p.name}</span>}
      {label && <span className="mt-1 text-[13px] leading-none text-slate-500">{p.role}</span>}
    </motion.button>
  )
}

export function Office() {
  const open = useOffice((s) => s.open), mode = useLive((s) => s.mode)
  const [called, setCalled] = useState<Record<string, { t: number; say: boolean }>>({})
  const timers = useRef<number[]>([])
  useTints()
  useEffect(() => { if (mode !== 'script') useOffice.setState({ open: false }) }, [mode])
  const call = (p: Person, hold = 2600, say = true) => {
    const t = Date.now()
    setCalled((c) => ({ ...c, [p.id]: { t, say } }))
    timers.current.push(window.setTimeout(() => setCalled((c) => { const n = { ...c }; if (n[p.id]?.t === t) delete n[p.id]; return n }), hold))
  }
  // everyone at once: a hop and a glow in a wave, no speech bubbles (they would overlap)
  const callAll = () => [...LEAD.map(BY), ...SCOUTS, ...COUNCIL].forEach((p, i) => timers.current.push(window.setTimeout(() => call(p, 1700, false), i * 110)))
  useEffect(() => {
    if (!open) return
    const first = window.setTimeout(() => call(BY('nan'), 2800), 1500)
    const key = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); useOffice.setState({ open: false }) } }
    window.addEventListener('keydown', key)
    return () => { clearTimeout(first); timers.current.forEach(clearTimeout); timers.current = []; window.removeEventListener('keydown', key) }
  }, [open])
  return (
    <AnimatePresence>
      {open && (
        <motion.div key="office" initial={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.03, filter: 'blur(10px)' }} transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }} className="absolute inset-0 z-50 flex flex-col bg-[radial-gradient(ellipse_at_50%_0%,#eef0ff,#ffffff_55%)]">
          <div className="flex items-center gap-3 px-10 pt-7">
            <div className="grid h-11 w-11 place-items-center rounded-[14px] bg-gradient-to-br from-indigo-500 to-violet-600 text-white"><Check size={24} strokeWidth={3.2} /></div>
            <div><div className="text-[26px] font-semibold leading-none tracking-tight text-slate-900">Picked</div><div className="mt-1 text-[15px] text-slate-500">A company of AI agents. All standing by.</div></div>
            <div className="ml-auto flex items-center gap-2.5 text-[15px] text-slate-500"><span className="live-dot" /><b className="text-slate-900">{PEOPLE.length + COUNCIL.length + BENCH.length}</b> agents<span className="mx-1 text-slate-300">·</span><b className="text-slate-900">14</b> AI models</div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-7 px-8">
            <div className="flex items-end justify-center gap-5">{LEAD.map((id, i) => <Slot key={id} p={BY(id)} size={142} i={i} called={!!called[id]} say={!!called[id]?.say} edge={i === 0 ? 'l' : i === LEAD.length - 1 ? 'r' : undefined} onCall={(p) => call(p)} />)}</div>
            <div className="flex items-end justify-center gap-14">
              <div className="flex flex-col items-center"><div className="flex items-end gap-3">{SCOUTS.map((p, i) => <Slot key={p.id} p={p} size={104} i={i + 12} called={!!called[p.id]} say={!!called[p.id]?.say} onCall={(x) => call(x)} label={false} />)}</div><div className="mt-2 text-[15px] font-semibold text-slate-700">Scouts <span className="font-normal text-slate-400">· one Gemini tab each</span></div></div>
              <div className="flex flex-col items-center"><div className="flex items-end gap-3">{COUNCIL.map((p, i) => <Slot key={p.id} p={p} size={104} i={i + 17} called={!!called[p.id]} say={!!called[p.id]?.say} onCall={(x) => call(x)} label={false} />)}</div><div className="mt-2 text-[15px] font-semibold text-slate-700">Council <span className="font-normal text-slate-400">· three models vote</span></div></div>
            </div>
            <div className="flex flex-col items-center">
              <div className="flex items-end gap-2.5">{BENCH.map((av, i) => <motion.span key={av} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 + i * 0.05 }} style={{ opacity: 0.9 }}><Avatar av={av} size={70} state="idle" delay={(i * 0.5) % 3} color={tint(av)} /></motion.span>)}</div>
              <div className="mt-1.5 text-[15px] text-slate-400">Ready when called</div>
            </div>
          </div>
          <div className="flex items-center justify-center gap-3 pb-8">
            <button onClick={callAll} className="h-12 rounded-full border border-slate-200 bg-white px-6 text-[16px] font-semibold text-slate-700 shadow-sm hover:border-indigo-300 hover:text-indigo-600">Call everyone</button>
            <button onClick={() => useOffice.setState({ open: false })} className="h-12 rounded-full bg-slate-900 px-8 text-[16px] font-semibold text-white shadow-[0_16px_36px_-14px_rgba(15,23,42,.7)] hover:bg-slate-800">Start the demo</button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
