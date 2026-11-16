import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { AnimatePresence, motion } from 'motion/react'
import { Check, ChevronDown, Plug, Search, Trash2, X } from 'lucide-react'

/* Apps: connect MCP servers once, then choose which agents may use them. All state lives on the backend. */
type Req = { key: string; label: string }
type App = { id: string; name: string; group: string; blurb: string; icon?: string; requires: Req[] }
type Server = { name: string; status: 'stopped' | 'starting' | 'ready' | 'failed'; toolCount: number; error?: string; envKeys: string[]; command: string }
export const useApps = create<{ open: boolean; catalog: App[]; servers: Server[]; scopes: Record<string, string[]>; loaded: boolean }>(() => ({ open: false, catalog: [], servers: [], scopes: {}, loaded: false }))

const call = async (url: string, method = 'GET', body?: any) => {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(r.status === 403 ? 'Only the machine running Picked can change apps.' : j.error || `HTTP ${r.status}`)
  return j
}
export const refreshApps = () => call('/api/mcp/catalog').then((j) => useApps.setState({ catalog: j.catalog, servers: j.servers, scopes: j.scopes, loaded: true })).catch(() => useApps.setState({ loaded: false }))

export function Apps() {
  const { open, catalog, servers, scopes, loaded } = useApps()
  const [q, setQ] = useState(''), [form, setForm] = useState<string>(''), [env, setEnv] = useState<Record<string, string>>({}), [busy, setBusy] = useState(''), [err, setErr] = useState(''), [tools, setTools] = useState<Record<string, any[]>>({}), [openTools, setOpenTools] = useState('')
  useEffect(() => { if (open) refreshApps() }, [open])
  const live = (id: string) => servers.find((s) => s.name === id)
  const nanAllows = (id: string) => (scopes.nan ?? []).some((p) => p === `mcp:${id}:*` || p === 'mcp:*')
  const wrap = async (key: string, fn: () => Promise<any>) => { setBusy(key); setErr(''); try { await fn(); await refreshApps() } catch (e: any) { setErr(e.message) } setBusy('') }
  const connect = (a: App) => wrap(a.id, async () => { await call('/api/mcp/install', 'POST', { id: a.id, env }); setForm(''); setEnv({}) })
  const toggle = (id: string) => wrap('scope-' + id, () => call('/api/mcp/scopes', 'PUT', { agent: 'nan', scopes: nanAllows(id) ? (scopes.nan ?? []).filter((p) => p !== `mcp:${id}:*`) : [...(scopes.nan ?? []), `mcp:${id}:*`] }))
  const showTools = async (id: string) => { setOpenTools(openTools === id ? '' : id); if (!tools[id]) setTools({ ...tools, [id]: await call(`/api/mcp/servers/${id}/tools`).then((j) => j.tools).catch(() => []) }) }
  const groups = [...new Set(catalog.map((a) => a.group))]
  const match = (a: App) => !q || (a.name + a.blurb + a.group).toLowerCase().includes(q.toLowerCase())
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => useApps.setState({ open: false })} className="absolute inset-0 z-40 grid place-items-center bg-slate-900/25 backdrop-blur-sm">
          <motion.div initial={{ y: 24, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 24 }} onClick={(e) => e.stopPropagation()} className="flex max-h-[88%] w-[920px] max-w-[94%] flex-col rounded-[26px] border border-slate-200 bg-white shadow-[0_50px_120px_-30px_rgba(15,23,42,.5)]">
            <div className="flex items-center gap-2 px-6 pt-5"><Plug size={18} className="text-indigo-600" /><span className="text-[18px] font-semibold tracking-tight">Apps</span><span className="ml-2 text-[12px] text-slate-400">{servers.filter((s) => s.status === 'ready').length} connected</span><button onClick={() => useApps.setState({ open: false })} className="ml-auto grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-slate-100"><X size={16} /></button></div>
            <div className="px-6 pt-1 text-[12.5px] text-slate-500">{catalog.length} apps run as MCP servers on this machine. Connect once, then choose which agents may use each one.</div>
            <div className="px-6 pt-3"><div className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-indigo-400"><Search size={15} className="text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search apps" className="h-full min-w-0 flex-1 bg-transparent text-[13.5px] outline-none" /></div></div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5">
              {!loaded && <div className="py-10 text-center text-[13px] text-slate-400">The backend is off, so apps cannot be listed.</div>}
              {err && <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900">{err}</div>}
              {groups.map((g) => {
                const items = catalog.filter((a) => a.group === g && match(a)); if (!items.length) return null
                return (
                  <div key={g} className="mt-4">
                    <div className="text-[12px] font-semibold text-slate-800">{g}</div>
                    <div className="mt-1.5 grid grid-cols-3 gap-x-5">
                      {items.map((a) => {
                        const s = live(a.id), ready = s?.status === 'ready'
                        return (
                          <div key={a.id} className="border-b border-slate-100 py-2.5">
                            <div className="flex items-center gap-3">
                              <div className="grid h-11 w-11 flex-none place-items-center rounded-xl border border-slate-100 bg-white shadow-sm">{a.icon ? <img src={a.icon} alt="" className="h-6 w-6 object-contain" /> : <span className="text-[14px] font-bold text-slate-400">{a.name[0]}</span>}</div>
                              <div className="min-w-0 flex-1"><div className="text-[13.5px] font-semibold text-slate-800">{a.name}</div><div className="truncate text-[11.5px] text-slate-500">{ready ? `${s!.toolCount} tools ready` : a.blurb}</div></div>
                              {ready ? <button onClick={() => wrap('rm-' + a.id, () => call(`/api/mcp/servers/${a.id}`, 'DELETE'))} title="Disconnect" className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14} /></button>
                                : <button disabled={!!busy} onClick={() => (a.requires.length ? setForm(form === a.id ? '' : a.id) : connect(a))} className="h-8 rounded-full border border-slate-200 px-3.5 text-[12.5px] font-semibold text-slate-700 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50">{busy === a.id ? 'Starting…' : 'Connect'}</button>}
                            </div>
                            {form === a.id && !ready && (
                              <div className="mt-2 space-y-1.5 rounded-xl bg-slate-50 p-2.5">
                                {a.requires.map((r) => <input key={r.key} type="password" value={env[r.key] ?? ''} onChange={(e) => setEnv({ ...env, [r.key]: e.target.value })} placeholder={r.label} className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[12.5px] outline-none focus:border-indigo-400" />)}
                                <button onClick={() => connect(a)} disabled={!!busy} className="h-8 w-full rounded-lg bg-indigo-600 text-[12.5px] font-semibold text-white disabled:opacity-50">{busy === a.id ? 'Starting…' : 'Save and connect'}</button>
                                <div className="text-[10.5px] leading-snug text-slate-400">Stored only on this machine, in a file only you can read. Never sent to the page.</div>
                              </div>
                            )}
                            {ready && (
                              <div className="mt-1.5 flex items-center gap-2 pl-[52px] text-[11.5px] text-slate-500">
                                <button onClick={() => toggle(a.id)} disabled={!!busy} className={`relative h-[18px] w-8 flex-none rounded-full transition-colors ${nanAllows(a.id) ? 'bg-emerald-500' : 'bg-slate-300'}`}><span className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-all ${nanAllows(a.id) ? 'left-[16px]' : 'left-[2px]'}`} /></button>NaN may use
                                <button onClick={() => showTools(a.id)} className="ml-auto flex items-center gap-0.5 font-semibold text-slate-400 hover:text-slate-600">Tools<ChevronDown size={12} className={openTools === a.id ? 'rotate-180' : ''} /></button>
                              </div>
                            )}
                            {openTools === a.id && <div className="mt-1.5 flex flex-wrap gap-1 pl-[52px]">{(tools[a.id] ?? []).map((t: any) => <span key={t.name} className="rounded-full bg-slate-100 px-1.5 py-px font-mono text-[10px] text-slate-500">{t.name}</span>)}</div>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
              {servers.filter((s) => !catalog.some((a) => a.id === s.name)).map((s) => <div key={s.name} className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[12.5px]"><Check size={13} className="text-emerald-500" /><b>{s.name}</b><span className="text-slate-400">{s.toolCount} tools</span></div>)}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
