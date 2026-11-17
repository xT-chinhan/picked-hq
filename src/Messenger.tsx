import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, ArrowUp, BookOpen, Check, ChevronUp, Globe, LayoutGrid, Loader2, MessageSquare, Plus, ScanSearch, Search, Sparkles, Users, Workflow, X, Zap } from 'lucide-react'
import { Face } from './avatars'
import { TypedMd } from './Typed'
import { BrowserPanel, useBrowser } from './BrowserPanel'
import { useStory } from './Story'
import { useApps } from './Apps'
import { RunCard } from './runcards'
import { ENGINE, STARTERS, TEAM, greeting, openRun, personOf, sendTurn, useChat, type CMsg } from './chat'

/* The office is a messenger: every agent is one row, you can talk to one of them or to everyone,
   real jobs run live inside the conversation, and a browser opens in the right column. */
const NONE: CMsg[] = []
const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const ALL = { id: 'all', name: 'Everyone', role: 'Group chat · NaN routes the work' }

function GroupFaces({ size = 46 }: { size?: number }) {
  const f = ['a21', 'a05', 'a26', 'a17']
  return <span className="relative block flex-none rounded-2xl bg-slate-100" style={{ width: size, height: size }}>{f.map((av, i) => <span key={av} className="absolute" style={{ left: (i % 2) * (size / 2 - 1), top: Math.floor(i / 2) * (size / 2 - 1) }}><Face av={av} size={size / 2 - 2} /></span>)}</span>
}

function Row({ id, name, preview, ts, working, active, onClick, unread }: { id: string; name: string; preview: string; ts?: number; working: boolean; active: boolean; onClick: () => void; unread: boolean }) {
  const p = id === 'all' ? null : personOf(id)
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-1 text-left transition-colors ${active ? 'bg-slate-200/80' : 'hover:bg-slate-100'}`}>
      {p ? <span className="relative flex-none"><Face av={p.av} size={38} />{working && <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500" />}</span> : <GroupFaces size={38} />}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2"><span className="truncate text-[16.5px] font-semibold text-slate-900">{name}</span><span className="ml-auto flex-none text-[13px] text-slate-400">{ts ? clock(ts) : ''}</span></span>
        <span className={`block truncate text-[14.5px] ${working ? 'shimmer font-medium' : unread ? 'font-medium text-slate-700' : 'text-slate-500'}`}>{working ? 'Working…' : preview}</span>
      </span>
    </button>
  )
}

function Bubble({ m, group }: { m: CMsg; group: boolean }) {
  const me = m.who === 'me', p = personOf(m.who)
  if (!m.text && !m.thinking) return null
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 28 }} className={`flex items-end gap-2.5 ${me ? 'justify-end' : ''}`}>
      {!me && p && <Face av={p.av} size={34} />}
      <div className={`max-w-[78%] ${me ? 'items-end' : ''}`}>
        {!me && group && p && <div className="mb-0.5 ml-1 text-[13px] font-semibold" style={{ color: p.color }}>{p.name}</div>}
        <div className={`rounded-[20px] px-4 py-2.5 text-[16.5px] leading-snug ${me ? 'rounded-br-md bg-indigo-600 text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'}`}>
          {m.thinking ? <span className="flex items-center gap-2 text-slate-400"><Loader2 size={15} className="animate-spin" /><span className="shimmer">Thinking…</span></span> : me ? m.text : <TypedMd k={`m${m.id}`} text={m.text} />}
          {m.flow && <button onClick={() => (window as any).__picked_workflow?.()} className="mt-2 flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-[14px] font-semibold text-indigo-700 hover:bg-indigo-100"><Workflow size={14} />Open the workflow<ArrowRight size={13} /></button>}
        </div>
      </div>
    </motion.div>
  )
}

const RUN_ITEMS: { icon: any; label: string; hint: string; fill?: string; run?: () => void }[] = [
  { icon: ScanSearch, label: 'Analyze any business', hint: 'Site read, readiness checks and a live-page inspection', fill: 'Analyze ' },
  { icon: Zap, label: 'Audit Elmich, quick', hint: 'Full pipeline on the saved Gemini answers', run: () => openRun(useChat.getState().active, { type: 'audit', brand: 'Elmich', fresh: false }) },
  { icon: Globe, label: 'Audit Elmich, fresh', hint: '40 new questions on real Gemini, about 4 minutes', run: () => openRun(useChat.getState().active, { type: 'audit', brand: 'Elmich', fresh: true }) },
  { icon: MessageSquare, label: 'Ask Gemini a buyer question', hint: 'One real answer from an anonymous Gemini tab', fill: 'Ask Gemini: ' },
  { icon: Search, label: 'Review a page in the browser', hint: 'Open it on the right and score it for AI', fill: 'Open elmich.vn and review it' },
  { icon: Sparkles, label: 'Use the connected apps', hint: 'Let the agents call your MCP apps', fill: 'Use apps: ' },
  { icon: Globe, label: 'Open the browser', hint: 'Watch or drive the agents’ pages', run: () => useBrowser.setState({ open: true, control: false }) },
  { icon: LayoutGrid, label: 'Connect apps (MCP)', hint: 'Logos, permissions, 28 apps', run: () => useApps.setState({ open: true }) },
]

function Composer({ thread }: { thread: string }) {
  const draft = useChat((s) => s.draft), [menu, setMenu] = useState(false), input = useRef<HTMLInputElement>(null)
  const set = (v: string) => useChat.setState({ draft: v })
  useEffect(() => { input.current?.focus() }, [thread])
  const send = () => { const t = draft.trim(); if (!t) return; set(''); setMenu(false); void sendTurn(thread, t) }
  const target = thread === 'all' ? ALL.name : personOf(thread)?.name
  return (
    <div className="relative">
      <AnimatePresence>
        {menu && (
          <motion.div initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.16 }} className="absolute bottom-[calc(100%+10px)] left-0 z-30 w-[min(480px,100%)] rounded-[22px] border border-slate-200 bg-white p-2.5 shadow-[0_30px_80px_-30px_rgba(15,23,42,.45)]">
            <div className="px-3 pb-1 pt-1 text-[12.5px] font-bold uppercase tracking-[.14em] text-emerald-600">Real jobs · they run in this chat</div>
            {RUN_ITEMS.map((it) => (
              <button key={it.label} onClick={() => { setMenu(false); if (it.fill) { set(it.fill); input.current?.focus() } else it.run?.() }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-slate-50">
                <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-slate-100 text-slate-600"><it.icon size={17} /></span>
                <span className="min-w-0"><span className="block text-[15.5px] font-semibold leading-tight text-slate-900">{it.label}</span><span className="block text-[13.5px] leading-tight text-slate-500">{it.hint}</span></span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <form onSubmit={(e) => { e.preventDefault(); send() }} className="flex items-center gap-2 rounded-full border border-slate-200 bg-white p-2 pl-2.5 shadow-[0_22px_50px_-28px_rgba(15,23,42,.5)]">
        <button type="button" onClick={() => setMenu((v) => !v)} className={`flex h-11 flex-none items-center gap-2 rounded-full px-4 text-[15.5px] font-semibold ${menu ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-800 hover:bg-slate-200'}`}><Plus size={17} />Run<ChevronUp size={16} className={`transition-transform ${menu ? '' : 'rotate-180'}`} /></button>
        <input ref={input} value={draft} onChange={(e) => set(e.target.value)} onFocus={() => setMenu(false)} placeholder={`Message ${target}…`} className="h-11 min-w-0 flex-1 bg-transparent px-2 text-[16.5px] outline-none placeholder:text-slate-400" />
        <button disabled={!draft.trim()} className="grid h-11 w-11 flex-none place-items-center rounded-full bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-slate-200"><ArrowUp size={20} strokeWidth={2.6} /></button>
      </form>
    </div>
  )
}

function Chat({ thread }: { thread: string }) {
  const msgs = useChat((s) => s.threads[thread] ?? NONE), box = useRef<HTMLDivElement>(null), inner = useRef<HTMLDivElement>(null), stick = useRef(true)
  const p = thread === 'all' ? null : personOf(thread), group = thread === 'all'
  useLayoutEffect(() => { stick.current = true; const el = box.current; if (el) el.scrollTop = el.scrollHeight }, [thread])
  useEffect(() => {
    const el = box.current, c = inner.current; if (!el || !c) return
    const ro = new ResizeObserver(() => { if (stick.current) el.scrollTo({ top: el.scrollHeight }) })
    ro.observe(c); return () => ro.disconnect()
  }, [thread])
  // when a job finishes, bring the top of its result into view instead of leaving the reader at the bottom of a long report
  const doneKey = msgs.filter((m) => m.run && m.res && !m.old).map((m) => m.id).join()
  useEffect(() => {
    const id = doneKey.split(',').filter(Boolean).pop(); const el = box.current; if (!id || !el) return
    const t = el.querySelector(`[data-mid="${id}"]`) as HTMLElement | null; if (!t) return
    stick.current = false; el.scrollTo({ top: t.offsetTop - el.offsetTop - 12, behavior: 'smooth' })
  }, [doneKey])
  const starters = STARTERS[thread] ?? STARTERS.nan
  const empty = msgs.length === 0
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-[26px] border border-slate-200 bg-white/90 shadow-[0_30px_80px_-50px_rgba(42,47,90,.5)]">
      <header className="flex items-center gap-3 border-b border-slate-100 px-5 py-3">
        {p ? <Face av={p.av} size={42} /> : <GroupFaces size={42} />}
        <div className="min-w-0 flex-1"><div className="text-[18px] font-semibold leading-tight text-slate-900">{p ? p.name : ALL.name}</div><div className="truncate text-[14px] text-slate-500">{p ? `${p.role} · ${ENGINE[p.id] ?? ''}` : ALL.role}</div></div>
        <button onClick={() => useBrowser.setState((s) => ({ open: !s.open, control: false }))} className="flex h-10 items-center gap-2 rounded-full bg-slate-100 px-4 text-[14.5px] font-semibold text-slate-700 hover:bg-slate-200"><Globe size={16} />Browser</button>
      </header>
      <div ref={box} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80 }} className="min-h-0 flex-1 overflow-y-auto px-5 py-5 [scrollbar-width:thin]">
        <div ref={inner} className="mx-auto flex max-w-[900px] flex-col gap-3.5">
          {empty && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center py-10 text-center">
              {p ? <Face av={p.av} size={96} /> : <GroupFaces size={96} />}
              <div className="mt-4 text-[22px] font-semibold text-slate-900">{p ? p.name : 'Everyone'}</div>
              <div className="mt-1 max-w-[560px] text-[16.5px] leading-snug text-slate-500">{greeting(thread)}</div>
            </motion.div>
          )}
          {msgs.map((m) => (m.run ? <div key={m.id} data-mid={m.id} className="flex gap-2.5"><span className="w-[34px] flex-none" /><RunCard thread={thread} m={m} /></div> : <Bubble key={m.id} m={m} group={group} />))}
        </div>
      </div>
      <div className="px-5 pb-4 pt-1">
        <div className="mx-auto max-w-[900px]">
          <div className="mb-2.5 flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]">{starters.map((s, i) => <motion.button key={s} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i }} onClick={() => void sendTurn(thread, s)} className="flex-none rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-[14.5px] font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-600">{s}</motion.button>)}</div>
          <Composer thread={thread} />
        </div>
      </div>
    </section>
  )
}

export function Messenger({ onWorkflow }: { onWorkflow: () => void }) {
  const active = useChat((s) => s.active), threads = useChat((s) => s.threads), q = useChat((s) => s.q), last = useChat((s) => s.last)
  const br = useBrowser((s) => s.open)
  useEffect(() => { (window as any).__picked_workflow = onWorkflow; return () => { delete (window as any).__picked_workflow } }, [onWorkflow])
  const rows = useMemo(() => {
    const all = [{ id: 'all', name: ALL.name }, ...TEAM.map((p) => ({ id: p.id, name: p.name }))]
    const f = q.trim().toLowerCase()
    return all.filter((r) => !f || r.name.toLowerCase().includes(f) || (personOf(r.id)?.role ?? '').toLowerCase().includes(f))
  }, [q])
  const info = (id: string) => {
    const ms = threads[id] ?? [], m = [...ms].reverse().find((x) => x.text || x.run)
    const working = ms.some((x) => x.run && !x.res)
    const preview = m ? (m.run ? (m.run.kind === 'xray' ? `X-ray of ${m.run.input}` : m.run.kind === 'audit' ? `Audit ${m.run.act.brand ?? ''}` : 'Real job') : (m.who === 'me' ? 'You: ' : '') + m.text) : id === 'all' ? greeting('all') : (personOf(id)?.role ?? '')
    return { preview, ts: m?.ts ?? last[id], working }
  }
  return (
    <motion.main className="absolute inset-0 z-50 flex flex-col overflow-hidden bg-[radial-gradient(900px_500px_at_10%_-5%,#e9e8fb,transparent_70%),radial-gradient(800px_500px_at_100%_100%,#e3f1f7,transparent_70%)] bg-[#f7f8fb] text-slate-900" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
      <header className="flex h-[60px] flex-none items-center gap-5 border-b border-slate-200 bg-white/80 px-[2.4%] backdrop-blur">
        <a href="/" className="flex items-center gap-2 text-[26px] font-bold tracking-[-0.06em] text-slate-900 no-underline" aria-label="Picked home"><span className="grid h-8 w-8 place-items-center rounded-[10px] bg-indigo-600 text-white"><Check size={19} strokeWidth={3} /></span>picked<span className="-ml-1 text-indigo-600">.</span></a>
        <nav className="ml-3 flex items-center gap-1.5 text-[15px] font-semibold">
          <span className="flex h-9 items-center gap-2 rounded-full bg-slate-900 px-4 text-white"><MessageSquare size={15} />Chat</span>
          <button onClick={onWorkflow} className="flex h-9 items-center gap-2 rounded-full px-3.5 text-slate-600 hover:bg-slate-100"><Workflow size={16} />Workflow</button>
          <button onClick={() => useStory.setState({ open: true, slide: 0 })} className="flex h-9 items-center gap-2 rounded-full px-3.5 text-slate-600 hover:bg-slate-100"><BookOpen size={16} />Story</button>
          <button onClick={() => useApps.setState({ open: true })} className="flex h-9 items-center gap-2 rounded-full px-3.5 text-slate-600 hover:bg-slate-100"><LayoutGrid size={16} />Apps</button>
        </nav>
        <button onClick={() => { useChat.setState({ draft: 'Analyze ' }); setTimeout(() => document.querySelector<HTMLInputElement>('input[placeholder^="Message"]')?.focus(), 0) }} className="ml-auto flex h-10 items-center gap-2 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 px-5 text-[15px] font-semibold text-white shadow-[0_10px_26px_-12px_#6d4fe0]"><ScanSearch size={17} />Business X-ray<ArrowRight size={15} /></button>
      </header>
      <div className="flex min-h-0 flex-1 gap-4 p-4 pt-3.5">
        <aside className="flex w-[350px] flex-none flex-col rounded-[26px] border border-slate-200 bg-white/90 p-3 shadow-[0_30px_80px_-50px_rgba(42,47,90,.5)]">
          <label className="mb-2.5 flex h-11 items-center gap-2.5 rounded-xl bg-slate-100 px-3.5 text-slate-500"><Search size={17} /><input value={q} onChange={(e) => useChat.setState({ q: e.target.value })} placeholder="Search" className="min-w-0 flex-1 bg-transparent text-[16px] text-slate-800 outline-none placeholder:text-slate-400" />{q && <button type="button" onClick={() => useChat.setState({ q: '' })}><X size={15} /></button>}</label>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto [scrollbar-width:thin]">
            {rows.map((r) => { const i = info(r.id); return <Row key={r.id} id={r.id} name={r.name} preview={i.preview} ts={i.ts} working={i.working} active={active === r.id} unread={false} onClick={() => useChat.setState({ active: r.id })} /> })}
            {!rows.length && <div className="px-4 py-8 text-center text-[15px] text-slate-400">No agent matches “{q}”.</div>}
          </div>
          <div className="mt-2 flex items-center gap-2 px-2 text-[13.5px] text-slate-400"><Users size={14} />{TEAM.length} agents online</div>
        </aside>
        <Chat key={active} thread={active} />
        <AnimatePresence>
          {br && <motion.div key="br" initial={{ width: '0vw', opacity: 0 }} animate={{ width: '38vw', opacity: 1 }} exit={{ width: '0vw', opacity: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 32 }} className="min-h-0 flex-none overflow-hidden"><div className="h-full w-[38vw]"><BrowserPanel docked /></div></motion.div>}
        </AnimatePresence>
      </div>
    </motion.main>
  )
}
