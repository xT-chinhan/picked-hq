import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { AlertTriangle, Check, ChevronDown, Copy, Download, ExternalLink, Loader2, LogIn, LogOut, Minus, Plus, ScanSearch, X } from 'lucide-react'
import { Gauge, Eyebrow } from './report'
import { useBrowser } from './BrowserPanel'
import { openRun, patch, type CMsg } from './chat'

/* GEO Copilot, in the chat: find the business online, the owner confirms the places, every place is checked against the others,
   and the fixes are drafted as files the owner approves one by one. Nothing is published or posted from here. */
type Source = { id: string; kind: string; label: string; url: string; status: string; note?: string; inSameAs?: boolean; on?: boolean; facts?: { title: string; words: number }; session?: 'open' | 'reading' | 'read' | 'error' }
type Check_ = { id: string; status: 'pass' | 'warn' | 'fail'; label: string; detail: string }
type Fix = { id: string; file: string; where: string; why: string; hours: number; before: string; after: string }
type State = { stage: 'find' | 'confirm' | 'checking' | 'done' | 'error'; url?: string; host?: string; name?: string; blocked?: boolean; sources?: Source[]; brand?: string; score?: number; checks?: Check_[]; patches?: Fix[]; approved?: string[]; err?: string }

const post = async (url: string, body: any) => { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); return j }
const started = new Set<number>()
const RATE = 30 // the same default rate as the agency comparison; the comparison card lets the owner change it

function Steps({ lines }: { lines: string[] }) {
  const [i, setI] = useState(0)
  useEffect(() => { const t = setInterval(() => setI((n) => Math.min(lines.length - 1, n + 1)), 2200); return () => clearInterval(t) }, [])
  return <div className="space-y-1.5">{lines.slice(0, i + 1).map((l, k) => <motion.div key={k} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2.5 text-[15.5px]">{k < i ? <Check size={15} strokeWidth={3} className="text-ok" /> : <Loader2 size={15} className="animate-spin text-accent" />}<span className={k < i ? 'text-faint' : 'shimmer font-medium'}>{l}</span></motion.div>)}</div>
}
const icon = (s: string) => (s === 'pass' ? <Check size={15} strokeWidth={3.5} className="text-ok" /> : s === 'warn' ? <Minus size={15} strokeWidth={3.5} className="text-warn" /> : <X size={15} strokeWidth={3.5} className="text-bad" />)

export function CopilotCard({ thread, m }: { thread: string; m: CMsg }) {
  const input = (m.run as any).input as string
  const [st, setSt] = useState<State>(() => m.res?.copilot ?? { stage: 'find' })
  const save = (s: State) => { setSt(s); patch(thread, m.id, { res: { copilot: s, ...(s.stage === 'done' || s.stage === 'error' ? { done: true } : {}) } }) }
  useEffect(() => {
    if (started.has(m.id) || m.res?.copilot) return; started.add(m.id)
    post('/api/copilot/discover', { input }).then((f) => save({ stage: 'confirm', url: f.url, host: f.host, name: f.name, blocked: f.blocked, sources: f.sources.map((s: Source) => ({ ...s, on: true })) })).catch((e) => save({ stage: 'error', err: e.message }))
  }, [])
  const setSrc = (id: string, p: Partial<Source>) => save({ ...st, sources: st.sources!.map((s) => (s.id === id ? { ...s, ...p } : s)) })
  const check = async () => {
    const s0 = { ...st, stage: 'checking' as const }; setSt(s0)
    try { const r = await post('/api/copilot/check', { url: st.url, sources: st.sources!.filter((s) => s.on && s.kind !== 'website').map((s) => ({ url: s.url, label: s.label, facts: s.facts })) }); save({ ...s0, stage: 'done', brand: r.brand, score: r.score, checks: r.checks, patches: r.patches, approved: [] }) }
    catch (e: any) { save({ ...st, stage: 'confirm', err: e.message }) }
  }

  if (st.stage === 'error') return <div className="rounded-2xl bg-surface p-4 text-[15.5px] text-bad">{st.err}</div>
  if (st.stage === 'find') return <Steps lines={[`Looking up ${input}…`, 'Reading the homepage and its declared identity…', 'Collecting the profiles and marketplaces it links to…']} />
  if (st.stage === 'confirm' || st.stage === 'checking') return <Confirm st={st} setSrc={setSrc} add={(url) => { try { const u = new URL(/^https?:/.test(url) ? url : `https://${url}`); save({ ...st, sources: [...st.sources!, { id: `owner-${u.hostname}${st.sources!.length}`, kind: 'link', label: u.hostname.replace(/^www\./, ''), url: u.href, status: 'owner', on: true }] }) } catch { /* not a link */ } }} onCheck={check} busy={st.stage === 'checking'} />
  return <Result st={st} save={save} />
}

/* ───────────── step 2: the owner confirms the places ───────────── */
function Confirm({ st, setSrc, add, onCheck, busy }: { st: State; setSrc: (id: string, p: Partial<Source>) => void; add: (url: string) => void; onCheck: () => void; busy: boolean }) {
  const [link, setLink] = useState('')
  return (
    <div>
      <Eyebrow>Is this you? · {st.host}</Eyebrow>
      <p className="mt-1.5 text-[15.5px] leading-snug text-mute">These are the places the website points to. Untick anything that is not yours and add what is missing. Nothing is checked until you confirm.</p>
      {st.blocked && <div className="mt-3 flex gap-2 rounded-2xl bg-surface p-3 text-[14.5px] text-warn"><AlertTriangle size={16} className="mt-0.5 flex-none" />The website turned our reader away, so the places it links to are unknown. Add them by hand.</div>}
      <div className="mt-3 divide-y divide-line overflow-hidden rounded-[18px] ring-1 ring-line">
        {st.sources!.map((s) => <SourceRow key={s.id} s={s} setSrc={setSrc} />)}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (link.trim()) { add(link.trim()); setLink('') } }} className="mt-2.5 flex gap-2"><input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Add a page that is yours: a Google Maps place, a Shopee shop…" className="h-10 min-w-0 flex-1 rounded-full border border-line px-4 text-[15px] outline-none focus:border-faint" /><button className="flex h-10 items-center gap-1.5 rounded-full bg-surface px-4 text-[14.5px] font-semibold text-ink hover:bg-line"><Plus size={15} />Add</button></form>
      {st.err && <div className="mt-2 text-[14.5px] text-bad">{st.err}</div>}
      <button onClick={onCheck} disabled={busy} className="mt-4 flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[15.5px] font-semibold text-white disabled:opacity-60">{busy ? <><Loader2 size={16} className="animate-spin" />Checking every place against the others…</> : <><Check size={16} strokeWidth={3} />These are mine, check them</>}</button>
    </div>
  )
}

/* one place; a social page can be read in the owner's own signed-in profile, after the owner approves the read */
function SourceRow({ s, setSrc }: { s: Source; setSrc: (id: string, p: Partial<Source>) => void }) {
  const [plan, setPlan] = useState(false), [err, setErr] = useState('')
  const social = ['facebook', 'instagram', 'tiktok', 'zalo', 'youtube', 'linkedin', 'x', 'shopee', 'lazada', 'tiki', 'maps'].includes(s.kind)
  const slug = s.kind === 'link' ? s.label : s.kind
  const signIn = async () => { setErr(''); try { const { id } = await post(`/api/sessions/${encodeURIComponent(slug.replace(/[^\w-]/g, '-'))}/open`, { url: s.url }); useBrowser.setState({ open: true, tab: id, control: true, review: null }); setSrc(s.id, { session: 'open' }); setPlan(true) } catch (e: any) { setErr(/local only/.test(e.message) ? 'Signing in works on the machine running Picked only.' : e.message) } }
  const read = async () => {
    setErr(''); setSrc(s.id, { session: 'reading' })
    try { const r = await post(`/api/sessions/${encodeURIComponent(slug.replace(/[^\w-]/g, '-'))}/read`, { url: s.url, approved: true, more: 2 }); const p0 = r.pages?.[0]; setSrc(s.id, { session: 'read', status: r.signedIn ? 'read' : 'login needed', facts: { title: p0?.title || '', words: (r.pages || []).reduce((n: number, p: any) => n + String(p.text || '').split(/\s+/).filter(Boolean).length, 0) } }); setPlan(false) }
    catch (e: any) { setSrc(s.id, { session: 'error' }); setErr(e.message) }
  }
  const signOut = async () => { await fetch(`/api/sessions/${encodeURIComponent(slug.replace(/[^\w-]/g, '-'))}`, { method: 'DELETE' }).catch(() => {}); setSrc(s.id, { session: undefined, facts: undefined, status: 'link' }) }
  return (
    <div className={`px-3.5 py-2.5 ${s.on ? '' : 'opacity-50'}`}>
      <div className="flex items-center gap-3">
        <input type="checkbox" checked={!!s.on} disabled={s.kind === 'website'} onChange={(e) => setSrc(s.id, { on: e.target.checked })} className="h-4 w-4 flex-none accent-[#111112]" aria-label={`Use ${s.label}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><span className="text-[15.5px] font-semibold text-ink">{s.label}</span><span className="rounded-full bg-surface px-2 py-0.5 text-[12px] font-semibold text-mute">{s.status}</span>{s.inSameAs && <span className="text-[12.5px] text-ok">declared</span>}</div>
          <a href={s.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 truncate text-[13.5px] text-mute hover:text-accent">{s.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 70)}<ExternalLink size={11} className="flex-none" /></a>
          {s.facts && <div className="text-[13.5px] text-ink">Read: “{s.facts.title.slice(0, 70)}” · {s.facts.words.toLocaleString()} words</div>}
        </div>
        {social && s.on && !s.facts && s.session !== 'open' && <button onClick={signIn} className="flex h-9 flex-none items-center gap-1.5 rounded-full border border-line px-3 text-[13.5px] font-semibold text-ink hover:bg-surface"><LogIn size={14} />Sign in to read</button>}
        {s.facts && <button onClick={signOut} title="Sign out and delete this profile" className="flex h-9 flex-none items-center gap-1.5 rounded-full px-3 text-[13.5px] font-semibold text-mute hover:bg-surface"><LogOut size={14} />Sign out</button>}
      </div>
      {plan && (
        <div className="ml-7 mt-2.5 rounded-2xl bg-surface p-3.5 text-[14.5px] leading-snug">
          <div className="font-semibold text-ink">Sign in on the right, then approve what the agent will do</div>
          <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-mute"><li>Open {s.url.replace(/^https?:\/\//, '').slice(0, 50)} in your own signed-in profile</li><li>Read that page and up to 2 more pages on the same site</li><li>Read only: no posting, no messages, no clicks on your behalf</li></ol>
          <div className="mt-2 text-[13px] text-faint">Your password stays in the browser; Picked never sees it. The profile is kept on this machine only; Sign out deletes it. Platforms forbid automated access in their terms, so use your own account at your own risk.</div>
          <div className="mt-2.5 flex gap-2"><button onClick={read} disabled={s.session === 'reading'} className="flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-[14px] font-semibold text-white disabled:opacity-60">{s.session === 'reading' ? <><Loader2 size={14} className="animate-spin" />Reading…</> : <><Check size={14} strokeWidth={3} />Approve and read</>}</button><button onClick={() => { setPlan(false); setSrc(s.id, { session: undefined }) }} className="h-9 rounded-full px-4 text-[14px] font-semibold text-mute hover:bg-white">Cancel</button></div>
        </div>
      )}
      {err && <div className="ml-7 mt-1.5 text-[13.5px] text-bad">{err}</div>}
    </div>
  )
}

/* ───────────── steps 3–4: one story everywhere? then the fixes, approved one by one ───────────── */
function Result({ st, save }: { st: State; save: (s: State) => void }) {
  const [open, setOpen] = useState<string>(st.patches?.[0]?.id ?? ''), [copied, setCopied] = useState('')
  const approved = new Set(st.approved ?? []), hours = (st.patches ?? []).filter((p) => approved.has(p.id)).reduce((n, p) => n + p.hours, 0)
  const toggle = (id: string) => save({ ...st, approved: approved.has(id) ? [...approved].filter((x) => x !== id) : [...approved, id] })
  const download = (p: Fix) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([p.after], { type: 'text/plain' })); a.download = p.id === 'org' ? 'organization.jsonld' : p.id === 'llms' ? 'llms.txt' : 'robots-content-signal.txt'; a.click(); URL.revokeObjectURL(a.href) }
  const n = { pass: 0, warn: 0, fail: 0 }; (st.checks ?? []).forEach((c) => n[c.status]++)
  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center gap-5 rounded-[22px] p-4 ring-1 ring-line">
        <Gauge score={st.score ?? 0} size={128} />
        <div className="min-w-[240px] flex-1">
          <Eyebrow>One business everywhere · {st.host}</Eyebrow>
          <div className="mt-1.5 text-[23px] font-semibold leading-tight tracking-[-0.03em] text-ink">{n.fail + n.warn ? `${n.fail + n.warn} things make ${st.brand} harder for an AI to recognise` : `${st.brand} tells the same story everywhere`}</div>
          <div className="mt-2 flex gap-2 text-[13px] font-semibold"><span className="rounded-full bg-surface px-2.5 py-0.5 text-ok">{n.pass} pass</span><span className="rounded-full bg-surface px-2.5 py-0.5 text-warn">{n.warn} warn</span><span className="rounded-full bg-surface px-2.5 py-0.5 text-bad">{n.fail} fail</span></div>
        </div>
      </section>
      <section><Eyebrow>What we checked</Eyebrow>
        <div className="mt-2.5 grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-x-5 gap-y-2">{st.checks!.map((c) => <div key={c.id} className="flex items-start gap-2.5 text-[14.5px] leading-snug"><span className="mt-[3px] flex-none">{icon(c.status)}</span><span><b className="font-semibold text-ink">{c.label}</b><span className="block text-mute">{c.detail}</span></span></div>)}</div>
      </section>
      {(st.patches ?? []).length > 0 && (
        <section>
          <div className="flex items-baseline gap-3"><Eyebrow>The fixes · approve each one</Eyebrow><span className="ml-auto text-[14px] text-mute">{approved.size} of {st.patches!.length} approved · <b className="font-semibold text-ink">{hours} agency hours (${hours * RATE}) not paid for</b></span></div>
          <div className="mt-2.5 divide-y divide-line overflow-hidden rounded-[20px] ring-1 ring-line">
            {st.patches!.map((p) => { const on = open === p.id, ok = approved.has(p.id); return (
              <div key={p.id}>
                <button onClick={() => setOpen(on ? '' : p.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface/60">
                  <span className={`grid h-6 w-6 flex-none place-items-center rounded-full ${ok ? 'bg-ink text-white' : 'ring-1 ring-line'}`}>{ok && <Check size={13} strokeWidth={3.5} />}</span>
                  <span className="min-w-0 flex-1"><span className="block text-[15.5px] font-semibold text-ink">{p.file}</span><span className="block truncate text-[13.5px] text-mute">{p.why}</span></span>
                  <span className="flex-none text-[13px] text-faint">{p.hours} h</span><ChevronDown size={17} className={`flex-none text-faint transition-transform ${on ? 'rotate-180' : ''}`} />
                </button>
                {on && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="overflow-hidden px-4 pb-4">
                    <div className="text-[13.5px] text-mute">{p.where}</div>
                    <div className={`mt-2 grid gap-2 ${p.before ? 'grid-cols-2' : 'grid-cols-1'}`}>
                      {p.before && <div><div className="mb-1 text-[12px] font-semibold uppercase tracking-[.12em] text-faint">Now</div><pre className="max-h-64 overflow-auto rounded-xl bg-surface p-3 text-[12.5px] leading-relaxed text-mute">{p.before}</pre></div>}
                      <div><div className="mb-1 text-[12px] font-semibold uppercase tracking-[.12em] text-faint">{p.before ? 'After' : 'New file'}</div><pre className="max-h-64 overflow-auto rounded-xl bg-[#f6faf7] p-3 text-[12.5px] leading-relaxed text-ink ring-1 ring-[#dcebe1]">{p.after}</pre></div>
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <button onClick={() => toggle(p.id)} className={`flex h-9 items-center gap-1.5 rounded-full px-4 text-[14px] font-semibold ${ok ? 'bg-surface text-ink' : 'bg-accent text-white'}`}>{ok ? 'Approved · undo' : <><Check size={14} strokeWidth={3} />Approve</>}</button>
                      <button onClick={() => { void navigator.clipboard.writeText(p.after); setCopied(p.id); setTimeout(() => setCopied(''), 1500) }} className="flex h-9 items-center gap-1.5 rounded-full border border-line px-3.5 text-[14px] font-semibold text-ink hover:bg-surface"><Copy size={14} />{copied === p.id ? 'Copied' : 'Copy'}</button>
                      <button onClick={() => download(p)} className="flex h-9 items-center gap-1.5 rounded-full border border-line px-3.5 text-[14px] font-semibold text-ink hover:bg-surface"><Download size={14} />Download</button>
                    </div>
                  </motion.div>
                )}
              </div>
            ) })}
          </div>
          <div className="mt-2 text-[13px] text-faint">The files are built only from what the website says and the places you confirmed. Approving marks a fix as yours to publish; nothing is changed on your site from here.</div>
        </section>
      )}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => openRun('all', { type: 'analyze', q: st.url })} className="flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-[14.5px] font-semibold text-white"><ScanSearch size={15} />Full X-ray of the website</button>
        <button onClick={() => openRun('all', { type: 'savings' })} className="flex h-10 items-center gap-2 rounded-full border border-line px-4 text-[14.5px] font-semibold text-ink hover:bg-surface">Compare with an SEO agency</button>
      </div>
    </div>
  )
}
