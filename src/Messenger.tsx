import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Lock, Unlock, Play, ArrowUp, BookOpen, Eraser, MoreHorizontal, Check, ChevronUp, Globe, LayoutGrid, Loader2, Menu, MessageSquare, PanelLeftClose, PanelLeftOpen, Pencil, Plus, ScanSearch, Search, Sparkles, Trash2, Users, Workflow, X, Zap } from 'lucide-react'
import { BENCH, Face } from './avatars'
import { TypedMd } from './Typed'
import { playScene, useDemo } from './demo'
import { BrowserPanel, useBrowser } from './BrowserPanel'
import { useStory } from './Story'
import { useApps } from './Apps'
import { RunCard } from './runcards'
import { ENGINE, STARTERS, TEAM, botOf, clearThread, isCustom, draftBot, freeFaces, greeting, openRun, personOf, removeBot, saveBot, sendTurn, useBots, useChat, type Bot, type CMsg } from './chat'

/* The office is a messenger: every agent is one row, you can talk to one of them or to everyone,
   real jobs run live inside the conversation, and a browser opens in the right column.
   Look: near-monochrome (ink on white), one blue accent, colour only where it carries meaning. */
const NONE: CMsg[] = []
const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const ALL = { id: 'all', name: 'Everyone', role: 'Group chat · NaN routes the work' }
const COLLAPSE_KEY = 'picked.sidebar.collapsed'

function GroupFaces({ size = 44 }: { size?: number }) {
  const f = ['a21', 'a05', 'a26', 'a17'], h = size / 2 - 1
  return <span className="relative block flex-none rounded-full bg-surface" style={{ width: size, height: size }}>{f.map((av, i) => <span key={av} className="absolute" style={{ left: (i % 2) * h + 1, top: Math.floor(i / 2) * h + 1 }}><Face av={av} size={h - 1} plain /></span>)}</span>
}

function Row({ id, name, preview, ts, working, active, collapsed, onClick, onMenu }: { id: string; name: string; preview: string; ts?: number; working: boolean; active: boolean; collapsed: boolean; onClick: () => void; onMenu: (el: HTMLElement) => void }) {
  const p = id === 'all' ? null : personOf(id)
  const face = p ? <span className="relative flex-none"><Face av={p.av} size={collapsed ? 44 : 40} plain />{working && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-ink" />}</span> : <GroupFaces size={collapsed ? 44 : 40} />
  if (collapsed) return <button onClick={onClick} onContextMenu={(e) => { e.preventDefault(); onMenu(e.currentTarget) }} title={name} className={`mx-auto flex h-[52px] w-[52px] items-center justify-center rounded-2xl transition-colors ${active ? 'bg-surface' : 'hover:bg-surface/70'}`}>{face}</button>
  return (
    <div className="group relative">
      <button onClick={onClick} onContextMenu={(e) => { e.preventDefault(); onMenu(e.currentTarget) }} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors ${active ? 'bg-surface' : 'hover:bg-surface/70'}`}>
        {face}
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2"><span className="truncate text-[16px] font-semibold text-ink">{name}</span><span className="ml-auto flex-none text-[13px] text-faint transition-opacity group-hover:opacity-0">{ts ? clock(ts) : ''}</span></span>
          <span className={`block truncate text-[14.5px] ${working ? 'shimmer font-medium' : 'text-mute'}`}>{working ? 'Working…' : preview}</span>
        </span>
      </button>
      <button onClick={(e) => { e.stopPropagation(); onMenu(e.currentTarget) }} aria-label={`Options for ${name}`} title="Options" className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full text-mute opacity-0 transition-opacity hover:bg-white hover:text-ink focus:opacity-100 group-hover:opacity-100"><MoreHorizontal size={18} /></button>
    </div>
  )
}

function Bubble({ m, group }: { m: CMsg; group: boolean }) {
  const me = m.who === 'me', p = personOf(m.who)
  if (!m.text && !m.thinking) return null
  if (me) return <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end"><div className="max-w-[78%] rounded-[20px] rounded-br-md bg-ink px-4 py-2.5 text-[16.5px] leading-snug text-white">{m.text}</div></motion.div>
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-3">
      {p && <Face av={p.av} size={34} plain />}
      <div className="min-w-0 max-w-[82%] pt-0.5">
        {group && p && <div className="mb-0.5 text-[13.5px] font-semibold text-mute">{p.name}</div>}
        <div className="text-[16.5px] leading-relaxed text-ink">
          {m.thinking ? <span className="flex items-center gap-2 text-faint"><Loader2 size={15} className="animate-spin" /><span className="shimmer">Thinking…</span></span> : <TypedMd k={`m${m.id}`} text={m.text} />}
          {m.flow && <button onClick={() => (window as any).__picked_workflow?.()} className="mt-2 flex items-center gap-1.5 rounded-full border border-line px-3.5 py-1.5 text-[14.5px] font-medium text-ink hover:bg-surface"><Workflow size={14} />Open the workflow</button>}
        </div>
      </div>
    </motion.div>
  )
}

const RUN_ITEMS: { icon: any; label: string; hint: string; fill?: string; run?: () => void; scene?: string }[] = [
  { icon: Sparkles, label: 'GEO Copilot for a business', hint: 'Find it online, check, draft fixes', fill: 'GEO for ', scene: 'copilot' },
  { icon: ScanSearch, label: 'Analyze any business', hint: 'X-ray of a website', fill: 'Analyze ', scene: 'xray' },
  { icon: Zap, label: 'Audit Elmich, quick', hint: 'On the saved Gemini answers', run: () => openRun(useChat.getState().active, { type: 'audit', brand: 'Elmich', fresh: false }), scene: 'audit' },
  { icon: Globe, label: 'Audit Elmich, fresh', hint: 'Real Gemini, about 4 minutes', run: () => openRun(useChat.getState().active, { type: 'audit', brand: 'Elmich', fresh: true }) },
  { icon: MessageSquare, label: 'Ask Gemini a buyer question', hint: 'One real Gemini answer', fill: 'Ask Gemini: ', scene: 'gemini' },
  { icon: Search, label: 'Review a page in the browser', hint: 'Open it on the right, score it', fill: 'Open elmich.vn and review it', scene: 'browser' },
  { icon: Zap, label: 'Compare with an SEO agency', hint: 'Measured times vs agency hours', run: () => openRun(useChat.getState().active, { type: 'savings' }), scene: 'cost' },
  { icon: Sparkles, label: 'Use the connected apps', hint: 'Agents call your MCP apps', fill: 'Use apps: ', scene: 'apps' },
]

function Composer({ thread }: { thread: string }) {
  const draft = useChat((s) => s.draft), [menu, setMenu] = useState(false), input = useRef<HTMLInputElement>(null)
  const set = (v: string) => useChat.setState({ draft: v })
  useEffect(() => { input.current?.focus() }, [thread])
  useEffect(() => { if (!menu) return; const k = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [menu])
  const send = () => { const t = draft.trim(); if (!t) return; set(''); setMenu(false); void sendTurn(thread, t) }
  const target = thread === 'all' ? ALL.name : personOf(thread)?.name
  return (
    <div className="relative">
      <AnimatePresence>
        {menu && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setMenu(false)} />
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.14 }} className="absolute bottom-[calc(100%+10px)] left-0 z-30 w-[min(460px,100%)] rounded-3xl border border-line bg-white p-2 shadow-[0_20px_60px_-30px_rgba(17,17,18,.35)]">
              
              {RUN_ITEMS.map((it) => (
                <button key={it.label} onClick={() => { setMenu(false); if (it.fill) { set(it.fill); input.current?.focus() } else it.run?.() }} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left hover:bg-surface">
                  <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-surface text-ink"><it.icon size={17} /></span>
                  <span className="min-w-0 flex-1"><span className="block text-[15.5px] font-semibold leading-tight text-ink">{it.label}</span><span className="block text-[13.5px] leading-tight text-mute">{it.hint}</span></span>
                  {it.scene && <span role="button" tabIndex={0} title="Play it automatically" onClick={(e) => { e.stopPropagation(); setMenu(false); void playScene(it.scene!) }} className="grid h-8 w-8 flex-none place-items-center rounded-full bg-surface text-ink hover:bg-line"><Play size={13} /></span>}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <form onSubmit={(e) => { e.preventDefault(); send() }} className="flex items-center gap-2 rounded-full border border-line bg-white p-2 pl-2.5 shadow-[0_10px_30px_-22px_rgba(17,17,18,.4)] focus-within:border-faint">
        <button type="button" onClick={() => setMenu((v) => !v)} className={`flex h-11 flex-none items-center gap-2 rounded-full px-4 text-[15.5px] font-semibold ${menu ? 'bg-ink text-white' : 'bg-surface text-ink hover:bg-line'}`}><Plus size={17} />Run<ChevronUp size={16} className={`transition-transform ${menu ? '' : 'rotate-180'}`} /></button>
        <input ref={input} value={draft} onChange={(e) => set(e.target.value)} onFocus={() => setMenu(false)} placeholder={`Message ${target}…`} className="h-11 min-w-0 flex-1 bg-transparent px-2 text-[16.5px] text-ink outline-none placeholder:text-faint" />
        <button disabled={!draft.trim()} className="grid h-11 w-11 flex-none place-items-center rounded-full bg-accent text-white hover:bg-[#0057b8] disabled:bg-line disabled:text-faint"><ArrowUp size={20} strokeWidth={2.6} /></button>
      </form>
    </div>
  )
}

/* Owner mode: the project is public; the controls that act on the server machine open with the owner's password. */
function OwnerBox({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [pw, setPw] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const go = async () => { setBusy(true); setErr(''); try { const r = await fetch('/api/owner/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: pw }) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); onDone() } catch (e: any) { setErr(e.message) } setBusy(false) }
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-[80] grid place-items-center bg-ink/30 p-4">
      <motion.form initial={{ y: 14 }} animate={{ y: 0 }} onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); void go() }} className="w-[420px] max-w-full rounded-[26px] border border-line bg-white p-6">
        <div className="flex items-center gap-2 text-[20px] font-semibold tracking-[-0.03em] text-ink"><Lock size={19} />Owner mode</div>
        <p className="mt-1 text-[15px] text-mute">Unlocks sign-in, the agent browser, schedules and stopping runs.</p>
        <input autoFocus type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Owner password" className="mt-4 h-12 w-full rounded-2xl border border-line px-4 text-[16px] outline-none focus:border-faint" />
        {err && <div className="mt-2 text-[14.5px] text-bad">{err}</div>}
        <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onClose} className="h-11 rounded-full px-5 text-[15px] font-semibold text-mute hover:bg-surface">Cancel</button><button disabled={!pw || busy} className="h-11 rounded-full bg-ink px-6 text-[15px] font-semibold text-white disabled:bg-line disabled:text-faint">{busy ? 'Checking…' : 'Unlock'}</button></div>
      </motion.form>
    </motion.div>
  )
}

function Chat({ thread, onEdit }: { thread: string; onEdit: (b: Bot) => void }) {
  const msgs = useChat((s) => s.threads[thread] ?? NONE), box = useRef<HTMLDivElement>(null), inner = useRef<HTMLDivElement>(null), stick = useRef(true)
  const p = thread === 'all' ? null : personOf(thread), group = thread === 'all', bot = botOf(thread)
  useLayoutEffect(() => { stick.current = true; const el = box.current; if (el) el.scrollTop = el.scrollHeight }, [thread])
  useEffect(() => {
    const el = box.current, c = inner.current; if (!el || !c) return
    const ro = new ResizeObserver(() => { if (stick.current && !useDemo.getState().cam) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }) })
    ro.observe(c); return () => ro.disconnect()
  }, [thread])
  // a new message from the operator always brings the conversation back to the bottom, gliding
  const mine = msgs.filter((m) => m.who === 'me').length
  useEffect(() => { const el = box.current; if (!el || !mine) return; stick.current = true; el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }) }, [mine])
  // when a job finishes, bring the top of its result into view instead of leaving the reader at the bottom of a long report
  const doneKey = msgs.filter((m) => m.run && m.res && !m.old).map((m) => m.id).join()
  useEffect(() => {
    const id = doneKey.split(',').filter(Boolean).pop(); const el = box.current; if (!id || !el) return
    const t = el.querySelector(`[data-mid="${id}"]`) as HTMLElement | null; if (!t) return
    stick.current = false; el.scrollTo({ top: t.offsetTop - el.offsetTop - 12, behavior: 'smooth' })
  }, [doneKey])
  const starters = bot?.starters ?? STARTERS[thread] ?? STARTERS.nan
  const empty = msgs.length === 0
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-[26px] border border-line bg-white">
      <header className="flex items-center gap-3 border-b border-line px-5 py-3">
        {p ? <Face av={p.av} size={40} plain /> : <GroupFaces size={40} />}
        <div className="min-w-0 flex-1"><div className="text-[17.5px] font-semibold leading-tight text-ink">{p ? p.name : ALL.name}</div><div className="truncate text-[14px] text-mute">{p ? `${p.role} · ${bot ? 'Custom agent' : ENGINE[p.id] ?? ''}` : ALL.role}</div></div>
        {bot && <button onClick={() => onEdit(bot)} title="Edit this agent" className="grid h-10 w-10 place-items-center rounded-full text-mute hover:bg-surface hover:text-ink"><Pencil size={17} /></button>}
        <button onClick={() => { if (!msgs.length || confirm(`Clear this conversation with ${p ? p.name : 'everyone'}?`)) clearThread(thread) }} disabled={!msgs.length} title="Clear conversation" aria-label="Clear conversation" className="flex h-10 items-center gap-2 rounded-full px-3.5 text-[14.5px] font-semibold text-mute hover:bg-surface hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent"><Eraser size={16} />Clear</button>
        <button onClick={() => useDemo.setState({ panel: true })} className="flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-[14.5px] font-semibold text-white hover:bg-black"><Play size={14} />Demo</button>
        <button onClick={() => useBrowser.setState((s) => ({ open: !s.open, control: false }))} className="flex h-10 items-center gap-2 rounded-full bg-surface px-4 text-[14.5px] font-semibold text-ink hover:bg-line"><Globe size={16} />Browser</button>
      </header>
      <div ref={box} onScroll={(e) => { const el = e.currentTarget; if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) stick.current = true }} onWheel={(e) => { if (e.deltaY < 0) stick.current = false }} onTouchMove={() => { stick.current = false }} className="min-h-0 flex-1 overflow-y-auto px-5 py-5 [scrollbar-width:thin]">
        <div ref={inner} className="mx-auto flex max-w-[900px] flex-col gap-4">
          {empty && (
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center py-12 text-center">
              {p ? <Face av={p.av} size={88} plain /> : <GroupFaces size={88} />}
              <div className="mt-4 text-[26px] font-semibold tracking-[-0.03em] text-ink">{p ? p.name : 'Everyone'}</div>
              <div className="mt-1.5 max-w-[480px] text-[16.5px] leading-snug text-mute">{greeting(thread)}</div>
              <div className="mt-5 flex flex-wrap justify-center gap-2">{starters.slice(0, 3).map((x, i) => <motion.button key={x} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 + 0.07 * i }} onClick={() => void sendTurn(thread, x)} className="rounded-full border border-line bg-white px-3.5 py-1.5 text-[14.5px] text-mute hover:border-faint hover:text-ink">{x}</motion.button>)}</div>
            </motion.div>
          )}
          {msgs.map((m) => (m.run ? <div key={m.id} data-mid={m.id} className="flex gap-3"><span className="w-[34px] flex-none" /><RunCard thread={thread} m={m} /></div> : <Bubble key={m.id} m={m} group={group} />))}
        </div>
      </div>
      <div className="px-5 pb-4 pt-1">
        <div className="mx-auto max-w-[900px]">
          <Composer thread={thread} />
        </div>
      </div>
    </section>
  )
}

/* New agent: say what it is for in a few words, the model writes the full prompt, you adjust it and keep it. */
const IDEAS = ['A keyword researcher for Vietnamese kitchenware', 'A blunt reviewer of product pages for AI search', 'A copywriter for Shopee listings in Vietnamese']
function NewBot({ edit, onClose }: { edit?: Bot; onClose: () => void }) {
  const [desc, setDesc] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState('')
  const [bot, setBot] = useState<Omit<Bot, 'id'> | null>(edit ? { name: edit.name, role: edit.role, soul: edit.soul, greeting: edit.greeting, starters: edit.starters, av: edit.av } : null)
  const faces = useMemo(() => (edit ? [edit.av, ...freeFaces()] : freeFaces()).slice(0, 10), [])
  const write = async () => {
    if (desc.trim().length < 6 || busy) return
    setBusy(true); setErr('')
    try { const b = await draftBot(desc.trim()); setBot({ ...b, av: bot?.av ?? freeFaces()[0] ?? BENCH[0] }) } catch (e: any) { setErr(/offline|Failed/i.test(String(e.message)) ? 'The team’s machine is switched off. Try again when it is on.' : String(e.message || e)) }
    setBusy(false)
  }
  const save = () => { if (!bot) return; const b = saveBot({ ...bot, id: edit?.id }); useChat.setState({ active: b.id }); onClose() }
  const field = 'w-full rounded-2xl border border-line bg-white px-4 py-2.5 text-[16px] text-ink outline-none focus:border-faint'
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-[70] grid place-items-center bg-ink/30 p-4 backdrop-blur-[2px]">
      <motion.div initial={{ y: 20, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 14 }} onClick={(e) => e.stopPropagation()} className="max-h-[calc(100dvh-32px)] w-[680px] max-w-full overflow-y-auto rounded-[28px] border border-line bg-white p-6 shadow-[0_40px_100px_-40px_rgba(17,17,18,.5)]">
        <div className="flex items-center"><div className="text-[22px] font-semibold tracking-[-0.03em] text-ink">{edit ? 'Edit agent' : 'New agent'}</div><button onClick={onClose} className="ml-auto grid h-9 w-9 place-items-center rounded-full text-mute hover:bg-surface"><X size={18} /></button></div>
        {!edit && (
          <>
            <p className="mt-1 text-[15.5px] text-mute">Say in a few words what it is for. The model writes the full prompt; you can change anything before you keep it.</p>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder="e.g. A keyword researcher for Vietnamese kitchenware who finds what buyers type into Google and Gemini" className={`${field} mt-3 resize-none`} />
            <div className="mt-2 flex flex-wrap gap-2">{IDEAS.map((i) => <button key={i} onClick={() => setDesc(i)} className="rounded-full border border-line px-3 py-1 text-[13.5px] text-mute hover:border-faint hover:text-ink">{i}</button>)}</div>
            <button onClick={write} disabled={desc.trim().length < 6 || busy} className="mt-4 flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[15.5px] font-semibold text-white disabled:bg-line disabled:text-faint">{busy ? <><Loader2 size={16} className="animate-spin" />Writing the prompt…</> : <><Sparkles size={16} />{bot ? 'Write it again' : 'Write the prompt'}</>}</button>
          </>
        )}
        {err && <div className="mt-3 rounded-2xl bg-surface px-4 py-3 text-[15px] text-bad">{err}</div>}
        {bot && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-5 space-y-4 border-t border-line pt-5">
            <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">{faces.map((a) => <button key={a} onClick={() => setBot({ ...bot, av: a })} className={`flex-none rounded-full p-0.5 ${bot.av === a ? 'ring-2 ring-ink' : 'ring-1 ring-line hover:ring-faint'}`}><Face av={a} size={40} plain /></button>)}</div>
            <div className="grid grid-cols-2 gap-3"><label className="block"><span className="mb-1 block text-[13.5px] font-semibold text-mute">Name</span><input value={bot.name} onChange={(e) => setBot({ ...bot, name: e.target.value.slice(0, 24) })} className={field} /></label><label className="block"><span className="mb-1 block text-[13.5px] font-semibold text-mute">Role</span><input value={bot.role} onChange={(e) => setBot({ ...bot, role: e.target.value.slice(0, 40) })} className={field} /></label></div>
            <label className="block"><span className="mb-1 block text-[13.5px] font-semibold text-mute">Prompt</span><textarea value={bot.soul} onChange={(e) => setBot({ ...bot, soul: e.target.value.slice(0, 1800) })} rows={9} className={`${field} resize-y text-[15px] leading-relaxed`} /></label>
            <div className="flex flex-wrap gap-2">{bot.starters.map((s) => <span key={s} className="rounded-full border border-line px-3 py-1 text-[13.5px] text-mute">{s}</span>)}</div>
            <div className="flex justify-end gap-2"><button onClick={onClose} className="h-11 rounded-full px-5 text-[15.5px] font-semibold text-mute hover:bg-surface">Cancel</button><button onClick={save} disabled={!bot.name.trim() || bot.soul.trim().length < 20} className="flex h-11 items-center gap-2 rounded-full bg-accent px-6 text-[15.5px] font-semibold text-white hover:bg-[#0057b8] disabled:bg-line disabled:text-faint"><Check size={17} strokeWidth={3} />{edit ? 'Save' : 'Create agent'}</button></div>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  )
}

export function Messenger({ onWorkflow }: { onWorkflow: () => void }) {
  const active = useChat((s) => s.active), threads = useChat((s) => s.threads), q = useChat((s) => s.q), last = useChat((s) => s.last)
  const bots = useBots((s) => s.bots), br = useBrowser((s) => s.open)
  const [own, setOwn] = useState<{ owner: boolean; viaTunnel: boolean } | null>(null), [ownBox, setOwnBox] = useState(false)
  const loadOwn = () => fetch('/api/owner').then((r) => r.json()).then(setOwn).catch(() => setOwn(null))
  useEffect(() => { void loadOwn() }, [])
  const [rowMenu, setRowMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const openRowMenu = (id: string, el: HTMLElement) => { const r = el.getBoundingClientRect(); setRowMenu({ id, x: Math.min(r.right - 12, window.innerWidth - 250), y: Math.min(r.top + 8, window.innerHeight - 140) }) }
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1'), [menu, setMenu] = useState(false), [editor, setEditor] = useState<{ edit?: Bot } | null>(null)
  // the extension hands a job over with ?ask=...: run it once, then clean the address
  useEffect(() => { const u = new URL(location.href), t = u.searchParams.get('ask'); if (!t) return; u.searchParams.delete('ask'); history.replaceState({}, '', u.pathname + u.search); setTimeout(() => void sendTurn('all', t.slice(0, 500)), 600) }, [])
  useEffect(() => { (window as any).__picked_workflow = onWorkflow; return () => { delete (window as any).__picked_workflow } }, [onWorkflow])
  useEffect(() => { if (!menu) return; const k = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [menu])
  const flip = () => setCollapsed((v) => { localStorage.setItem(COLLAPSE_KEY, v ? '0' : '1'); return !v })
  const rows = useMemo(() => {
    const all = [{ id: 'all', name: ALL.name }, ...TEAM.map((p) => ({ id: p.id, name: p.name })), ...bots.map((b) => ({ id: b.id, name: b.name }))]
    const f = q.trim().toLowerCase()
    return all.filter((r) => !f || r.name.toLowerCase().includes(f) || (personOf(r.id)?.role ?? '').toLowerCase().includes(f))
  }, [q, bots])
  const info = (id: string) => {
    const ms = threads[id] ?? [], m = [...ms].reverse().find((x) => x.text || x.run)
    const working = ms.some((x) => x.run && (!x.res || (x.run.kind === 'copilot' && ['find', 'checking'].includes(x.res.copilot?.stage))))
    const preview = String(m ? (m.run ? (m.run.kind === 'xray' ? `X-ray of ${m.run.input}` : m.run.kind === 'audit' ? `Audit ${m.run.act.brand ?? ''}` : m.run.kind === 'copilot' ? `GEO Copilot · ${m.run.input}` : m.run.kind === 'team' ? `Team job · ${m.run.input}` : 'Real job') : (m.who === 'me' ? 'You: ' : '') + m.text) : id === 'all' ? greeting('all') : (personOf(id)?.role ?? '')).replace(/\*\*/g, '')
    return { preview, ts: m?.ts ?? last[id], working }
  }
  const items: { icon: any; label: string; run: () => void; scene?: string }[] = [
    { icon: Play, label: 'Stage demo (autopilot)', run: () => useDemo.setState({ panel: true }) },
    { icon: Plus, label: 'New agent', run: () => setEditor({}), scene: 'agent' },
    ...(own?.viaTunnel ? [{ icon: own.owner ? Unlock : Lock, label: own.owner ? 'Owner mode: on (lock)' : 'Unlock owner mode', run: () => (own.owner ? void fetch('/api/owner/logout', { method: 'POST' }).then(loadOwn) : setOwnBox(true)) }] : []),
    { icon: ScanSearch, label: 'Business X-ray', run: () => { useChat.setState({ draft: 'Analyze ' }); setTimeout(() => document.querySelector<HTMLInputElement>('input[placeholder^="Message"]')?.focus(), 0) }, scene: 'xray' },
    { icon: Globe, label: 'Browser', run: () => useBrowser.setState({ open: true, control: false }), scene: 'browser' },
    { icon: LayoutGrid, label: 'Connected apps', run: () => useApps.setState({ open: true }), scene: 'apps' },
    { icon: Workflow, label: 'Workflow (simulation)', run: onWorkflow, scene: 'workflow' },
    { icon: BookOpen, label: 'Story', run: () => useStory.setState({ open: true, slide: 0 }), scene: 'story' },
  ]
  return (
    <motion.main className="absolute inset-0 z-50 flex gap-3 overflow-hidden bg-surface p-3 text-ink" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
      <motion.aside animate={{ width: collapsed ? 76 : 340 }} transition={{ type: 'spring', stiffness: 320, damping: 36 }} className="relative flex flex-none flex-col rounded-[26px] border border-line bg-white p-2.5">
        <div className={`flex items-center ${collapsed ? 'flex-col gap-2 pb-2' : 'gap-2.5 px-1.5 pb-2.5 pt-1'}`}>
          <a href="/" aria-label="Picked home" className="flex items-center gap-2 text-[22px] font-bold tracking-[-0.06em] text-ink no-underline"><span className="grid h-8 w-8 flex-none place-items-center rounded-[10px] bg-ink text-white"><Check size={18} strokeWidth={3} /></span>{!collapsed && <span>picked<span className="text-accent">.</span></span>}</a>
          <button onClick={() => setEditor({})} title="New agent" className={`${collapsed ? '' : 'ml-auto'} grid h-9 w-9 place-items-center rounded-full bg-surface text-ink hover:bg-line`}><Plus size={18} /></button>
        </div>
        {!collapsed && <label className="mb-2 flex h-10 items-center gap-2.5 rounded-full bg-surface px-3.5 text-faint"><Search size={16} /><input value={q} onChange={(e) => useChat.setState({ q: e.target.value })} placeholder="Search" className="min-w-0 flex-1 bg-transparent text-[15.5px] text-ink outline-none placeholder:text-faint" />{q && <button type="button" onClick={() => useChat.setState({ q: '' })}><X size={14} /></button>}</label>}
        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto [scrollbar-width:none]">
          {rows.map((r) => { const i = info(r.id); return <Row key={r.id} id={r.id} name={r.name} preview={i.preview} ts={i.ts} working={i.working} active={active === r.id} collapsed={collapsed} onClick={() => useChat.setState({ active: r.id })} onMenu={(el) => openRowMenu(r.id, el)} /> })}
          {!rows.length && <div className="px-4 py-8 text-center text-[15px] text-faint">No agent matches “{q}”.</div>}
        </div>
        <div className={`relative mt-2 flex items-center border-t border-line pt-2 ${collapsed ? 'flex-col gap-1.5' : 'justify-between px-1'}`}>
          <button onClick={() => setMenu((v) => !v)} title="Menu" className={`grid h-10 w-10 place-items-center rounded-full text-ink ${menu ? 'bg-surface' : 'hover:bg-surface'}`}><Menu size={20} /></button>
          {!collapsed && <span className="flex items-center gap-1.5 text-[13.5px] text-faint"><Users size={14} />{TEAM.length + bots.length} agents</span>}
          <button onClick={flip} title={collapsed ? 'Expand' : 'Collapse'} className="grid h-10 w-10 place-items-center rounded-full text-mute hover:bg-surface hover:text-ink">{collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}</button>
          <AnimatePresence>
            {menu && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setMenu(false)} />
                <motion.div initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.14 }} className="absolute bottom-[calc(100%+8px)] left-0 z-30 w-[250px] rounded-3xl border border-line bg-white p-2 shadow-[0_20px_60px_-30px_rgba(17,17,18,.35)]">
                  {items.map((it) => <button key={it.label} onClick={() => { setMenu(false); it.run() }} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-[15.5px] font-medium text-ink hover:bg-surface"><it.icon size={18} className="text-mute" /><span className="flex-1">{it.label}</span>{it.scene && <span role="button" tabIndex={0} title="Play it automatically" onClick={(e) => { e.stopPropagation(); setMenu(false); void playScene(it.scene!) }} className="grid h-7 w-7 flex-none place-items-center rounded-full bg-surface text-ink hover:bg-line"><Play size={12} /></span>}</button>)}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </motion.aside>
      <Chat key={active} thread={active} onEdit={(b) => setEditor({ edit: b })} />
      <AnimatePresence>
        {br && <motion.div key="br" initial={{ width: '0vw', opacity: 0 }} animate={{ width: '38vw', opacity: 1 }} exit={{ width: '0vw', opacity: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 32 }} className="min-h-0 flex-none overflow-hidden"><div className="h-full w-[38vw]"><BrowserPanel docked /></div></motion.div>}
      </AnimatePresence>
      <AnimatePresence>
        {rowMenu && (() => { const id = rowMenu.id, p = id === 'all' ? null : personOf(id), who = p?.name ?? 'Everyone', custom = isCustom(id), has = (threads[id] ?? []).length > 0; return (
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setRowMenu(null)} onContextMenu={(e) => { e.preventDefault(); setRowMenu(null) }} />
            <motion.div key="rm" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} style={{ left: rowMenu.x, top: rowMenu.y }} className="fixed z-[61] w-[236px] rounded-2xl border border-line bg-white p-1.5 shadow-[0_20px_60px_-28px_rgba(17,17,18,.45)]">
              <button disabled={!has} onClick={() => { setRowMenu(null); if (confirm(`Clear the conversation with ${who}?`)) clearThread(id) }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] font-medium text-ink hover:bg-surface disabled:opacity-40 disabled:hover:bg-transparent"><Eraser size={17} className="text-mute" />Clear conversation</button>
              {custom && <button onClick={() => { setRowMenu(null); const b = botOf(id); if (b && confirm(`Delete the agent ${b.name} and its conversation? This cannot be undone.`)) removeBot(id) }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] font-medium text-bad hover:bg-surface"><Trash2 size={17} />Delete agent</button>}
              {!custom && id !== 'all' && <div className="px-3 pb-1.5 pt-1 text-[12.5px] leading-snug text-faint">{who} is part of the core team and cannot be deleted.</div>}
            </motion.div>
          </>) })()}
      </AnimatePresence>
      <AnimatePresence>{ownBox && <OwnerBox key="ob" onClose={() => setOwnBox(false)} onDone={() => { setOwnBox(false); void loadOwn() }} />}</AnimatePresence>
      <AnimatePresence>{editor && <NewBot key="nb" edit={editor.edit} onClose={() => setEditor(null)} />}</AnimatePresence>
    </motion.main>
  )
}
