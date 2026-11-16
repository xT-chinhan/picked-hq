import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { AnimatePresence, motion } from 'motion/react'
import { Check } from 'lucide-react'
import openai from '@lobehub/icons-static-svg/icons/openai.svg'
import gemini from '@lobehub/icons-static-svg/icons/gemini-color.svg'
import claude from '@lobehub/icons-static-svg/icons/claude-color.svg'
import { Avatar, BENCH, COUNCIL, PEOPLE, tint, useTints, type Person } from './avatars'
import { useLive } from './live'

/* The AI office: every agent at its desk, standing by. Click a desk to call that agent; "Call everyone" wakes the team.
   While the office is open the canvas behind it is paused (see App), so nothing moves until the demo starts. */
export const useOffice = create<{ open: boolean }>(() => ({ open: !/[?&](t|nowake|nocam)\b/.test(location.search) }))

const BY = (id: string) => PEOPLE.find((p) => p.id === id)!
const SCOUTS = PEOPLE.filter((p) => p.id.startsWith('scout'))
/** which model family each desk runs on (matches server/agents.mjs); rules and people get a plain label */
const MODEL: Record<string, { logo?: string; label: string }> = {
  nan: { logo: claude, label: 'Claude Opus 5.5' }, lia: { logo: gemini, label: 'Gemini 3.8' }, mina: { logo: gemini, label: 'Gemini 3.8' },
  ana: { logo: gemini, label: 'Gemini 4' }, sy: { logo: gemini, label: 'Gemini 4' }, mira: { logo: claude, label: 'Sonnet 5.5' },
  theo: { logo: gemini, label: 'Gemini 4' }, quinn: { label: 'Council' }, rhea: { label: 'Rules' }, pax: { label: 'Rules' },
  tara: { label: 'Scheduler' }, owner: { label: 'Human' },
  g4: { logo: gemini, label: 'Gemini 4' }, astra: { logo: openai, label: 'GPT-6 Astra' }, opus: { logo: claude, label: 'Claude Opus 5.5' },
}
const DESKS = ['mina', 'ana', 'sy', 'mira', 'theo', 'quinn', 'rhea', 'pax', 'tara', 'owner']

/** viewport-driven sizes, so the office never runs off the edge of the screen */
function useScale() {
  const [s, set] = useState(() => Math.min(window.innerWidth / 1500, window.innerHeight / 1020))
  useEffect(() => { const f = () => set(Math.min(window.innerWidth / 1500, window.innerHeight / 1020)); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f) }, [])
  return Math.max(0.55, Math.min(1.2, s))
}

function Bubble({ text }: { text: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4 }} className="absolute bottom-full left-1/2 z-20 mb-2 w-max max-w-[220px] -translate-x-1/2 rounded-2xl bg-slate-900 px-3.5 py-2 text-center text-[14px] font-medium leading-snug text-white shadow-[0_14px_30px_-12px_rgba(15,23,42,.6)]">
      {text}<span className="absolute left-1/2 top-full -mt-1 h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-slate-900" />
    </motion.div>
  )
}

function Desk({ p, i, k, called, onCall }: { p: Person; i: number; k: number; called: { say: boolean } | undefined; onCall: () => void }) {
  const m = MODEL[p.id]
  return (
    <motion.button initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 + i * 0.05, type: 'spring', stiffness: 240, damping: 20 }} onClick={onCall}
      className="group relative flex flex-col items-center rounded-[22px] border bg-white/80 px-2 pb-3 pt-2 text-center transition-[box-shadow,border-color] duration-300"
      style={{ width: 128 * k, borderColor: called ? p.color : '#e8ebf2', boxShadow: called ? `0 18px 40px -18px ${p.color}aa, 0 0 0 4px ${p.color}22` : '0 8px 24px -18px rgba(15,23,42,.35)' }}>
      <AnimatePresence>{called?.say && <Bubble text={p.line} />}</AnimatePresence>
      <span className="transition-transform duration-200 group-hover:-translate-y-1"><Avatar av={p.av} size={104 * k} state={called ? 'called' : 'idle'} delay={(i * 0.37) % 3} color={p.color} /></span>
      <span className="mt-1 text-[16px] font-semibold leading-tight tracking-tight text-slate-900" style={{ fontSize: 16 * Math.max(0.85, k) }}>{p.name}</span>
      <span className="whitespace-nowrap text-[12.5px] leading-tight text-slate-500">{p.role}</span>
      <span className="mt-1.5 flex items-center gap-1 whitespace-nowrap rounded-full bg-slate-50 px-2 py-0.5 text-[11.5px] font-medium text-slate-500">
        {m?.logo ? <img src={m.logo} alt="" className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />}{m?.label}
      </span>
    </motion.button>
  )
}

export function Office() {
  const open = useOffice((s) => s.open), mode = useLive((s) => s.mode), k = useScale()
  const [called, setCalled] = useState<Record<string, { t: number; say: boolean }>>({})
  const timers = useRef<number[]>([])
  useTints()
  useEffect(() => { if (mode !== 'script') useOffice.setState({ open: false }) }, [mode])
  const call = (p: Person, hold = 2600, say = true) => {
    const t = Date.now()
    setCalled((c) => ({ ...c, [p.id]: { t, say } }))
    timers.current.push(window.setTimeout(() => setCalled((c) => { const n = { ...c }; if (n[p.id]?.t === t) delete n[p.id]; return n }), hold))
  }
  const callAll = () => [BY('nan'), BY('lia'), ...DESKS.map(BY), ...SCOUTS, ...COUNCIL].forEach((p, i) => timers.current.push(window.setTimeout(() => call(p, 1700, false), i * 90)))
  useEffect(() => {
    if (!open) return
    const first = window.setTimeout(() => call(BY('nan'), 2800), 1400)
    const key = (e: KeyboardEvent) => { if ((e.key === 'Enter' || e.key === ' ') && (e.target as HTMLElement).tagName !== 'BUTTON') { e.preventDefault(); useOffice.setState({ open: false }) } }
    window.addEventListener('keydown', key)
    return () => { clearTimeout(first); timers.current.forEach(clearTimeout); timers.current = []; window.removeEventListener('keydown', key) }
  }, [open])
  const nan = BY('nan')
  return (
    <AnimatePresence>
      {open && (
        <motion.div key="office" initial={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.02, filter: 'blur(10px)' }} transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
          className="absolute inset-0 z-50 overflow-hidden bg-[radial-gradient(120%_80%_at_50%_0%,#eef0ff_0%,#f8f9fc_45%,#ffffff_100%)]">
          {/* floor: soft perspective grid */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] opacity-60 [background-image:linear-gradient(#e6e9f2_1px,transparent_1px),linear-gradient(90deg,#e6e9f2_1px,transparent_1px)] [background-size:56px_56px] [mask-image:linear-gradient(to_top,black,transparent)] [transform:perspective(900px)_rotateX(58deg)] [transform-origin:bottom]" />
          <div className="relative flex h-full flex-col">
            <div className="flex items-center gap-3 px-10 pt-6">
              <div className="grid h-11 w-11 place-items-center rounded-[14px] bg-gradient-to-br from-indigo-500 to-violet-600 text-white"><Check size={24} strokeWidth={3.2} /></div>
              <div><div className="text-[26px] font-semibold leading-none tracking-tight text-slate-900">The Picked office</div><div className="mt-1 text-[15px] text-slate-500">Every agent at its desk, standing by.</div></div>
              <div className="ml-auto flex items-center gap-4 text-[15px] text-slate-500">
                <span className="flex items-center gap-2"><span className="live-dot" /><b className="text-slate-900">{PEOPLE.length + COUNCIL.length + BENCH.length}</b> agents</span>
                <span className="flex items-center gap-1.5"><img src={claude} alt="" className="h-5 w-5" /><img src={gemini} alt="" className="h-5 w-5" /><img src={openai} alt="" className="h-5 w-5" /><b className="text-slate-900">20</b> AI models</span>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[2.2vh]">
              {/* the chief of staff, centre stage */}
              <div className="flex items-center gap-4">
              <motion.button initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 18 }} onClick={() => call(nan)} className="relative flex items-center gap-4 rounded-[28px] border border-violet-200 bg-white/85 py-2 pl-3 pr-6 shadow-[0_24px_60px_-30px_rgba(124,58,237,.6)]">
                <AnimatePresence>{called.nan?.say && <Bubble text={nan.line} />}</AnimatePresence>
                <Avatar av={nan.av} size={118 * k} state={called.nan ? 'called' : 'idle'} color={nan.color} />
                <div className="text-left"><div className="text-[24px] font-semibold leading-none tracking-tight text-slate-900">NaN</div><div className="mt-1 text-[14px] text-slate-500">Chief of staff · routes every request</div>
                  <div className="mt-2 flex items-center gap-1.5 text-[12.5px] font-medium text-slate-500"><img src={claude} alt="" className="h-4 w-4" />Claude Opus 5.5</div></div>
              </motion.button>
              <Desk p={BY('lia')} i={1} k={k} called={called.lia} onCall={() => call(BY('lia'))} />
              </div>

              <div className="flex justify-center gap-3" style={{ gap: 12 * k }}>
                {DESKS.map((id, i) => <Desk key={id} p={BY(id)} i={i} k={k} called={called[id]} onCall={() => call(BY(id))} />)}
              </div>

              <div className="flex flex-wrap items-end justify-center gap-6">
                <div className="flex flex-col items-center rounded-[24px] border border-orange-100 bg-orange-50/50 px-5 pb-3 pt-1">
                  <div className="flex items-end gap-1">{SCOUTS.map((p, i) => <button key={p.id} onClick={() => call(p)} className="relative"><AnimatePresence>{called[p.id]?.say && <Bubble text={p.line} />}</AnimatePresence><Avatar av={p.av} size={84 * k} state={called[p.id] ? 'called' : 'idle'} delay={i * 0.3} color={p.color} /></button>)}</div>
                  <div className="mt-1 flex items-center gap-1.5 text-[15px] font-semibold text-slate-700"><img src={gemini} alt="" className="h-4 w-4" />Scouts <span className="font-normal text-slate-500">· one Gemini tab each</span></div>
                </div>
                <div className="flex flex-col items-center rounded-[24px] border border-indigo-100 bg-indigo-50/50 px-5 pb-3 pt-1">
                  <div className="flex items-end gap-2">{COUNCIL.map((p, i) => <button key={p.id} onClick={() => call(p)} className="relative flex flex-col items-center"><AnimatePresence>{called[p.id]?.say && <Bubble text={p.line} />}</AnimatePresence><Avatar av={p.av} size={84 * k} state={called[p.id] ? 'called' : 'idle'} delay={i * 0.4} color={p.color} /><span className="flex items-center gap-1 text-[12px] font-medium text-slate-600"><img src={MODEL[p.id].logo} alt="" className="h-3.5 w-3.5" />{p.name}</span></button>)}</div>
                  <div className="mt-1 text-[15px] font-semibold text-slate-700">Fact-check council <span className="font-normal text-slate-500">· three model families vote</span></div>
                </div>
                <div className="flex flex-col items-center px-2 pb-3">
                  <div className="flex items-end gap-1">{BENCH.map((av, i) => <span key={av}><Avatar av={av} size={58 * k} state="idle" delay={(i * 0.5) % 3} color={tint(av)} /></span>)}</div>
                  <div className="mt-1 text-[14px] text-slate-400">On the bench · ready when called</div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 pb-7">
              <button onClick={callAll} className="h-12 rounded-full border border-slate-200 bg-white px-6 text-[16px] font-semibold text-slate-700 shadow-sm hover:border-indigo-300 hover:text-indigo-600">Call everyone</button>
              <button onClick={() => useOffice.setState({ open: false })} className="h-12 rounded-full bg-slate-900 px-8 text-[16px] font-semibold text-white shadow-[0_16px_36px_-14px_rgba(15,23,42,.7)] hover:bg-slate-800">Start the demo</button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
