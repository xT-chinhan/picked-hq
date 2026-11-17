import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { AlertTriangle, Check, ChevronDown, Copy, Download, ExternalLink, Loader2, LogIn, LogOut, Minus, Plus, ScanSearch, X } from 'lucide-react'
import { Gauge, Eyebrow } from './report'
import { useBrowser } from './BrowserPanel'
import { add, openRun, patch, type CMsg } from './chat'

/* GEO Copilot, in the chat: find the business online, the owner confirms the places, every place is checked against the others,
   and the fixes are drafted as files the owner approves one by one. Nothing is published or posted from here. */
type Source = { id: string; kind: string; label: string; url: string; status: string; note?: string; inSameAs?: boolean; on?: boolean; facts?: { title: string; words: number }; session?: 'open' | 'reading' | 'read' | 'error' }
type Check_ = { id: string; status: 'pass' | 'warn' | 'fail'; label: string; detail: string }
type Fix = { id: string; file: string; where: string; why: string; hours: number; before: string; after: string }
type Criteria = { bench: { r: number | null; n: number; category?: string; examples: { name: string; site: number; mentioned: number; total: number }[] }; xray: { score: number | null; id: string } | null; sources: { domain: string; count: number }[]; quickCategory: string }
type State = { criteria?: Criteria; started?: { at: number; category: string; routine: string | null; err?: string } | null; stage: 'find' | 'confirm' | 'checking' | 'done' | 'error'; url?: string; host?: string; name?: string; blocked?: boolean; sources?: Source[]; brand?: string; score?: number; checks?: Check_[]; patches?: Fix[]; approved?: string[]; err?: string }

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
  const here = thread
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
    try { const r = await post('/api/copilot/check', { url: st.url, sources: st.sources!.filter((s) => s.on && s.kind !== 'website').map((s) => ({ url: s.url, label: s.label, facts: s.facts })) }); save({ ...s0, stage: 'done', brand: r.brand, score: r.score, checks: r.checks, patches: r.patches, criteria: r.criteria, approved: [] }) }
    catch (e: any) { save({ ...st, stage: 'confirm', err: e.message }) }
  }

  if (st.stage === 'error') return <div className="rounded-2xl bg-surface p-4 text-[15.5px] text-bad">{st.err}</div>
  if (st.stage === 'find') return <Steps lines={[`Looking up ${input}…`, 'Reading the homepage and its declared identity…', 'Collecting the profiles and marketplaces it links to…']} />
  if (st.stage === 'confirm' || st.stage === 'checking') return <Confirm st={st} setSrc={setSrc} add={(url) => { try { const u = new URL(/^https?:/.test(url) ? url : `https://${url}`); save({ ...st, sources: [...st.sources!, { id: `owner-${u.hostname}${st.sources!.length}`, kind: 'link', label: u.hostname.replace(/^www\./, ''), url: u.href, status: 'owner', on: true }] }) } catch { /* not a link */ } }} onCheck={check} busy={st.stage === 'checking'} />
  return <Result st={st} save={save} thread={here} />
}

/* ───────────── step 2: the owner confirms the places ───────────── */
function Confirm({ st, setSrc, add, onCheck, busy }: { st: State; setSrc: (id: string, p: Partial<Source>) => void; add: (url: string) => void; onCheck: () => void; busy: boolean }) {
  const [link, setLink] = useState('')
  return (
    <div>
      <Eyebrow>Is this you? · {st.host}</Eyebrow>
      <p className="mt-1.5 text-[15.5px] leading-snug text-mute">Untick what is not yours, add what is missing.</p>
      {st.blocked && <div className="mt-3 flex gap-2 rounded-2xl bg-surface p-3 text-[14.5px] text-warn"><AlertTriangle size={16} className="mt-0.5 flex-none" />The site turned our reader away. Add its places by hand.</div>}
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
  const signIn = async () => { setErr(''); try { const { id } = await post(`/api/sessions/${encodeURIComponent(slug.replace(/[^\w-]/g, '-'))}/open`, { url: s.url }); useBrowser.setState({ open: true, tab: id, control: true, review: null }); setSrc(s.id, { session: 'open' }); setPlan(true) } catch (e: any) { setErr(/only/.test(e.message) ? 'Unlock Owner mode (menu ☰) to sign in.' : e.message) } }
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
          <div className="font-semibold text-ink">Sign in on the right, then approve</div>
          <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-mute"><li>Open {s.url.replace(/^https?:\/\//, '').slice(0, 50)} in your own signed-in profile</li><li>Read that page and up to 2 more on the same site</li><li>Read only: no posting, no messages</li></ol>
          <div className="mt-2 text-[13px] text-faint">Your password stays in the browser. Sign out deletes the profile. Platforms limit automated access: use your own account.</div>
          <div className="mt-2.5 flex gap-2"><button onClick={read} disabled={s.session === 'reading'} className="flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-[14px] font-semibold text-white disabled:opacity-60">{s.session === 'reading' ? <><Loader2 size={14} className="animate-spin" />Reading…</> : <><Check size={14} strokeWidth={3} />Approve and read</>}</button><button onClick={() => { setPlan(false); setSrc(s.id, { session: undefined }) }} className="h-9 rounded-full px-4 text-[14px] font-semibold text-mute hover:bg-white">Cancel</button></div>
        </div>
      )}
      {err && <div className="ml-7 mt-1.5 text-[13.5px] text-bad">{err}</div>}
    </div>
  )
}

/* ───────────── steps 3–4: one story everywhere? then the fixes, approved one by one ───────────── */
function Result({ st, save, thread }: { st: State; save: (s: State) => void; thread: string }) {
  const [open, setOpen] = useState<string>(st.patches?.[0]?.id ?? ''), [copied, setCopied] = useState('')
  const approved = new Set(st.approved ?? []), hours = (st.patches ?? []).filter((p) => approved.has(p.id)).reduce((n, p) => n + p.hours, 0)
  const toggle = (id: string) => save({ ...st, approved: approved.has(id) ? [...approved].filter((x) => x !== id) : [...approved, id] })
  const download = (p: Fix) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([p.after], { type: 'text/plain' })); a.download = p.id === 'org' ? 'organization.jsonld' : p.id === 'llms' ? 'llms.txt' : 'robots-content-signal.txt'; a.click(); URL.revokeObjectURL(a.href) }
  const n = { pass: 0, warn: 0, fail: 0 }; (st.checks ?? []).forEach((c) => n[c.status]++)
  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center gap-5 rounded-[22px] p-4 ring-1 ring-line">
        <Gauge score={st.score ?? 0} size={156} />
        <div className="min-w-[240px] flex-1">
          <Eyebrow>One business everywhere · {st.host}</Eyebrow>
          <div className="mt-1.5 text-[23px] font-semibold leading-tight tracking-[-0.03em] text-ink">{n.fail + n.warn ? `${n.fail + n.warn} things make ${st.brand} harder for an AI to recognise` : `${st.brand} tells the same story everywhere`}</div>
          <div className="mt-2 flex gap-2 text-[13px] font-semibold"><span className="rounded-full bg-surface px-2.5 py-0.5 text-ok">{n.pass} pass</span><span className="rounded-full bg-surface px-2.5 py-0.5 text-warn">{n.warn} warn</span><span className="rounded-full bg-surface px-2.5 py-0.5 text-bad">{n.fail} fail</span></div>
        </div>
      </section>
      <section><Eyebrow>What we checked</Eyebrow>
        <div className="mt-2.5 grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-x-5 gap-y-2">{st.checks!.map((c) => <div key={c.id} className="flex items-start gap-2.5 text-[14.5px] leading-snug"><span className="mt-[3px] flex-none">{icon(c.status)}</span><span><b className="font-semibold text-ink">{c.label}</b><span className="block text-mute">{c.detail}</span></span></div>)}</div>
      </section>
      <Criteria st={st} />
      <Plan st={st} save={save} thread={thread} />
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
          <div className="mt-2 text-[13px] text-faint">Built only from your site and the places you confirmed. Nothing is changed on your site from here.</div>
        </section>
      )}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => openRun('all', { type: 'analyze', q: st.url })} className="flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-[14.5px] font-semibold text-white"><ScanSearch size={15} />Full X-ray of the website</button>
        <button onClick={() => openRun('all', { type: 'savings' })} className="flex h-10 items-center gap-2 rounded-full border border-line px-4 text-[14.5px] font-semibold text-ink hover:bg-surface">Compare with an SEO agency</button>
      </div>
    </div>
  )
}

/* ───────────── what gets a store recommended, with this store's status and the evidence ───────────── */
function Criteria({ st }: { st: State }) {
  const c = st.criteria, n = { fail: 0, warn: 0 }; (st.checks ?? []).forEach((x) => { if (x.status !== 'pass') n[x.status]++ })
  const ex = c?.bench.examples ?? []
  const rows: { name: string; status: 'pass' | 'warn' | 'fail' | 'todo'; now: string; why: string }[] = [
    { name: '1. Recognised as one business', status: n.fail ? 'fail' : n.warn ? 'warn' : 'pass', now: `${st.score}/100 on the checks above`, why: 'The same name, phone and address everywhere, declared in the site’s data.' },
    { name: '2. Readable by AI assistants', status: c?.xray?.score == null ? 'todo' : c.xray.score >= 75 ? 'pass' : c.xray.score >= 50 ? 'warn' : 'fail', now: c?.xray?.score == null ? 'Measured by the plan' : `${c.xray.score}/100 agent-readiness`, why: 'Crawlers can get in, read the text and find structured data.' },
    { name: '3. Talked about where AI looks', status: 'todo', now: c?.sources.length ? `For ${c.bench.category ?? 'this category'} Gemini cites ${c.sources.slice(0, 4).map((x) => x.domain).join(', ')}` : 'Measured by the plan', why: 'Assistants recommend what trusted sites write about.' },
    { name: '4. Answers the buyer questions', status: 'todo', now: 'Measured by the plan', why: 'Plain, sourced answers to the real buyer questions.' },
  ]
  const ico = (s: string) => (s === 'todo' ? <span className="h-2.5 w-2.5 rounded-full bg-line" /> : icon(s))
  return (
    <section>
      <Eyebrow>What gets a store recommended by AI</Eyebrow>
      <div className="mt-2.5 divide-y divide-line overflow-hidden rounded-[20px] ring-1 ring-line">
        {rows.map((r) => <div key={r.name} className="grid grid-cols-[22px_1fr] gap-2.5 px-4 py-3"><span className="mt-1 grid h-4 place-items-center">{ico(r.status)}</span><div><div className="flex flex-wrap items-baseline gap-x-2"><b className="text-[15.5px] font-semibold text-ink">{r.name}</b><span className="text-[14px] text-mute">{r.now}</span></div><div className="mt-0.5 text-[14px] leading-snug text-faint">{r.why}</div></div></div>)}
      </div>
      {c?.bench.r != null && ex.length === 2 && <div className="mt-2.5 rounded-2xl bg-surface p-3.5 text-[14.5px] leading-snug text-mute"><b className="font-semibold text-ink">Measured, not assumed:</b> across {c.bench.n} brands we audited, a better website alone did not get a brand named more often (rank correlation {c.bench.r.toFixed(2)}). {ex[0].name} scores {ex[0].site}/100 and is named in {ex[0].mentioned} of {ex[0].total} answers; {ex[1].name} scores {ex[1].site}/100 and is named in {ex[1].mentioned}. That is why the plan works on all four, not only the website. {c.bench.n < 20 ? 'A small sample: read it as a pattern, not a law.' : ''}</div>}
    </section>
  )
}

/* ───────────── the plan: what the team does next, who does it, and what needs you; one approval starts it ───────────── */
function Plan({ st, save, thread }: { st: State; save: (s: State) => void; thread: string }) {
  const c = st.criteria, [cat, setCat] = useState(c?.quickCategory ?? ''), [busy, setBusy] = useState(false)
  const quick = !!c && cat.trim().toLowerCase() === c.quickCategory.toLowerCase()
  const steps = [
    { who: 'You', what: `Publish the ${st.patches?.length ?? 0} identity fixes below on your site`, crit: '1', you: true },
    { who: 'Sy', what: 'Audit the website (39 readiness checks) and collect sourced facts from its pages', crit: '2' },
    { who: 'Scout', what: quick ? 'Ask Gemini the 40 buyer questions (saved real answers, re-scored for you)' : 'Ask Gemini 20 buyer questions in fresh tabs, about 3 minutes', crit: '3 · 4' },
    { who: 'Ana', what: 'Find the questions that skip you and the sources Gemini cites', crit: '3 · 4' },
    { who: 'Mira', what: 'Write an FAQ, an about page and a pitch from facts found on your site', crit: '4' },
    { who: 'Quinn · Rhea', what: 'Check every sentence against its source; stop claims and personal data', crit: '4' },
    { who: 'You', what: 'Approve on your phone; nothing is published before that', crit: '—', you: true },
    { who: 'Pax', what: 'Publish your Picked page with llms.txt and structured data', crit: '1 · 2' },
    { who: 'Theo', what: 'Draft a pitch to the source Gemini cites most (a draft: you send it)', crit: '3' },
    { who: 'Tara', what: 'Re-measure every Monday at 09:00 and report the change', crit: 'all' },
  ]
  // answers name the short brand (“Elmich”), not the company line on the website (“Elmich Việt Nam”)
  const brand = (st.brand ?? '').replace(/\s+(Việt Nam|Viet Nam|Vietnam|VN|Official|Store|Shop|JSC|Co\.?,? ?Ltd\.?)$/i, '').trim()
  const start = async () => {
    if (!brand || busy) return
    setBusy(true)
    let routine: string | null = null, err = ''
    openRun(thread, { type: 'audit', brand, website: st.url, category: cat.trim() || undefined, fresh: !quick })
    try { const r = await fetch('/api/routines', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ brand, mode: quick ? 'quick' : 'fresh', schedule: { kind: 'weekly', days: [1], at: '09:00' }, title: `${brand} · weekly re-measure` }) }); const j = await r.json(); if (r.ok) routine = j.id; else err = j.error } catch (e: any) { err = e.message }
    save({ ...st, started: { at: Date.now(), category: cat.trim(), routine, err } })
    add(thread, { who: 'nan', text: `Plan started for **${brand}**. Scout is asking Gemini and Sy is auditing the site; the run reports live below, one job at a time. ${routine ? 'Tara will re-measure every Monday at 09:00.' : `The weekly re-measure was not scheduled${err ? `: ${err}` : '.'}`} I will ask you before anything is published.` })
    setBusy(false)
  }
  return (
    <section>
      <Eyebrow>The plan · what happens next</Eyebrow>
      <div className="mt-2.5 overflow-hidden rounded-[20px] ring-1 ring-line">
        {steps.map((x, i) => <div key={i} className="grid grid-cols-[28px_118px_1fr_52px] items-center gap-2.5 border-b border-line px-4 py-2.5 last:border-0"><span className={`grid h-6 w-6 place-items-center rounded-full text-[12.5px] font-bold ${x.you ? 'bg-accent text-white' : 'bg-surface text-ink'}`}>{i + 1}</span><span className={`text-[14px] font-semibold ${x.you ? 'text-accent' : 'text-ink'}`}>{x.who}</span><span className="text-[14.5px] leading-snug text-ink">{x.what}</span><span className="text-right text-[12.5px] text-faint">{x.crit === '—' ? '' : `crit. ${x.crit}`}</span></div>)}
      </div>
      {!st.started ? (
        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <label className="flex h-11 min-w-[260px] flex-1 items-center gap-2 rounded-full border border-line px-4 text-[14.5px] text-mute">What do you sell?<input value={cat} onChange={(e) => setCat(e.target.value)} placeholder="e.g. bình sữa cho bé" className="min-w-0 flex-1 bg-transparent text-ink outline-none" /></label>
          <button onClick={start} disabled={busy || !cat.trim()} className="flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-[15.5px] font-semibold text-white hover:bg-[#0057b8] disabled:opacity-60">{busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={3} />}Approve the plan and start</button>
          <span className="w-full text-[13px] text-faint">Runs steps 2–6 now and schedules step 10. Steps 7–9 wait for your approval.</span>
        </div>
      ) : (
        <div className="mt-3 flex items-start gap-2.5 rounded-2xl bg-surface p-3.5 text-[14.5px] leading-snug text-ink"><Check size={17} strokeWidth={3} className="mt-0.5 flex-none text-ok" /><span>Started {new Date(st.started.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} for “{st.started.category}”. The run is working below. {st.started.routine ? 'Weekly re-measure scheduled for Mondays at 09:00.' : `Weekly re-measure not scheduled${st.started.err ? `: ${st.started.err}` : ''}.`}</span></div>
      )}
    </section>
  )
}
