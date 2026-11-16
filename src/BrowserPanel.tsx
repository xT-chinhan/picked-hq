import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, Globe, Hand, RotateCw, ScanSearch, X } from 'lucide-react'

/* Browser room: watch the real pages the agents drive (Gemini tabs, pages NaN opens) and take control when needed. */
type Tab = { id: string; kind: 'gemini' | 'web'; q: string; url: string; title: string; status: string; help: string | null }
type Check = { id: string; status: 'pass' | 'warn' | 'fail'; label: string; detail: string }
export const useBrowser = create<{ open: boolean; tab: string; tabs: Tab[]; control: boolean; review: { score: number; checks: Check[]; summary: string } | null; err: string }>(() => ({ open: false, tab: '', tabs: [], control: false, review: null, err: '' }))
const W = 1280, H = 860

const post = async (url: string, body?: any) => {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(r.status === 403 ? 'Only the machine running Picked can do this.' : j.error || `HTTP ${r.status}`)
  return j
}
export const openPage = async (url: string) => {
  const { id } = await post('/api/browser/open', { url })
  useBrowser.setState({ open: true, tab: id, control: false, review: null, err: '' }); return id as string
}
export const reviewTab = (id: string) => post(`/api/browser/${id}/review`)

const KEYS = new Set(['Enter', 'Backspace', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Delete', 'Home', 'End', 'PageUp', 'PageDown'])
const STATUS: Record<string, string> = { working: 'Working', done: 'Done', ready: 'Ready', failed: 'Failed', 'needs-help': 'Needs your help' }

function Frame({ id, control }: { id: string; control: boolean }) {
  const img = useRef<HTMLImageElement>(null), [live, setLive] = useState(false)
  useEffect(() => {
    setLive(false)
    const es = new EventSource(`/api/browser/stream?tab=${encodeURIComponent(id)}`)
    es.onmessage = (m) => {
      const ev = JSON.parse(m.data)
      if (ev.type === 'tabs') useBrowser.setState({ tabs: ev.tabs })
      else if (ev.type === 'frame' && ev.id === id && img.current) { img.current.src = `data:image/jpeg;base64,${ev.img}`; setLive(true) }
    }
    return () => es.close()
  }, [id])
  const send = (action: any) => post(`/api/browser/${id}/input`, action).catch((e) => useBrowser.setState({ err: e.message }))
  const at = (e: React.MouseEvent) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H } }
  return (
    <div className={`relative overflow-hidden rounded-xl border bg-slate-50 ${control ? 'border-indigo-400 ring-4 ring-indigo-100' : 'border-slate-200'}`} style={{ aspectRatio: `${W} / ${H}` }}
      tabIndex={control ? 0 : -1} onClick={(e) => control && send({ type: 'click', ...at(e) })} onWheel={(e) => control && send({ type: 'scroll', dy: e.deltaY })}
      onKeyDown={(e) => { if (!control || e.metaKey || e.ctrlKey) return; if (KEYS.has(e.key)) { e.preventDefault(); send({ type: 'key', key: e.key }) } else if (e.key.length === 1) { e.preventDefault(); send({ type: 'type', text: e.key }) } }}>
      <img ref={img} alt="" draggable={false} className={`h-full w-full select-none object-cover object-top ${live ? '' : 'opacity-0'}`} />
      {!live && <div className="absolute inset-0 grid place-items-center text-[13px] text-slate-400"><span className="spinner" />&nbsp;Connecting to the page…</div>}
      <span className="pointer-events-none absolute right-2 top-2 flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow">{control ? <><Hand size={12} className="text-indigo-600" />You're in control</> : <><span className="live-dot" />Watching</>}</span>
    </div>
  )
}

export function BrowserPanel() {
  const { open, tab, tabs, control, review, err } = useBrowser()
  const [url, setUrl] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open) return
    const es = new EventSource('/api/browser/stream') // tab list only
    es.onmessage = (m) => { const ev = JSON.parse(m.data); if (ev.type === 'tabs') useBrowser.setState((s) => ({ tabs: ev.tabs, tab: ev.tabs.some((t: Tab) => t.id === s.tab) ? s.tab : ev.tabs[0]?.id ?? '' })) }
    return () => es.close()
  }, [open])
  const cur = tabs.find((t) => t.id === tab)
  useEffect(() => { setUrl(cur?.url ?? '') }, [cur?.id])
  const go = async () => {
    if (!url.trim() || busy) return
    setBusy(true); useBrowser.setState({ err: '' })
    try {
      const u = /^[a-z]+:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`
      if (cur?.kind === 'web') await post(`/api/browser/${cur.id}/input`, { type: 'goto', url: u }); else await openPage(u)
    } catch (e: any) { useBrowser.setState({ err: e.message }) }
    setBusy(false)
  }
  const doReview = async () => {
    if (!cur || busy) return
    setBusy(true); useBrowser.setState({ err: '', review: null })
    try { useBrowser.setState({ review: await reviewTab(cur.id) }) } catch (e: any) { useBrowser.setState({ err: e.message }) }
    setBusy(false)
  }
  const icon = { pass: '#16a34a', warn: '#d97706', fail: '#e11d48' }
  return (
    <AnimatePresence>
      {open && (
        <motion.aside initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 32 }} className="absolute bottom-[68px] left-1/2 z-30 flex max-h-[calc(100%-84px)] w-[760px] -translate-x-1/2 flex-col overflow-hidden rounded-[22px] border border-slate-200 bg-white/97 shadow-[0_40px_100px_-30px_rgba(15,23,42,.5)] backdrop-blur-xl">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5"><Globe size={16} className="text-sky-600" /><span className="text-[14px] font-semibold tracking-tight">Browser</span>
            <div className="ml-2 flex min-w-0 flex-1 gap-1 overflow-x-auto">{tabs.map((t) => <button key={t.id} onClick={() => useBrowser.setState({ tab: t.id, control: false, review: null })} className={`flex max-w-[190px] flex-none items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium ${t.id === tab ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{t.status === 'needs-help' ? <Hand size={11} className="text-amber-400" /> : <span className={`h-1.5 w-1.5 rounded-full ${t.status === 'working' ? 'bg-indigo-400' : 'bg-emerald-400'}`} />}<span className="truncate">{t.kind === 'gemini' ? `Gemini · ${t.q.slice(0, 22) || t.id}` : t.title || t.url.replace(/^https?:\/\//, '')}</span></button>)}</div>
            <button onClick={() => useBrowser.setState({ open: false, control: false })} className="grid h-7 w-7 flex-none place-items-center rounded-full text-slate-400 hover:bg-slate-100"><X size={15} /></button></div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="mb-2 flex items-center gap-1.5">
              {cur?.kind === 'web' && <><button title="Back" onClick={() => post(`/api/browser/${cur.id}/input`, { type: 'back' })} className="grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100"><ArrowLeft size={15} /></button><button title="Reload" onClick={() => post(`/api/browser/${cur.id}/input`, { type: 'reload' })} className="grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100"><RotateCw size={14} /></button></>}
              <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} placeholder="Open a page… e.g. elmich.vn" className="h-8 min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-50 px-3.5 text-[12.5px] outline-none focus:border-indigo-400" />
              {cur && <button onClick={() => useBrowser.setState({ control: !control })} className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold ${control ? 'bg-indigo-600 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}><Hand size={13} />{control ? 'Hand back' : 'Take control'}</button>}
              {cur?.kind === 'web' && <button onClick={doReview} disabled={busy} className="flex h-8 items-center gap-1.5 rounded-full bg-slate-900 px-3 text-[12px] font-semibold text-white disabled:opacity-50"><ScanSearch size={13} />{busy ? 'Reading…' : 'Review for AI'}</button>}
            </div>
            {cur ? <Frame key={cur.id} id={cur.id} control={control} /> : <div className="grid place-items-center rounded-xl border border-dashed border-slate-300 py-16 text-center text-[13px] text-slate-400"><Globe size={26} className="mb-2" />No page is open.<br />Type an address above, or run a Fresh audit to watch real Gemini tabs.</div>}
            {cur && <div className="mt-1.5 flex items-center gap-2 text-[11.5px] text-slate-500"><span className="font-semibold text-slate-700">{STATUS[cur.status] ?? cur.status}</span><span className="truncate">{cur.url}</span>{cur.help && <span className="rounded-full bg-amber-100 px-2 py-px font-semibold text-amber-800">{cur.help}</span>}</div>}
            {err && <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900">{err}</div>}
            {review && (
              <div className="mt-3 rounded-2xl border border-slate-200 p-3">
                <div className="flex items-baseline gap-2"><span className="text-[26px] font-semibold leading-none tracking-tight" style={{ color: review.score >= 70 ? '#16a34a' : review.score >= 45 ? '#d97706' : '#e11d48' }}>{review.score}<span className="text-slate-300">/100</span></span><span className="text-[12.5px] text-slate-500">{review.summary}</span></div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">{review.checks.map((c) => <div key={c.id} className="flex items-start gap-1.5 text-[11.5px] leading-snug"><span className="mt-[5px] h-1.5 w-1.5 flex-none rounded-full" style={{ background: icon[c.status] }} /><span><b className="font-semibold text-slate-700">{c.label}</b> <span className="text-slate-400">{c.detail}</span></span></div>)}</div>
              </div>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
