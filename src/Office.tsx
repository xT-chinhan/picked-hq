import { useRef, useState, type ReactNode } from 'react'
import { create } from 'zustand'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowUp, ChevronUp, Globe, Play, ScanSearch, Sparkles, Users, Zap } from 'lucide-react'
import { useLive, startLive, leaveLive } from './live'
import { clock, useSim } from './sim'
import { Card, intent, jump, submit, useOne } from './SystemOne'
import { OfficeStage } from './OfficeStage'
import { openAnalyze } from './Analyze'
import { useBrowser } from './BrowserPanel'
import { useApps } from './Apps'
import { useStory } from './Story'

/* The AI office: every agent at its desk, standing by. Click a desk to call that agent; "Call everyone" wakes the team.
   While the office is open the canvas behind it is paused (see App), so nothing moves until the demo starts. */
export const useOffice = create<{ open: boolean }>(() => ({ open: location.pathname !== '/workflow' && !/[?&](t|nowake|nocam)\b/.test(location.search) }))

// Keep all existing commands and the C shortcut aligned with browser navigation.
let restoringRoute = false
useOffice.subscribe((state, previous) => {
  if (state.open === previous.open || restoringRoute) return
  const route = state.open ? '/' : '/workflow'
  if (location.pathname !== route) history.pushState({}, '', route)
})
window.addEventListener('popstate', () => {
  restoringRoute = true
  useOffice.setState({ open: location.pathname !== '/workflow' })
  restoringRoute = false
})

/** Start the scripted showcase from its first second. */
function playStory() { if (useLive.getState().mode !== 'script') leaveLive(); clock.t = 0; useSim.setState({ t: 0, now: Date.now() }); useOffice.setState({ open: false }) }
const CANVAS = new Set(['audit', 'replay', 'goto', 'overview', 'stop', 'browse', 'approve', 'reject', 'shop'])
type Item = { icon: ReactNode; label: string; hint: string; run: () => void }

function OfficeBar({ callAll }: { callAll: () => void }) {
  const [v, setV] = useState(''), [menu, setMenu] = useState(false), input = useRef<HTMLInputElement>(null)
  const msgs = useOne((s) => s.msgs), last = [...msgs].reverse().find((m) => m.who === 'one')
  const close = () => useOffice.setState({ open: false })
  const go = (f: () => void) => () => { setMenu(false); f() }
  const simulated: Item[] = [
    { icon: <Play size={17} />, label: 'Play the whole story', hint: 'The full scripted demo, from the start', run: go(playStory) },
    { icon: <Users size={17} />, label: 'Wake the whole team', hint: 'Every agent steps up in turn', run: go(callAll) },
    { icon: <Sparkles size={17} />, label: 'Jump to the fact-check council', hint: 'Three model families vote', run: go(() => { close(); jump('qa') }) },
    { icon: <Sparkles size={17} />, label: 'Jump to owner approval', hint: 'The phone, the stamp, the publish', run: go(() => { close(); jump('approve') }) },
    { icon: <Sparkles size={17} />, label: 'Jump to the results', hint: 'Six weeks later, in three numbers', run: go(() => { close(); jump('impact') }) },
    { icon: <Sparkles size={17} />, label: 'Open the story sheets', hint: 'Positioning, business case, real data', run: go(() => useStory.setState({ open: true, slide: 0 })) },
  ]
  const real: Item[] = [
    { icon: <ScanSearch size={17} />, label: 'Analyze any business', hint: 'Our agents x-ray a company you pick, live', run: go(() => openAnalyze()) },
    { icon: <Zap size={17} />, label: 'Audit Elmich, quick', hint: 'Real pipeline on the saved Gemini answers', run: go(() => { close(); void startLive({ brand: 'Elmich', mode: 'quick', replace: true }) }) },
    { icon: <Globe size={17} />, label: 'Audit Elmich, fresh', hint: '40 new questions on real Gemini, ~4 min', run: go(() => { close(); void startLive({ brand: 'Elmich', mode: 'fresh', replace: true }) }) },
    { icon: <Globe size={17} />, label: 'Open the browser room', hint: 'Watch the agents’ real pages', run: go(() => { close(); useBrowser.setState({ open: true, control: false }) }) },
    { icon: <Globe size={17} />, label: 'Connect apps (MCP)', hint: '28 apps, logos and permissions', run: go(() => useApps.setState({ open: true })) },
  ]
  const send = () => { const t = v.trim(); if (!t) return; setV(''); const a = intent(t); if (a && CANVAS.has(a.type)) close(); void submit(t) }
  const Row = ({ it }: { it: Item }) => (
    <button onClick={it.run} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-slate-50">
      <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-slate-100 text-slate-600">{it.icon}</span>
      <span className="min-w-0"><span className="block text-[15.5px] font-semibold leading-tight text-slate-900">{it.label}</span><span className="block text-[13px] leading-tight text-slate-500">{it.hint}</span></span>
    </button>
  )
  return (
    <div className="relative mx-auto w-[min(860px,92vw)] pb-6">
      <AnimatePresence>
        {last && (last.busy || last.text) && (
          <motion.div key={last.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-3 max-h-[26vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white/95 px-5 py-3 shadow-[0_18px_40px_-24px_rgba(15,23,42,.35)]">
            <div className="flex items-start gap-3"><span className="mt-0.5 flex-none"><img src="/avatars/a21.webp" alt="" className="h-9 w-9 rounded-full bg-violet-50 object-cover object-top" /></span>
              <div className="min-w-0 flex-1 text-[16px] leading-snug text-slate-800">{last.busy && !last.text ? <span className="flex items-center gap-2 text-slate-400"><span className="spinner" />{last.steps?.at(-1)?.t ?? 'Thinking'}…</span> : last.text}{last.card && <Card c={last.card} />}</div></div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {menu && (
          <motion.div initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.16 }} className="absolute bottom-[calc(100%-6px)] left-0 z-30 mb-2 grid w-[min(720px,92vw)] grid-cols-2 gap-x-3 rounded-[22px] border border-slate-200 bg-white p-3 shadow-[0_30px_70px_-25px_rgba(15,23,42,.45)]">
            <div><div className="px-3 pb-1 pt-1 text-[12px] font-bold uppercase tracking-[.14em] text-slate-400">Simulated · the showcase</div>{simulated.map((it) => <Row key={it.label} it={it} />)}</div>
            <div className="border-l border-slate-100 pl-3"><div className="px-3 pb-1 pt-1 text-[12px] font-bold uppercase tracking-[.14em] text-emerald-600">Real · runs now</div>{real.map((it) => <Row key={it.label} it={it} />)}</div>
          </motion.div>
        )}
      </AnimatePresence>
      <form onSubmit={(e) => { e.preventDefault(); send() }} className="flex items-center gap-2 rounded-full border border-slate-200 bg-white p-2 pl-2.5 shadow-[0_22px_50px_-26px_rgba(15,23,42,.5)]">
        <button type="button" onClick={() => setMenu((m) => !m)} className={`flex h-12 flex-none items-center gap-2 rounded-full px-5 text-[16px] font-semibold ${menu ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-800 hover:bg-slate-200'}`}>Run<ChevronUp size={17} className={`transition-transform ${menu ? '' : 'rotate-180'}`} /></button>
        <input ref={input} value={v} onChange={(e) => setV(e.target.value)} onFocus={() => setMenu(false)} placeholder="Ask NaN, or type “analyze a company”…" className="h-12 min-w-0 flex-1 bg-transparent px-3 text-[17px] outline-none placeholder:text-slate-400" />
        <button disabled={!v.trim()} className="grid h-12 w-12 flex-none place-items-center rounded-full bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-slate-200"><ArrowUp size={20} strokeWidth={2.6} /></button>
      </form>
    </div>
  )
}

export function Office() {
  const open = useOffice((s) => s.open)
  return <AnimatePresence>{open && <OfficeStage onWorkflow={playStory} onBrowser={() => { useOffice.setState({ open: false }); useBrowser.setState({ open: true, control: false }) }} bar={<OfficeBar callAll={() => window.dispatchEvent(new Event('picked:replay-office'))} />} />}</AnimatePresence>
}
