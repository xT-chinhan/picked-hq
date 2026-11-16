import type { NodeProps } from '@xyflow/react'
import {
  Check, Clock3, FileText, Globe, Lock, Mail, MessageCircleQuestion, Minus, QrCode, Quote, Scale, ShieldCheck, Sparkles, Store, TrendingUp, UserCheck, X,
} from 'lucide-react'
import facebook from 'simple-icons/icons/facebook.svg'
import shopee from 'simple-icons/icons/shopee.svg'
import gmaps from 'simple-icons/icons/googlemaps.svg'
import { Mask, Ports, Skel, Spin } from './nodes'
import { useLive } from './live'
import { useSim } from './sim'
import { C } from './layout'

/* Live variants of the canvas nodes: the same cards, but every number and sentence comes from a real run. */
const INK = '#0f172a', AFTER = '#4f46e5'
const host = (u: string) => { try { return new URL(u).host.replace(/^www\./, '') } catch { return u } }
const Pill = ({ c, bg, children }: { c: string; bg: string; children: any }) => (
  <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ color: c, background: bg }}>{children}</span>
)
function Head({ icon: I, color, title, sub, right }: { icon: any; color: string; title: string; sub?: string; right?: any }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: `${color}14`, color }}><I size={18} /></div>
      <div className="min-w-0"><div className="truncate text-[14px] font-semibold tracking-tight">{title}</div>{sub && <div className="truncate text-[11px] text-slate-500">{sub}</div>}</div>
      {right && <div className="ml-auto shrink-0">{right}</div>}
    </div>
  )
}
/** typewriter reveal measured from the moment the data arrived (store time, so selectors stay pure) */
function useTyped(text: string, key: string, cps = 420) {
  const at = useLive((s) => s.at[key] ?? 0)
  return useSim((s) => (at ? Math.max(0, Math.min(text.length, Math.floor(((s.now - at) * cps) / 1000))) : 0))
}
const Wait = ({ label }: { label: string }) => <div className="flex flex-1 items-center justify-center gap-2 text-[12px] text-slate-400"><Spin size={14} />{label}</div>
const rates = (checks: any[]) => (['reach', 'read', 'understand'] as const).map((g) => {
  const c = checks.filter((x) => x.group === g && ['pass', 'warn', 'fail'].includes(x.status))
  return { g, n: c.length, rate: c.length ? c.filter((x) => x.status === 'pass').length / c.length : 0 }
})

/* ═════ Client card ═════ */
export function StoreLive() {
  const brand = useLive((s) => s.brand), category = useLive((s) => s.category), website = useLive((s) => s.website)
  return (
    <div className="card h-full w-full p-5">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.14em] text-slate-400">Brand<span className="live-dot ml-auto" /></div>
      <div className="mt-4 grid h-14 w-14 place-items-center rounded-2xl bg-slate-900 text-white"><Store size={26} /></div>
      <div className="mt-3 truncate text-[24px] font-semibold tracking-tight">{brand || '…'}</div>
      <div className="truncate text-[13px] text-slate-500">{category}</div>
      <div className="mt-3 flex flex-wrap gap-1.5 text-[11.5px] font-medium text-slate-600">{website ? <span className="rounded-full bg-slate-100 px-2.5 py-1">{host(website)}</span> : <span className="rounded-full bg-slate-100 px-2.5 py-1">No website</span>}</div>
      <Ports />
    </div>
  )
}

/* ═════ Signals ═════ */
export function MineBrandLive({ data }: NodeProps<any>) {
  const brand = useLive((s) => s.brand), category = useLive((s) => s.category), website = useLive((s) => s.website), qs = useLive((s) => s.qs)
  if (data.src === 'zalo') return (
    <div className="card lyr flex h-full w-full flex-col overflow-hidden">
      <Head icon={Store} color={C.mining} title="Brand" sub="What we audit" />
      <div className="flex flex-1 flex-col justify-center gap-3 px-5">
        <div className="text-[34px] font-semibold leading-none tracking-tight" style={{ color: INK }}>{brand || '…'}</div>
        <div className="flex flex-wrap gap-1.5"><Pill c="#0e7490" bg="#ecfeff">{category}</Pill>{website && <Pill c="#475569" bg="#f1f5f9"><Globe size={11} />{host(website)}</Pill>}</div>
      </div>
      <Ports />
    </div>
  )
  return (
    <div className="card lyr flex h-full w-full flex-col overflow-hidden">
      <Head icon={MessageCircleQuestion} color={C.mining} title="Question bank" sub="Asked like real buyers" right={<span className="tnum rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">{qs.length}</span>} />
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        {qs.slice(0, 5).map((q) => <div key={q.qi} className="pop rounded-xl bg-slate-50 px-3 py-2 text-[11.5px] leading-snug text-slate-600">{q.q}</div>)}
        {!qs.length && <Skel n={5} />}
      </div>
      <Ports />
    </div>
  )
}
export function MineTopLive() {
  const qs = useLive((s) => s.qs), category = useLive((s) => s.category)
  return (
    <div className="card lyr flex h-full w-full flex-col overflow-hidden">
      <Head icon={MessageCircleQuestion} color={C.mining} title="Buyer questions" sub={category} />
      <div className="flex flex-1 flex-col justify-around px-4 py-3">
        {qs.slice(0, 9).map((q, k) => (
          <div key={q.qi} className="flex items-center gap-2.5 text-[12.5px] text-slate-700"><span className="tnum w-5 text-[11px] font-semibold text-cyan-700">{k + 1}</span><span className="truncate">{q.q}</span></div>
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-3"><Pill c="#0e7490" bg="#ecfeff"><Sparkles size={11} />{qs.length} questions</Pill><span className="ml-auto text-[11.5px] font-medium text-slate-500">Sent to Gemini tabs</span></div>
      <Ports />
    </div>
  )
}

/* ═════ Channel Sync: website audit + facts ═════ */
const OTHER = [{ n: 'Shopee', src: shopee, c: '#EE4D2D' }, { n: 'Facebook', src: facebook, c: '#0866FF' }, { n: 'Google Maps', src: gmaps, c: '#34A853' }]
export function SyncChanLive({ data }: NodeProps<any>) {
  const site = useLive((s) => s.site), website = useLive((s) => s.website)
  if (data.k > 0) {
    const o = OTHER[data.k - 1]
    return (
      <div className="card lyr flex h-full w-full flex-col items-center justify-center gap-2 opacity-70">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-50 grayscale"><Mask src={o.src} color={o.c} size={24} /></div>
        <div className="text-[13px] font-semibold text-slate-600">{o.n}</div>
        <Pill c="#64748b" bg="#f1f5f9">Connect later</Pill>
        <Ports />
      </div>
    )
  }
  const r = site ? rates(site.checks) : []
  const fails = site ? site.checks.filter((c: any) => c.status === 'fail').slice(0, 3) : []
  return (
    <div className="card lyr flex h-full w-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-3.5 py-3"><div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-600"><Globe size={16} /></div><span className="truncate text-[13px] font-semibold">{website ? host(website) : 'Website'}</span></div>
      {!site ? <Wait label="Auditing" /> : (
        <div className="flex flex-1 flex-col gap-2 px-3.5 pb-3">
          <div className="flex items-end gap-1.5"><span className="tnum text-[34px] font-semibold leading-none tracking-tight" style={{ color: site.score >= 70 ? '#16a34a' : '#d97706' }}>{site.score ?? '–'}</span><span className="pb-1 text-[12px] text-slate-400">/100 AI readiness</span></div>
          {r.map((x) => <div key={x.g}><div className="flex justify-between text-[10.5px] capitalize text-slate-500"><span>{x.g}</span><span className="tnum">{Math.round(x.rate * 100)}%</span></div><div className="mt-0.5 h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${x.rate * 100}%`, background: x.rate > 0.75 ? '#22c55e' : x.rate > 0.5 ? '#f59e0b' : '#ef4444' }} /></div></div>)}
          <div className="mt-auto flex flex-col gap-1">{fails.map((f: any) => <div key={f.id} className="flex items-center gap-1.5 truncate text-[10.5px] text-rose-600"><X size={11} strokeWidth={3} className="shrink-0" /><span className="truncate">{f.title}</span></div>)}</div>
        </div>
      )}
      <Ports />
    </div>
  )
}
export function SyncTruthLive() {
  const facts = useLive((s) => s.facts), note = useLive((s) => s.factsNote), pages = useLive((s) => s.factsPages)
  const list: any[] = facts?.facts ?? []
  return (
    <div className="card lyr flex h-full w-full flex-col overflow-hidden">
      <Head icon={ShieldCheck} color={C.sync} title="Source of truth" sub={facts ? `${list.length} facts, each with its source page` : 'Facts the agents may use'} />
      {!facts ? (note ? <div className="flex flex-1 items-center justify-center px-6 text-center text-[12px] text-slate-500">{note}</div> : <Wait label="Reading the website" />) : (
        <div className="flex flex-1 flex-col gap-1.5 overflow-hidden px-3.5 py-3">
          {list.slice(0, 7).map((f) => (
            <div key={f.id} className="pop flex items-start gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
              <span className="tnum mt-px w-5 shrink-0 text-[10px] font-semibold text-blue-600">{f.id}</span>
              <span className="line-clamp-2 text-[11.5px] leading-snug text-slate-700">{f.text}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-3 text-[11.5px] text-slate-500"><Globe size={13} />{pages} {pages === 1 ? 'page' : 'pages'} read<span className="ml-auto"><Pill c="#1d4ed8" bg="#eff6ff"><Check size={11} strokeWidth={3} />Cited by id</Pill></span></div>
      <Ports />
    </div>
  )
}

/* ═════ Content ═════ */
const WRITERS = [
  { title: 'FAQ page', icon: MessageCircleQuestion, sub: 'Answers the missed questions' },
  { title: 'About page', icon: FileText, sub: 'From the website facts' },
  { title: 'Review pitch', icon: Mail, sub: 'To a source AI cites' },
  { title: 'llms.txt', icon: Quote, sub: 'Machine-readable summary' },
]
export function WriterLive({ data }: NodeProps<any>) {
  const w = WRITERS[data.k], I = w.icon
  const content = useLive((s) => s.content), llms = useLive((s) => s.contentPreview)
  let text = ''
  if (content) {
    if (data.k === 0) text = content.faqs.slice(0, 3).map((f: any) => `Q: ${f.q}\nA: ${f.a}`).join('\n\n')
    if (data.k === 1) text = `${content.overview.title}\n\n${content.overview.paragraphs.map((p: any) => p.text).join('\n\n')}`
    if (data.k === 2) text = `To: ${content.pitch.to}\nSubject: ${content.pitch.subject}\n\n${content.pitch.body.map((p: any) => p.text).join('\n\n')}`
    if (data.k === 3) text = llms || `# ${useLive.getState().brand}\n> ${content.overview.paragraphs[0]?.text.slice(0, 160)}\n\n## Hỏi đáp\n${content.faqs.map((f: any) => `- ${f.q}`).join('\n')}`
  }
  const n = useTyped(text, 'content')
  return (
    <div className="card lyr flex h-full w-full flex-col overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-orange-50 text-orange-600"><I size={17} /></div>
        <div className="min-w-0"><div className="text-[14px] font-semibold tracking-tight">{w.title}</div><div className="truncate text-[11px] text-slate-500">{w.sub}</div></div>
        <span className="ml-auto">{!content ? <Pill c="#94a3b8" bg="#f1f5f9">Queued</Pill> : n < text.length ? <Pill c="#ea580c" bg="#fff7ed">Writing</Pill> : <Pill c="#16a34a" bg="#ecfdf3"><Check size={11} strokeWidth={3} />Draft</Pill>}</span>
      </div>
      <div className={`min-h-0 flex-1 overflow-hidden px-4 py-3 text-[11.5px] leading-[1.55] text-slate-700 ${data.k === 3 ? 'font-mono text-[10.5px]' : ''}`}>
        {!content ? <Skel n={6} /> : <div className={`whitespace-pre-wrap ${n < text.length ? 'caret' : ''}`}>{text.slice(0, n)}</div>}
      </div>
      <Ports />
    </div>
  )
}

/* ═════ Citations ═════ */
export function CiteSourcesLive() {
  const summary = useLive((s) => s.summary), analysis = useLive((s) => s.analysis)
  const src = summary?.sources.slice(0, 6) ?? [], max = Math.max(1, ...src.map((s) => s.count)), targets = new Set((analysis?.sources ?? []).slice(0, 3).map((s) => s.domain))
  return (
    <div className="card lyr flex h-full w-full flex-col overflow-hidden">
      <Head icon={Quote} color={C.citations} title="Sources AI cites" sub={`Found in ${summary?.answered ?? 0} Gemini answers`} />
      <div className="flex flex-1 flex-col justify-around px-4 py-3">
        {src.map((s) => (
          <div key={s.domain}>
            <div className="flex items-center gap-2 text-[12.5px]"><Globe size={13} className="text-slate-400" /><span className="truncate font-medium text-slate-700">{s.domain}</span>{targets.has(s.domain) && <span className="ml-auto"><Pill c="#be185d" bg="#fdf2f8">Pitch target</Pill></span>}<span className="tnum ml-auto text-[11px] font-semibold text-slate-500">{s.count}</span></div>
            <div className="mt-1.5 h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${(s.count / max) * 100}%`, background: targets.has(s.domain) ? C.citations : '#f9a8d4' }} /></div>
          </div>
        ))}
        {!src.length && <Skel n={6} />}
      </div>
      <Ports />
    </div>
  )
}
export function CiteMailLive({ data }: NodeProps<any>) {
  const content = useLive((s) => s.content), analysis = useLive((s) => s.analysis)
  const k = data.k
  const target = analysis?.sources[k]?.domain
  const text = k === 0 && content ? content.pitch.body.map((p: any) => p.text).join('\n\n') : ''
  const n = useTyped(text, 'content', 300)
  return (
    <div className="card lyr flex h-full w-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-100 px-3.5 py-2.5">
        <Mail size={15} style={{ color: C.citations }} /><span className="truncate text-[12.5px] font-semibold">To: {k === 0 && content ? content.pitch.to : target ?? '…'}</span>
        <span className="ml-auto">{k === 0 && content ? (n < text.length ? <Pill c="#be185d" bg="#fdf2f8">Writing</Pill> : <Pill c="#475569" bg="#f1f5f9">For approval</Pill>) : <Pill c="#94a3b8" bg="#f1f5f9">Next</Pill>}</span>
      </div>
      <div className="flex-1 overflow-hidden px-3.5 py-2.5 text-[11.5px] leading-[1.55] text-slate-600">
        {k === 0 ? (content ? <><div className="mb-1 font-medium text-slate-800">{content.pitch.subject}</div><span className={n < text.length ? 'caret' : ''}>{text.slice(0, n)}</span></> : <Skel n={4} />) : <div className="text-slate-400">Drafted after the owner approves the first pitch.</div>}
      </div>
      <Ports />
    </div>
  )
}
function Scheduled({ title }: { title: string }) {
  return (
    <div className="card lyr flex h-full w-full flex-col items-center justify-center gap-2 px-5 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-600"><Clock3 size={22} /></div>
      <div className="text-[14px] font-semibold tracking-tight">{title}</div>
      <div className="text-[11.5px] leading-snug text-slate-500">AI needs days to re-crawl a page. The same questions run again after 7 days.</div>
      <Ports />
    </div>
  )
}
export const CiteVerifyLive = () => <Scheduled title="Re-test in 7 days" />
export const RetestLive = ({ data }: NodeProps<any>) => <Scheduled title={data.i === 100 ? 'Week-1 re-test' : 'Week-2 re-test'} />

/* ═════ QA & Risk ═════ */
export function CheckLive({ data }: NodeProps<any>) {
  const risk = useLive((s) => s.risk)
  const items: any[] = risk?.items ?? []
  const ok = items.filter((i) => i.supported).length
  const rows = [
    { icon: ShieldCheck, title: 'Fact check', sub: risk ? `${ok} of ${items.length} sentences backed` : 'Against the facts', st: !risk ? 'wait' : ok === items.length ? 'ok' : ok / items.length > 0.75 ? 'warn' : 'bad' },
    { icon: Lock, title: 'Privacy', sub: risk ? (risk.pii.length ? `${risk.pii.length} personal data found` : 'No personal data found') : 'Personal data', st: !risk ? 'wait' : risk.pii.length ? 'bad' : 'ok' },
    { icon: Scale, title: 'Claims', sub: risk ? (risk.flags.length ? `${risk.flags.length} risky claims` : 'No superlatives or promises') : 'No false claims', st: !risk ? 'wait' : risk.flags.length ? 'bad' : 'ok' },
  ][data.k]
  const I = rows.icon, col = { ok: '#16a34a', warn: '#d97706', bad: '#dc2626', wait: '#94a3b8' }[rows.st as 'ok']
  return (
    <div className="card lyr flex h-full w-full items-center gap-3 px-4">
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><I size={21} /></div>
      <div className="min-w-0 flex-1"><div className="text-[15px] font-semibold tracking-tight">{rows.title}</div><div className="text-[11.5px] text-slate-500">{rows.sub}</div></div>
      {rows.st === 'wait' ? <Spin size={20} color="#059669" /> : <div className="pop grid h-7 w-7 place-items-center rounded-full text-white" style={{ background: col }}>{rows.st === 'ok' ? <Check size={16} strokeWidth={3.2} /> : rows.st === 'warn' ? <Minus size={16} strokeWidth={3.2} /> : <X size={16} strokeWidth={3.2} />}</div>}
      <Ports />
    </div>
  )
}
export function ConfLive() {
  const risk = useLive((s) => s.risk)
  const v = risk ? Math.round((Object.values(risk.confidence as Record<string, number>).reduce((a, b) => a + b, 0) / Object.keys(risk.confidence).length) * 100) : 0
  return (
    <div className="card lyr flex h-full w-full flex-col items-center justify-center p-4">
      <svg viewBox="0 0 120 70" className="w-[190px]">
        <path d="M10 62 A50 50 0 0 1 110 62" fill="none" stroke="#eef0f6" strokeWidth="10" strokeLinecap="round" />
        <path d="M10 62 A50 50 0 0 1 110 62" fill="none" stroke={v >= 90 ? '#059669' : '#d97706'} strokeWidth="10" strokeLinecap="round" strokeDasharray={157} strokeDashoffset={157 * (1 - v / 100)} style={{ transition: 'stroke-dashoffset .6s' }} />
      </svg>
      <div className="tnum -mt-9 text-[38px] font-semibold tracking-tight">{v}<span className="text-[18px] text-slate-400">%</span></div>
      <div className="mt-1 text-[12.5px] text-slate-500">average confidence</div>
      <div className="mt-3 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-500">{risk ? `${risk.needsOwner.length} of ${Object.keys(risk.confidence).length} documents → owner` : 'Below 90% → owner review'}</div>
      <Ports />
    </div>
  )
}
export function RiskClaimsLive() {
  const risk = useLive((s) => s.risk)
  const items: any[] = risk?.items ?? []
  const shown = [...items.filter((i) => !i.supported).slice(0, 3), ...items.filter((i) => i.supported).slice(0, 2)]
  return (
    <div className="card lyr flex h-full w-full flex-col overflow-hidden">
      <Head icon={ShieldCheck} color={C.risk} title="Claim check" sub="Every sentence against the facts" right={risk && <Pill c="#b45309" bg="#fffbeb">{items.filter((i) => !i.supported).length} flagged</Pill>} />
      {!risk ? <Wait label="Checking sentences" /> : (
        <div className="flex flex-1 flex-col justify-around px-4 py-2">
          {shown.map((i, k) => (
            <div key={k} className="pop flex items-start gap-2.5">
              <span className={`mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full text-white ${i.supported ? 'bg-emerald-500' : 'bg-rose-500'}`}>{i.supported ? <Check size={11} strokeWidth={3.5} /> : <X size={11} strokeWidth={3.5} />}</span>
              <div className="min-w-0"><div className="line-clamp-1 text-[12px] font-medium text-slate-700">“{i.sentence}”</div>{!i.supported && <div className="line-clamp-2 text-[11px] leading-snug text-rose-600">{i.why}</div>}</div>
            </div>
          ))}
        </div>
      )}
      <Ports />
    </div>
  )
}
export function RiskPiiLive() {
  const risk = useLive((s) => s.risk)
  const n = risk?.pii.length ?? 0
  return (
    <div className="card lyr flex h-full w-full items-center gap-3 px-4">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600"><Lock size={19} /></div>
      <div className="min-w-0 flex-1"><div className="text-[13.5px] font-semibold tracking-tight">Personal data</div><div className="truncate text-[11.5px] text-slate-500">{risk ? (n ? `${n} item(s) must be removed` : 'None found in any draft') : 'Scanning phone numbers, emails, IDs'}</div></div>
      {risk ? <span className="pop"><Pill c={n ? '#be123c' : '#15803d'} bg={n ? '#fff1f2' : '#dcfce7'}>{n ? 'Blocked' : 'Clean'}</Pill></span> : <Spin size={16} />}
      <Ports />
    </div>
  )
}
export function RiskRouteLive() {
  const risk = useLive((s) => s.risk), council = useLive((s) => s.council)
  const conf: Record<string, number> = risk?.confidence ?? {}
  const T: Record<string, string> = { faq: 'FAQ', overview: 'About', pitch: 'Pitch' }
  const lanes = [{ title: 'Auto-pass · 90%+', c: '#16a34a', bg: '#f0fdf4', docs: Object.entries(conf).filter(([, v]) => v >= 0.9) }, { title: 'Owner review · below 90%', c: '#d97706', bg: '#fffbeb', docs: Object.entries(conf).filter(([, v]) => v < 0.9) }]
  return (
    <div className="card lyr relative grid h-full w-full grid-cols-2 gap-3 p-3.5 pt-9">
      {council && <div className="pop absolute left-3.5 right-3.5 top-2 flex items-center gap-1.5 text-[10.5px] font-semibold text-slate-500"><span className="rounded-full bg-indigo-100 px-1.5 py-px text-indigo-700">{council.engines.length} models</span>{council.engines.map((e: any) => <span key={e.engine} className="rounded-full bg-slate-100 px-1.5 py-px">{e.engine}</span>)}<span className="ml-auto text-emerald-600">{council.unanimous}/{council.sentences} unanimous</span></div>}
      {lanes.map((l) => (
        <div key={l.title} className="flex flex-col gap-1.5 rounded-xl p-2.5" style={{ background: l.bg }}>
          <div className="text-[10.5px] font-semibold uppercase tracking-[.08em]" style={{ color: l.c }}>{l.title}</div>
          {l.docs.map(([d, v]) => <div key={d} className="pop flex items-center gap-2 rounded-lg bg-white px-2.5 py-1 text-[11.5px] font-medium shadow-[0_1px_2px_rgba(15,23,42,.08)]"><FileText size={12} className="text-slate-400" />{T[d] ?? d}<span className="tnum ml-auto font-semibold" style={{ color: l.c }}>{Math.round(v * 100)}%</span></div>)}
          {!risk && <div className="h-[26px] rounded-lg border border-dashed" style={{ borderColor: `${l.c}55` }} />}
        </div>
      ))}
      <Ports />
    </div>
  )
}

/* ═════ Approval ═════ */
export function ApprovalLive() {
  const a = useLive((s) => s.approval), mode = useLive((s) => s.mode)
  const decide = async () => {
    if (!a || a.status !== 'pending' || mode !== 'live') return
    await fetch(`/api/approve/${a.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decisions: Object.fromEntries(a.docs.map((d: any) => [d.key, 'approve'])) }) })
  }
  const st = a?.status
  return (
    <div className="card lyr relative h-full w-full p-5">
      <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-full bg-slate-900 text-white"><UserCheck size={21} /></div><div><div className="text-[17px] font-semibold tracking-tight">Owner approval</div><div className="text-[11.5px] text-slate-500">Nothing ships without a human</div></div></div>
      <button onClick={(e) => { e.stopPropagation(); decide() }} disabled={!a || st !== 'pending' || mode !== 'live'} className="nodrag nopan mt-4 flex h-11 w-full items-center justify-center rounded-xl text-[14px] font-semibold text-white transition-colors disabled:cursor-default" style={{ background: st === 'approved' ? '#16a34a' : st === 'rejected' ? '#dc2626' : AFTER, opacity: !a ? 0.5 : 1 }}>
        {st === 'approved' ? <><Check size={16} strokeWidth={3} className="mr-1.5" />Approved</> : st === 'rejected' ? 'Rejected' : a ? (mode === 'live' ? 'Approve all' : 'Waiting…') : 'Waiting for the risk check'}
      </button>
      <div className="mt-4 flex flex-col gap-2.5">
        {(a?.docs ?? []).map((d: any) => {
          const dec = a.decisions?.[d.key]
          return (
            <div key={d.key} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
              <FileText size={16} className="text-slate-500" /><span className="text-[13px] font-medium">{d.title}</span>
              <span className="tnum ml-auto text-[11px] font-semibold" style={{ color: d.confidence >= 90 ? '#16a34a' : '#d97706' }}>{d.confidence}%</span>
              <span className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={dec === 'approve' ? { background: '#16a34a', color: '#fff' } : dec === 'reject' ? { background: '#fee2e2', color: '#b91c1c' } : { background: '#eef0f6', color: '#64748b' }}>{dec === 'approve' ? 'Ready' : dec === 'reject' ? 'Rejected' : 'Pending'}</span>
            </div>
          )
        })}
        {!a && <Skel n={3} />}
      </div>
      <div className="mt-4 flex items-center gap-2 text-[11.5px] text-slate-400"><Lock size={12} />Every decision is logged</div>
      <Ports />
    </div>
  )
}
export function ApprovalPhoneLive() {
  const a = useLive((s) => s.approval)
  return (
    <div className="relative h-full w-full rounded-[46px] bg-slate-900 p-[9px]">
      <div className="relative flex h-full flex-col items-center overflow-hidden rounded-[38px] bg-white">
        <div className="mt-3 h-[18px] w-[76px] rounded-full bg-slate-900" />
        <div className="mt-5 flex items-center gap-2"><div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white"><Check size={16} strokeWidth={3.2} /></div><span className="text-[15px] font-semibold">Picked</span></div>
        <div className="mt-4 px-6 text-center text-[13px] font-medium leading-snug text-slate-700">{a ? (a.status === 'pending' ? 'Scan to review and approve' : `Owner ${a.status}`) : 'Preparing the review link'}</div>
        <div className="mt-5 grid h-[236px] w-[236px] place-items-center rounded-2xl border border-slate-100 bg-white">
          {a?.qr ? <img src={a.qr} alt="Approval QR code" className="h-[216px] w-[216px]" style={{ imageRendering: 'pixelated' }} /> : <QrCode size={64} className="text-slate-200" />}
        </div>
        <div className="mt-4 w-full px-6">{(a?.docs ?? []).map((d: any) => <div key={d.key} className="flex items-center gap-2 border-b border-slate-50 py-1.5 text-[11.5px] text-slate-600"><FileText size={12} className="text-slate-400" />{d.title}<span className="tnum ml-auto text-slate-400">{d.confidence}%</span></div>)}</div>
        {a?.url && <div className="mt-auto mb-5 max-w-[250px] truncate px-4 text-[10px] text-slate-400">{a.url.replace('http://', '')}</div>}
      </div>
      <Ports />
    </div>
  )
}

/* ═════ Publish ═════ */
export function PublishLive() {
  const pub = useLive((s) => s.publish), brand = useLive((s) => s.brand)
  return (
    <div className="card lyr h-full w-full p-5">
      <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-[14px] bg-sky-500 text-white"><Globe size={20} /></div><div><div className="text-[17px] font-semibold tracking-tight">Publish</div><div className="text-[11.5px] text-slate-500">{pub ? (pub.skipped ? 'Nothing was approved' : `${brand} shop page is live`) : 'Waiting for approval'}</div></div></div>
      {pub?.files ? (
        <div className="mt-4 flex gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-1.5">{pub.files.map((f: string) => <Pill key={f} c="#0369a1" bg="#e0f2fe"><Check size={10} strokeWidth={3.5} />{f}</Pill>)}</div>
            <div className="mt-3 truncate text-[11.5px] font-medium text-slate-700">{pub.localUrl.replace('http://', '')}</div>
            <div className="mt-1 truncate text-[10.5px] text-slate-400">Public: {pub.publicUrl.replace('https://', '')}</div>
          </div>
          {pub.qr && <img src={pub.qr} alt="Shop page QR" className="h-[92px] w-[92px] shrink-0 rounded-lg border border-slate-100" style={{ imageRendering: 'pixelated' }} />}
        </div>
      ) : <div className="mt-6"><Skel n={3} /></div>}
      <Ports />
    </div>
  )
}

/* ═════ Track + Impact ═════ */
export function TrackLive() {
  const summary = useLive((s) => s.summary), track = useLive((s) => s.track)
  const sc = summary?.mentioned ?? 0, tot = summary?.total ?? 40
  const hist: any[] = [...(track?.history ?? [])].sort((a, b) => a.startedAt - b.startedAt)
  return (
    <div className="card lyr flex h-full w-full flex-col p-5">
      <div className="flex items-center gap-2.5"><div className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><TrendingUp size={18} /></div><div><div className="text-[15px] font-semibold tracking-tight">AI Visibility</div><div className="text-[11.5px] text-slate-500">Baseline measured today</div></div></div>
      <div className="mt-4 flex items-end gap-3"><span className="tnum text-[52px] font-semibold leading-[.85] tracking-[-.04em]" style={{ color: INK }}>{sc}<span className="text-[24px] tracking-normal text-slate-300">/{tot}</span></span><div className="pb-1 text-[11.5px] text-slate-500">{Math.round((sc / Math.max(1, tot)) * 100)}% of buyer questions<br />name {summary?.brand}</div></div>
      <div className="mt-5 flex flex-col gap-2">
        {(hist.length ? hist : [{ id: 'now', startedAt: Date.now(), mentioned: sc, total: tot }]).slice(-4).map((h) => (
          <div key={h.id} className="flex items-center gap-2 text-[11px] text-slate-500"><span className="w-20 shrink-0">{new Date(h.startedAt).toLocaleDateString()}</span><div className="h-2 flex-1 rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${(h.mentioned / Math.max(1, h.total)) * 100}%`, background: AFTER }} /></div><span className="tnum w-12 text-right font-semibold text-slate-700">{h.mentioned}/{h.total}</span></div>
        ))}
      </div>
      <div className="mt-auto flex items-center gap-2 pt-3 text-[11px] text-slate-400"><Clock3 size={12} />Re-test in 7 days to see the change</div>
      <Ports />
    </div>
  )
}
const Card = ({ title, children, className = '' }: { title: string; children: any; className?: string }) => (
  <div className={`flex min-h-0 flex-col rounded-2xl border border-slate-100 bg-white p-5 ${className}`}><div className="text-[13.5px] font-semibold tracking-tight text-slate-800">{title}</div>{children}</div>
)
export function ImpactLive() {
  const summary = useLive((s) => s.summary), site = useLive((s) => s.site), risk = useLive((s) => s.risk), content = useLive((s) => s.content), facts = useLive((s) => s.facts), analysis = useLive((s) => s.analysis), pub = useLive((s) => s.publish), approval = useLive((s) => s.approval)
  const brand = summary?.brand ?? '', tot = summary?.total || 40, sc = summary?.mentioned ?? 0
  const rows = [...(summary?.competitors.slice(0, 4).map((c) => ({ n: c.name, v: c.count, me: false })) ?? []), { n: brand, v: sc, me: true }].sort((a, b) => b.v - a.v)
  const r = site ? rates(site.checks) : []
  const gaps = (site?.checks ?? []).filter((c: any) => c.status === 'fail').slice(0, 4)
  const bad = (risk?.items ?? []).filter((i: any) => !i.supported).length
  const did: [string, string | number][] = [['Buyer questions asked', summary?.answered ?? 0], ['Website checks run', site?.checks?.length ?? 0], ['Sourced facts extracted', facts?.facts?.length ?? 0], ['Sentences fact-checked', risk?.items?.length ?? 0], ['Unsupported claims caught', bad], ['FAQ answers drafted', content?.faqs?.length ?? 0], ['Pages published', pub?.files ? 1 : 0], ['Owner decisions', approval?.status && approval.status !== 'pending' ? 1 : 0]]
  return (
    <div className="card lyr flex h-full w-full flex-col overflow-hidden bg-slate-50/70">
      <div className="flex items-center gap-3 px-6 pb-3 pt-5"><div className="grid h-11 w-11 place-items-center rounded-[14px] bg-indigo-600 text-white"><TrendingUp size={21} /></div><div><div className="text-[21px] font-semibold tracking-tight">Impact · {brand}</div><div className="text-[12.5px] text-slate-500">Real audit from {summary?.answered ?? 0} Gemini answers</div></div><span className="ml-auto rounded-full border border-slate-200 bg-white px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[.12em] text-slate-400">Measured today</span></div>
      <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-2 gap-3 px-6 pb-6">
        <Card title="AI Visibility">
          <div className="mt-3 tnum text-[64px] font-semibold leading-[.85] tracking-[-.04em]" style={{ color: INK }}>{sc}<span className="text-[28px] tracking-normal text-slate-300">/{tot}</span></div>
          <div className="mt-2 text-[12px] text-slate-500">{Math.round((sc / tot) * 100)}% of buyer questions name {brand}</div>
          <div className="mt-4 flex gap-2"><Pill c="#4338ca" bg="#eef2ff">Top 3 in {summary?.top3 ?? 0}</Pill><Pill c="#4338ca" bg="#eef2ff">#1 in {summary?.first ?? 0}</Pill></div>
          <div className="mt-auto h-2 rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${(sc / tot) * 100}%`, background: AFTER }} /></div>
        </Card>
        <Card title="Share of voice">
          <div className="mt-3 flex flex-1 flex-col justify-around">{rows.map((x) => <div key={x.n}><div className="flex justify-between text-[12.5px]"><span className={x.me ? 'font-semibold text-rose-600' : 'text-slate-700'}>{x.n}</span><span className="tnum font-semibold text-slate-700">{x.v}</span></div><div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${(x.v / tot) * 100}%`, background: x.me ? '#e11d48' : AFTER }} /></div></div>)}</div>
        </Card>
        <Card title="Website readiness">
          <div className="mt-3 flex items-end gap-2"><span className="tnum text-[48px] font-semibold leading-none tracking-tight" style={{ color: INK }}>{site?.score ?? '–'}</span><span className="pb-1 text-[13px] text-slate-400">/100</span></div>
          <div className="mt-3 flex flex-1 flex-col justify-around">{r.map((x) => <div key={x.g}><div className="flex justify-between text-[11.5px] capitalize text-slate-500"><span>{x.g}</span><span className="tnum">{Math.round(x.rate * 100)}%</span></div><div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${x.rate * 100}%`, background: x.rate > 0.75 ? '#22c55e' : x.rate > 0.5 ? '#f59e0b' : '#ef4444' }} /></div></div>)}</div>
        </Card>
        <Card title="What the agents did">
          <div className="mt-2 flex flex-1 flex-col justify-between">{did.map(([l, v]) => <div key={l} className="flex items-center border-b border-slate-50 py-1 text-[12px] last:border-0"><span className="text-slate-700">{l}</span><span className="tnum ml-auto font-semibold text-slate-900">{v}</span></div>)}</div>
        </Card>
        <Card title="Biggest gaps found">
          <div className="mt-3 flex flex-1 flex-col justify-around">
            <div className="flex items-start gap-2 text-[12px] text-slate-700"><X size={14} strokeWidth={3} className="mt-0.5 shrink-0 text-rose-500" />{analysis?.missed.length ?? 0} buyer questions do not name {brand}</div>
            {gaps.map((g: any) => <div key={g.id} className="flex items-start gap-2 text-[12px] text-slate-700"><X size={14} strokeWidth={3} className="mt-0.5 shrink-0 text-rose-500" /><span className="line-clamp-2">{g.title}</span></div>)}
          </div>
        </Card>
        <Card title="Pilot target (illustrative)">
          <div className="mt-3 flex flex-1 flex-col justify-around">
            {[['Today', sc, '#cbd5e1'], ['Week 6 target', Math.min(tot, sc + 11), AFTER]].map(([l, v, c]: any) => <div key={l}><div className="flex justify-between text-[12px] text-slate-600"><span>{l}</span><span className="tnum font-semibold">{v}/{tot}</span></div><div className="mt-1 h-2.5 rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${(v / tot) * 100}%`, background: c }} /></div></div>)}
            <div className="text-[11px] leading-snug text-slate-400">A target for the pilot, not a measured result. The same 40 questions run again after 7 days.</div>
          </div>
        </Card>
      </div>
      <Ports />
    </div>
  )
}
