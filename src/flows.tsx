import { useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import {
  ArrowRight, BadgeCheck, ChartColumn, Check, ChevronLeft, Clock3, Coins, CornerDownRight, EyeOff, FileText, Globe, Lock, Mail,
  MessageCircle, MessageCircleQuestion, Phone, Pointer, Quote, RefreshCw, ShieldCheck, ShieldX, Sparkles, Star, TrendingDown, TrendingUp, UserCheck, X,
} from 'lucide-react'
import facebook from 'simple-icons/icons/facebook.svg'
import shopee from 'simple-icons/icons/shopee.svg'
import zalo from 'simple-icons/icons/zalo.svg'
import gmaps from 'simple-icons/icons/googlemaps.svg'
import { Logo } from './Chat'
import { Mask, Ports, SessionFrame, Skel, Spin, useRan } from './nodes'
import { PH, SCORES, SCORE_FLIP, ct, phaseOf, scoreAt, useP, useSim, week, weekLabel, type Provider } from './sim'
import { C } from './layout'

const cl = (x: number) => Math.max(0, Math.min(1, x))
const seg = (p: number, a: number, b: number) => cl((p - a) / (b - a))
const ease = (x: number) => 1 - Math.pow(1 - x, 3)

function Head({ icon: I, color, title, sub, right }: { icon: any; color: string; title: string; sub?: string; right?: any }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: `${color}14`, color }}><I size={18} /></div>
      <div className="min-w-0"><div className="truncate text-[14px] font-semibold tracking-tight">{title}</div>{sub && <div className="truncate text-[11px] text-slate-500">{sub}</div>}</div>
      {right && <div className="ml-auto shrink-0">{right}</div>}
    </div>
  )
}
const Pill = ({ c, bg, children }: { c: string; bg: string; children: any }) => (
  <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ color: c, background: bg }}>{children}</span>
)

/* ═════════════ 1 · Signals: mine real buyer questions ═════════════ */
const AV = ['#0ea5e9', '#f97316', '#8b5cf6', '#10b981', '#ec4899']
const MSGS = {
  zalo: [
    { n: 'L', t: 'Do you deliver same day to District 7?', tag: 'same-day' },
    { n: 'H', t: 'Is it safe for my 3-year-old?', tag: 'kids' },
    { n: 'M', t: 'Anything under 300k that keeps rice hot?', tag: 'under 300k' },
    { n: 'T', t: 'Can I order 50 for my office?', tag: 'bulk' },
    { n: 'V', t: 'Does it leak in a backpack?', tag: 'leak-proof' },
  ],
  shopee: [
    { n: 'K', t: 'How many hours does it stay hot?', tag: 'keeps hot' },
    { n: 'P', t: 'Is it microwave safe?', tag: 'microwave' },
    { n: 'A', t: '304 or 201 stainless steel?', tag: 'material' },
    { n: 'D', t: 'Under 300k with 3 compartments?', tag: 'under 300k' },
    { n: 'N', t: 'Gift box for office staff?', tag: 'gift' },
  ],
}
export function MineSourceNode({ data }: NodeProps<any>) {
  const p = useP('mining', 100), ran = useRan('mining')
  const z = data.src === 'zalo'
  return (
    <div className="card lyr flex h-full w-full flex-col overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3">
        <div className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: z ? '#0068FF14' : '#EE4D2D14' }}><Mask src={z ? zalo : shopee} color={z ? '#0068FF' : '#EE4D2D'} size={19} /></div>
        <div><div className="text-[14px] font-semibold tracking-tight">{z ? 'Zalo chats' : 'Shopee Q&A'}</div><div className="text-[11px] text-slate-500">{z ? 'xT Store inbox' : 'Product questions'}</div></div>
        <span className="tnum ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">{z ? '1,284' : '356'}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-3.5">
        {MSGS[data.src as 'zalo'].map((m, k) => {
          const show = ran && p >= 0.04 + k * 0.07, hit = ran && p >= 0.42 + k * 0.06
          return show ? (
            <div key={k} className="pop flex items-start gap-2">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold text-white" style={{ background: AV[k] }}>{m.n}</span>
              <div className="rounded-2xl rounded-tl-md px-3 py-1.5 text-[11.5px] leading-snug transition-all duration-500" style={hit ? { background: '#ecfeff', boxShadow: 'inset 0 0 0 1.5px #06b6d4', color: '#155e75' } : { background: z ? '#f1f5fb' : '#fff5f2', color: '#334155' }}>
                {m.t}{hit && <span className="pop ml-1.5 inline-flex rounded-full bg-cyan-600 px-1.5 align-middle text-[9.5px] font-semibold text-white">{m.tag}</span>}
              </div>
            </div>
          ) : <div key={k} className="flex gap-2"><div className="sk h-6 w-6 rounded-full!" /><div className="sk h-8 flex-1" /></div>
        })}
      </div>
      <Ports />
    </div>
  )
}
const TOPQ: [string, number][] = [['Same-day delivery in D7', 31], ['Under 300k VND', 27], ['Safe for kids', 22], ['Keeps rice hot 6 hours', 19], ['Bulk office orders', 14], ['Leak-proof lid', 11], ['Gift for office staff', 9], ['Microwave safe', 7]]
export function MineTopNode() {
  const p = useP('mining', 100), ran = useRan('mining')
  const g = ran ? ease(seg(p, 0.35, 0.82)) : 0
  return (
    <div className="card lyr flex h-full w-full flex-col overflow-hidden">
      <Head icon={MessageCircleQuestion} color={C.mining} title="Top buyer questions" sub="Mined from 1,640 real messages" />
      <div className="flex flex-1 flex-col gap-3.5 p-4">
        {TOPQ.map(([q, v], k) => (
          <div key={q}>
            <div className="flex items-baseline justify-between text-[12.5px]"><span className="font-medium text-slate-700">{q}</span><span className="tnum font-semibold text-cyan-700">{Math.round(v * g)}</span></div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${(v / 31) * 100 * g}%`, background: k < 3 ? C.mining : '#67e8f9', transition: 'width .4s ease' }} /></div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-3">
        <Pill c="#0e7490" bg="#ecfeff"><Sparkles size={11} />+12 new questions</Pill>
        <span className="ml-auto flex items-center gap-1.5 text-[11.5px] font-medium" style={{ color: ran && p > 0.85 ? '#16a34a' : '#94a3b8' }}>
          {ran && p > 0.85 ? <Check size={13} strokeWidth={3} /> : <Spin size={13} />}Sent to Planner
        </span>
      </div>
      <Ports />
    </div>
  )
}

/* ═════════════ 2 · Citations: pitch the sources AI trusts ═════════════ */
const SRC: [string, number, Provider[]][] = [
  ['top10lunchbox.vn', 18, ['gpt', 'pplx', 'gemini']], ['reviewhopcom.vn', 12, ['pplx', 'claude']], ['giadinh.blog', 9, ['gemini', 'gpt']],
  ['tinhte.vn', 7, ['pplx']], ['webtretho.com', 5, ['gpt']], ['mebimsua.vn', 4, ['claude']],
]
export function CiteSourcesNode() {
  const p = useP('citations', 100), ran = useRan('citations')
  const g = ran ? ease(seg(p, 0, 0.35)) : 0
  return (
    <div className="card lyr flex h-full w-full flex-col overflow-hidden">
      <Head icon={Quote} color={C.citations} title="Sources AI cites" sub="Found in 160 AI answers" />
      <div className="flex flex-1 flex-col gap-3 p-4">
        {SRC.map(([d, v, ps], k) => (
          <div key={d} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
            <div className="flex items-center gap-2 text-[12.5px]">
              <Globe size={13} className="text-slate-400" /><span className="font-medium text-slate-700">{d}</span>
              {k < 3 && ran && p > 0.38 && <span className="pop ml-auto"><Pill c="#be185d" bg="#fdf2f8">Target</Pill></span>}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200/70"><div className="h-full rounded-full" style={{ width: `${(v / 18) * 100 * g}%`, background: k < 3 ? C.citations : '#f9a8d4' }} /></div>
              <span className="tnum w-5 text-right text-[11px] font-semibold text-slate-500">{Math.round(v * g)}</span>
              <span className="flex -space-x-1">{ps.map((x) => <span key={x} className="grid h-[18px] w-[18px] place-items-center rounded-full border border-white bg-white"><Logo p={x} size={11} /></span>)}</span>
            </div>
          </div>
        ))}
      </div>
      <Ports />
    </div>
  )
}
const MAILS = [
  ['top10lunchbox.vn', 'Hi! Your Top 10 list is cited by AI assistants. Our 750ml box keeps rice hot 6 hours, from 189k VND. Can we send one to test?'],
  ['reviewhopcom.vn', 'Hello! We would love an honest review of our 304 steel thermal box. Same-day delivery in District 7.'],
  ['giadinh.blog', 'Hi team, thanks for the reply last week! The sample ships today with our spec sheet and prices.'],
]
export function CiteMailNode({ data }: NodeProps<any>) {
  const k = data.k, [to, body] = MAILS[k]
  const p = useP('citations', 200), ran = useRan('citations')
  const lp = ran ? seg(p, 0.3 + k * 0.17, 0.55 + k * 0.17) : 0
  const n = Math.floor(body.length * lp), writing = lp > 0 && lp < 1
  return (
    <div className="card lyr flex h-full w-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-100 px-3.5 py-2.5">
        <Mail size={15} style={{ color: C.citations }} />
        <span className="truncate text-[12.5px] font-semibold">To: {to}</span>
        <span className="ml-auto">{k === 2 && lp >= 1 ? <Pill c="#15803d" bg="#dcfce7"><Check size={11} strokeWidth={3} />Replied</Pill>
          : writing ? <Pill c="#be185d" bg="#fdf2f8">Writing</Pill> : lp >= 1 ? <Pill c="#475569" bg="#f1f5f9">For approval</Pill> : <Pill c="#94a3b8" bg="#f1f5f9">Queued</Pill>}</span>
      </div>
      <div className="flex-1 px-3.5 py-2.5 text-[11.5px] leading-[1.55] text-slate-600">
        {lp === 0 ? <Skel n={3} /> : <span className={writing ? 'caret' : ''}>{body.slice(0, n)}</span>}
      </div>
      {k === 2 && lp >= 1 && <div className="pop mx-3.5 mb-3 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-700"><CornerDownRight size={12} />“Send us a sample, we will review it!”</div>}
      <Ports />
    </div>
  )
}
export function CiteVerifyNode() {
  const ran = useRan('citations')
  return (
    <div className="lyr flex h-full w-full flex-col gap-2">
      <div className="flex items-center gap-2 rounded-xl border border-pink-100 bg-pink-50/70 px-3 py-2 text-[11.5px] font-medium text-pink-700"><BadgeCheck size={14} />Last week's pitch is now cited</div>
      <div className="min-h-0 flex-1">{ran ? <SessionFrame i={103} force name="Citation check" fs={10} /> : <div className="card h-full p-4"><Skel n={6} /></div>}</div>
      <Ports />
    </div>
  )
}

/* ═════════════ 3 · Channel Sync: one truth everywhere ═════════════ */
const ROWS = ['Price', 'Hours', 'Delivery']
const TRUTH = ['189k', '8:00–21:00', 'Same-day D7']
const CH = [
  { n: 'Shopee', src: shopee, c: '#EE4D2D', v: ['189k', '8:00–21:00', 'Same-day D7'], bad: [] as number[] },
  { n: 'Facebook', src: facebook, c: '#0866FF', v: ['210k', '8:00–21:00', 'Not listed'], bad: [0, 2] },
  { n: 'Google Maps', src: gmaps, c: '#34A853', v: ['189k', '9:00–20:00', 'Same-day D7'], bad: [1] },
  { n: 'Zalo OA', src: zalo, c: '#0068FF', v: ['199k', '8:00–21:00', 'Same-day D7'], bad: [0] },
]
const fixedAt = (k: number) => 0.7 + k * 0.06
export function SyncChanNode({ data }: NodeProps<any>) {
  const c = CH[data.k]
  const p = useP('sync', 100), ran = useRan('sync')
  const scanned = ran && p >= 0.12 + data.k * 0.04, fixed = ran && p >= fixedAt(data.k)
  return (
    <div className="card lyr flex h-full w-full flex-col overflow-hidden transition-[border-color] duration-500" style={fixed ? { borderColor: '#86efac' } : scanned && c.bad.length ? { borderColor: '#fca5a5' } : undefined}>
      <div className="flex items-center gap-2 px-3.5 py-3">
        <div className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: `${c.c}14` }}><Mask src={c.src} color={c.c} size={17} /></div>
        <span className="text-[13px] font-semibold tracking-tight">{c.n}</span>
        <span className="ml-auto">{!scanned ? <Spin size={14} /> : fixed || !c.bad.length
          ? <span className="pop grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white"><Check size={12} strokeWidth={3.5} /></span>
          : <span className="pop grid h-5 w-5 place-items-center rounded-full bg-rose-500 text-white"><X size={12} strokeWidth={3.5} /></span>}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 px-3.5 pb-3.5">
        {ROWS.map((r, i) => {
          const bad = c.bad.includes(i)
          return (
            <div key={r} className="rounded-lg bg-slate-50 px-2.5 py-1.5">
              <div className="text-[10px] font-medium uppercase tracking-[.08em] text-slate-400">{r}</div>
              {!scanned ? <div className="sk mt-1 h-3 w-3/4" />
                : <div className="mt-0.5 text-[12.5px] font-semibold transition-colors duration-500" style={{ color: bad ? (fixed ? '#16a34a' : '#e11d48') : '#334155' }}>
                    {bad && !fixed ? <span className="line-through decoration-2">{c.v[i]}</span> : bad ? <span className="pop inline-block">{TRUTH[i]}</span> : c.v[i]}
                  </div>}
            </div>
          )
        })}
      </div>
      <Ports />
    </div>
  )
}
export function SyncTruthNode() {
  const p = useP('sync', 100), ran = useRan('sync')
  const rows: [string, string][] = [['Price', 'from 189,000 VND'], ['Hours', '8:00–21:00 daily'], ['Delivery', 'Same-day in District 7'], ['Address', '12 Nguyen Luong Bang, D7'], ['Warranty', '12 months, 1-to-1']]
  const n = CH.filter((_, k) => ran && p >= fixedAt(k)).length + (ran && p >= 0.15 ? 0 : 0)
  return (
    <div className="card lyr flex h-full w-full flex-col overflow-hidden">
      <Head icon={ShieldCheck} color={C.sync} title="Source of truth" sub="One record, pushed to every channel" />
      <div className="flex flex-1 flex-col gap-2.5 p-4">
        {rows.map(([k, v], i) => {
          const on = ran && p >= 0.42 + i * 0.05
          return (
            <div key={k} className="flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors duration-500" style={{ borderColor: on ? '#bfdbfe' : '#f1f5f9', background: on ? '#eff6ff' : '#fff' }}>
              <span className="w-[62px] text-[10.5px] font-semibold uppercase tracking-[.08em] text-slate-400">{k}</span>
              {on ? <span className="pop text-[13px] font-semibold text-slate-800">{v}</span> : <div className="sk h-3 flex-1" />}
            </div>
          )
        })}
        <div className="mt-1 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-[12px] text-slate-600">
          <UserCheck size={15} className="text-slate-500" />Owner confirms the price once
          {ran && p >= 0.6 && <span className="pop ml-auto"><Pill c="#15803d" bg="#dcfce7"><Check size={11} strokeWidth={3} />Done</Pill></span>}
        </div>
      </div>
      <div className="flex items-center gap-3 border-t border-slate-100 px-4 py-3.5">
        <RefreshCw size={16} style={{ color: C.sync, animation: n < 4 && ran && p > 0.65 ? 'spin 1.2s linear infinite' : undefined }} />
        <span className="text-[13px] font-medium text-slate-700">Channels in sync</span>
        <span className="ml-auto flex items-center gap-1.5">{CH.map((c, k) => <span key={k} className="h-2.5 w-6 rounded-full transition-colors duration-500" style={{ background: k < n ? '#22c55e' : '#e2e8f0' }} />)}</span>
        <span className="tnum text-[15px] font-semibold" style={{ color: n === 4 ? '#16a34a' : '#64748b' }}>{n === 0 ? 1 : n}/4</span>
      </div>
      <Ports />
    </div>
  )
}

/* ═════════════ 5 · Risk Gate ═════════════ */
const CLAIMS = [
  { t: 'Keeps rice hot for 6 hours', ok: true, why: 'Matches lab spec' },
  { t: 'Best lunch box in Vietnam', ok: false, why: 'Unverifiable claim', fix: 'Rated 4.8★ by 312 Shopee buyers' },
  { t: 'From 189,000 VND', ok: true, why: 'Matches source of truth' },
  { t: 'Loved by 10,000 moms', ok: false, why: 'No evidence', fix: 'Sold 2,400+ boxes since 2024' },
]
export function RiskClaimsNode() {
  const p = useP('risk', 100), ran = useRan('risk')
  return (
    <div className="card lyr flex h-full w-full flex-col overflow-hidden">
      <Head icon={ShieldCheck} color={C.risk} title="Claim check" sub="Every sentence before it ships" />
      <div className="flex flex-1 flex-col justify-around px-4 py-1.5">
        {CLAIMS.map((c, k) => {
          const done = ran && p >= 0.06 + k * 0.1, fix = ran && !c.ok && p >= 0.12 + k * 0.1
          return (
            <div key={k} className="flex items-start gap-2.5">
              <div className="mt-0.5">{!done ? <Spin size={16} color={C.risk} /> : c.ok
                ? <span className="pop grid h-[18px] w-[18px] place-items-center rounded-full bg-emerald-500 text-white"><Check size={11} strokeWidth={3.5} /></span>
                : <span className="pop grid h-[18px] w-[18px] place-items-center rounded-full bg-rose-500 text-white"><X size={11} strokeWidth={3.5} /></span>}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[12.5px]">
                  <span className={`font-medium ${done && !c.ok ? 'text-slate-400 line-through decoration-rose-400 decoration-2' : 'text-slate-700'}`}>“{c.t}”</span>
                  {done && <span className="ml-auto text-[10.5px] text-slate-400">{c.why}</span>}
                </div>
                {fix && <div className="pop mt-1 flex items-center gap-1.5 text-[12px] font-medium text-emerald-700"><Sparkles size={12} />{c.fix}</div>}
              </div>
            </div>
          )
        })}
      </div>
      <Ports />
    </div>
  )
}
export function RiskPiiNode() {
  const p = useP('risk', 100), ran = useRan('risk')
  const hid = ran && p >= 0.5
  return (
    <div className="card lyr flex h-full w-full items-center gap-3 px-4">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600">{hid ? <EyeOff size={19} /> : <Lock size={19} />}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold tracking-tight">Personal data</div>
        <div className="mt-0.5 truncate font-mono text-[11.5px] transition-colors duration-500" style={{ color: hid ? '#64748b' : '#be123c' }}>
          {hid ? 'Ms. L•• · 09•• ••• 456 · [address hidden]' : 'Ms. Lan · 0908 123 456 · 15 Nguyen Thi Thap'}
        </div>
      </div>
      {hid && <span className="pop"><Pill c="#15803d" bg="#dcfce7"><Check size={11} strokeWidth={3} />Redacted</Pill></span>}
      <Ports />
    </div>
  )
}
const LANES = [
  { title: 'Auto-pass · 90%+', c: '#16a34a', bg: '#f0fdf4', docs: [['Product info', 97], ['FAQ page', 95], ['Review request', 93]] },
  { title: 'Owner review · below 90%', c: '#d97706', bg: '#fffbeb', docs: [['Blog pitch', 86]] },
] as const
export function RiskRouteNode() {
  const p = useP('risk', 100), ran = useRan('risk')
  let i = 0
  return (
    <div className="card lyr grid h-full w-full grid-cols-2 gap-3 p-3.5">
      {LANES.map((l) => (
        <div key={l.title} className="flex flex-col gap-1.5 rounded-xl p-2.5" style={{ background: l.bg }}>
          <div className="text-[10.5px] font-semibold uppercase tracking-[.08em]" style={{ color: l.c }}>{l.title}</div>
          {l.docs.map(([d, v]) => {
            const on = ran && p >= 0.62 + i++ * 0.07
            return on ? (
              <div key={d} className="pop flex items-center gap-2 rounded-lg bg-white px-2.5 py-1 text-[11.5px] font-medium shadow-[0_1px_2px_rgba(15,23,42,.08)]">
                <FileText size={12} className="text-slate-400" />{d}<span className="tnum ml-auto font-semibold" style={{ color: l.c }}>{v}%</span>
              </div>
            ) : <div key={d} className="h-[26px] rounded-lg border border-dashed" style={{ borderColor: `${l.c}55` }} />
          })}
        </div>
      ))}
      <Ports />
    </div>
  )
}

/* ═════════════ 6 · Owner approves on Zalo ═════════════ */
export function ZaloNode() {
  const p = useP('approve', 100), ran = useRan('approve')
  const sc = useSim((s) => scoreAt(s.t)), wk = useSim((s) => weekLabel(s.t))
  const at = (x: number) => ran && p >= x
  const press = at(0.48) && !at(0.56)
  return (
    <div className="relative h-full w-full rounded-[46px] bg-slate-900 p-[9px] shadow-[0_2px_4px_rgba(15,23,42,.2)]">
      <div className="relative flex h-full flex-col overflow-hidden rounded-[38px] bg-[#e5ebf2]">
        <div className="flex items-center justify-between bg-[#0068FF] px-6 pb-1 pt-3 text-[11px] font-semibold text-white"><span>21:04</span><span className="h-[18px] w-[76px] rounded-full bg-slate-900" /><span className="tnum">5G</span></div>
        <div className="flex items-center gap-2.5 bg-[#0068FF] px-3.5 pb-3 pt-1.5 text-white">
          <ChevronLeft size={20} />
          <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-indigo-400 to-violet-600"><Check size={18} strokeWidth={3.2} /></div>
          <div className="min-w-0"><div className="flex items-center gap-1 text-[14px] font-semibold">Picked <BadgeCheck size={14} /></div><div className="text-[10.5px] opacity-80">Official Account</div></div>
          <Phone size={17} className="ml-auto opacity-90" />
        </div>
        <div className="flex flex-1 flex-col gap-2.5 overflow-hidden p-3">
          {at(0.03) && (
            <div className="pop w-[86%] rounded-2xl rounded-tl-md bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,.08)]">
              <div className="text-[11px] font-medium text-slate-500">Weekly report · xT Store · Week {wk}</div>
              <div className="mt-1 flex items-baseline gap-2"><span className="tnum text-[30px] font-semibold leading-none tracking-tight text-emerald-600">{sc}<span className="text-slate-300">/40</span></span><span className="text-[11px] text-slate-500">AI Visibility</span></div>
              <div className="mt-2 flex h-6 items-end gap-1">{[2, 4, 7, 9, 12, 14].map((v, k) => <span key={k} className="flex-1 rounded-sm" style={{ height: `${(v / 14) * 100}%`, background: v <= sc ? '#22c55e' : '#e2e8f0' }} />)}</div>
            </div>
          )}
          {at(0.16) && (
            <div className="pop w-[86%] rounded-2xl rounded-tl-md bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,.08)]">
              <div className="text-[12.5px] font-semibold">4 fixes are ready</div>
              {[[FileText, 'Product info'], [MessageCircleQuestion, 'FAQ page'], [Mail, '3 blog pitches'], [RefreshCw, 'Prices on 3 channels']].map(([I, t]: any) => (
                <div key={t} className="mt-1.5 flex items-center gap-2 text-[11.5px] text-slate-600"><I size={13} className="text-[#0068FF]" />{t}</div>
              ))}
              <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1 text-[10.5px] text-amber-700"><ShieldX size={12} />2 claims rewritten by Risk Gate</div>
            </div>
          )}
          {at(0.28) && (
            <div className="pop relative flex w-[86%] gap-2">
              <span className={`relative flex-1 rounded-xl py-2 text-center text-[12.5px] font-semibold text-white transition-transform duration-150 ${press ? 'scale-95' : ''}`} style={{ background: at(0.56) ? '#16a34a' : '#0068FF' }}>
                {at(0.56) ? 'Approved' : 'Approve all'}
                {press && <span className="absolute inset-0 rounded-xl" style={{ animation: 'zping .6s ease-out', boxShadow: '0 0 0 0 #0068FF88' }} />}
              </span>
              <span className="rounded-xl bg-white px-3 py-2 text-[12.5px] font-semibold text-slate-600">Review</span>
              <span className="pointer-events-none absolute left-[38%] top-[55%]" style={{ opacity: at(0.36) && !at(0.66) ? 1 : 0, transform: at(0.4) ? 'translate(0,0)' : 'translate(60px,90px)', transition: 'transform 1s cubic-bezier(.3,.9,.3,1), opacity .4s' }}>
                <Pointer size={34} fill="#fde2c8" color="#334155" strokeWidth={1.4} />
              </span>
            </div>
          )}
          {at(0.6) && <div className="pop self-end rounded-2xl rounded-tr-md bg-[#d4e6ff] px-3 py-2 text-[12.5px] font-medium text-slate-800">Approve all ✓</div>}
          {at(0.72) && (
            <div className="pop w-[86%] rounded-2xl rounded-tl-md bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,.08)]">
              <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-emerald-700"><Check size={14} strokeWidth={3} />Publishing now</div>
              <div className="mt-2 flex gap-2">{[[shopee, '#EE4D2D'], [facebook, '#0866FF'], [gmaps, '#34A853'], [zalo, '#0068FF']].map(([s, c]) => <Mask key={c} src={s} color={c} size={16} />)}<Globe size={16} className="text-indigo-600" /></div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 border-t border-slate-200 bg-white px-3.5 py-3 text-[12px] text-slate-400"><MessageCircle size={16} />Message<span className="ml-auto h-4 w-16 rounded bg-slate-100" /></div>
      </div>
      <Ports />
    </div>
  )
}

/* ═════════════ Impact dashboard ═════════════
   Two-colour comparison system: neutral slate = week 1 (before), indigo = week 6 (after).
   Text always in slate inks; green appears only on delta chips, next to an arrow icon. */
const BEFORE = '#cbd5e1', AFTER = '#4f46e5', INK = '#0f172a', MUTED = '#64748b'
const WEEKS = [2, 4, 7, 9, 12, 14]
type TipT = { x: number; y: number; t: string } | null
function Tip({ tip }: { tip: TipT }) {
  if (!tip) return null
  return <div className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11.5px] font-medium text-white shadow-lg" style={{ left: tip.x, top: tip.y - 10 }}>{tip.t}</div>
}
const Delta = ({ children }: { children: any }) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"><TrendingUp size={11} strokeWidth={2.6} />{children}</span>
)
const Card = ({ title, sub, children, className = '' }: { title: string; sub?: string; children: any; className?: string }) => (
  <div className={`relative flex min-h-0 flex-col rounded-2xl border border-slate-100 bg-white p-5 ${className}`}>
    <div className="text-[13.5px] font-semibold tracking-tight text-slate-800">{title}</div>
    {sub && <div className="mt-0.5 text-[11.5px] text-slate-500">{sub}</div>}
    {children}
  </div>
)
const Legend = () => (
  <div className="flex items-center gap-3 text-[11px] text-slate-500">
    <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{ background: BEFORE }} />Week 1</span>
    <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{ background: AFTER }} />Week 6</span>
  </div>
)

/* hero: the one number that matters, streamed day by day — real progress is not a straight line */
// week-end days land exactly on the weekly score (2, 4, 7, 9, 12, 14); the days in between wander
const KEYS: [number, number][] = [[0, 2], [3, 2.4], [6, 2], [9, 3.1], [11, 3.5], [13, 4], [15, 5.6], [17, 4.9], [18, 5.4], [20, 7], [22, 8.4], [24, 7.5], [25, 7.9], [27, 9], [29, 9.9], [31, 10.8], [33, 11.7], [34, 12], [36, 11.3], [38, 12.8], [41, 14], [42, 14]]
const DAYS = 42
const ANCHORS = [0, 6, 13, 20, 27, 34, 41, 42]
const DAILY = Array.from({ length: DAYS + 1 }, (_, d) => {
  const j = KEYS.findIndex(([k]) => k >= d), [d1, v1] = KEYS[j], [d0, v0] = KEYS[Math.max(0, j - 1)]
  const base = d1 === d0 ? v1 : v0 + ((v1 - v0) * (d - d0)) / (d1 - d0)
  const near = Math.min(...ANCHORS.map((a) => Math.abs(a - d)))
  return base + Math.min(1, near / 2.5) * (0.28 * Math.sin(d * 2.1) + 0.18 * Math.sin(d * 5.3 + 1))
})
const EVENTS = [
  { d: 17, up: false, t: 'Rival promo' },
  { d: 21, up: true, t: 'Blog citations live' },
  { d: 26, up: false, t: 'Gemini update' },
  { d: 31, up: true, t: 'Prices synced' },
]
const valAt = (x: number) => { const i = Math.min(DAYS - 1, Math.floor(x)), f = x - i; return DAILY[i] + (DAILY[i + 1] - DAILY[i]) * f }
/** Catmull-Rom through the points, as cubic Béziers */
const smooth = (pts: number[][]) => {
  if (pts.length < 2) return ''
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)]
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
  }
  return d
}
function HeroVisibility({ g }: { g: number }) {
  const [tip, setTip] = useState<TipT>(null)
  const W = 520, H = 250, L = 30, Rr = 26, T = 30, B = 26
  const x = (d: number) => L + (d / DAYS) * (W - L - Rr), y = (v: number) => T + (1 - v / 16) * (H - T - B)
  const D = g * DAYS, n = Math.floor(D)
  const pts = DAILY.slice(0, n + 1).map((v, d) => [x(d), y(v)])
  const hv = valAt(Math.min(D, DAYS - 1e-6)), hx = x(D), hy = y(hv)
  if (D > n) pts.push([hx, hy])
  const line = smooth(pts)
  const prev = valAt(Math.max(0, D - 1.2)), rising = hv >= prev
  const now = Math.round(hv)
  return (
    <Card title="AI Visibility" sub="Buyer questions where AI recommends xT Store · re-tested daily" className="col-span-1">
      <div className="mt-3 flex items-end gap-4">
        <div className="tnum text-[64px] font-semibold leading-[.85] tracking-[-.04em]" style={{ color: INK }}>{now}<span className="text-[30px] tracking-normal text-slate-300">/40</span></div>
        <div className="pb-1.5">
          <div className="flex items-center gap-2">
            <Delta>+{Math.max(0, now - 2)} answers</Delta>
            {g > 0 && g < 1 && <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500"><span className="live-dot" style={{ ['--c' as any]: AFTER }} />Live</span>}
          </div>
          <div className="mt-1.5 text-[11.5px] text-slate-500">from <b className="font-semibold text-slate-700">2/40</b> on day 1</div>
        </div>
      </div>
      <svg width={W} height={H} className="mt-2 overflow-visible"
        onMouseMove={(e) => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(), sc = r.width / W, d = Math.round(((e.clientX - r.left) / sc - L) / ((W - L - Rr) / DAYS)); if (d < 0 || d > Math.min(D, DAYS)) return setTip(null); setTip({ x: 20 + x(d), y: 146 + y(DAILY[d]), t: `Day ${d + 1} · ${DAILY[d].toFixed(1)}/40 · week ${Math.min(6, Math.floor(d / 7) + 1)}` }) }}
        onMouseLeave={() => setTip(null)}>
        <defs>
          <linearGradient id="hv-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={AFTER} stopOpacity=".22" /><stop offset="1" stopColor={AFTER} stopOpacity="0" /></linearGradient>
          <linearGradient id="hv-line" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor="#a5b4fc" /><stop offset="1" stopColor={AFTER} /></linearGradient>
        </defs>
        {[0, 5, 10, 15].map((v) => <g key={v}><line x1={L} x2={W - Rr} y1={y(v)} y2={y(v)} stroke="#f1f5f9" /><text x={L - 8} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill="#94a3b8">{v}</text></g>)}
        {[0, 1, 2, 3, 4, 5].map((w) => <text key={w} x={x(w * 7 + 3.5)} y={H - 6} textAnchor="middle" fontSize="10.5" fill={D >= w * 7 ? '#64748b' : '#cbd5e1'}>W{w + 1}</text>)}
        {EVENTS.map((ev, k) => D >= ev.d && (
          <g key={ev.d} className="pop" style={{ transformOrigin: `${x(ev.d)}px ${y(DAILY[ev.d])}px` }}>
            <line x1={x(ev.d)} x2={x(ev.d)} y1={k % 2 ? 30 : 10} y2={y(0)} stroke={ev.up ? '#86efac' : '#fda4af'} strokeDasharray="3 4" />
            <foreignObject x={x(ev.d) - 60} y={k % 2 ? 14 : -8} width={120} height={22}>
              <div className="flex justify-center"><span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold" style={ev.up ? { background: '#f0fdf4', color: '#15803d' } : { background: '#fff1f2', color: '#be123c' }}>
                {ev.up ? <TrendingUp size={10} strokeWidth={2.8} /> : <TrendingDown size={10} strokeWidth={2.8} />}{ev.t}
              </span></div>
            </foreignObject>
          </g>
        ))}
        {pts.length > 1 && <path d={`${line} L${pts[pts.length - 1][0].toFixed(1)} ${y(0)} L${pts[0][0].toFixed(1)} ${y(0)} Z`} fill="url(#hv-area)" />}
        <path d={line} fill="none" stroke="url(#hv-line)" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
        {[0, 1, 2, 3, 4, 5].map((w) => { const d = w * 7 + 6; return D >= d && <circle key={w} cx={x(d)} cy={y(DAILY[d])} r={3} fill="#fff" stroke={AFTER} strokeWidth="1.6" /> })}
        <text x={x(0)} y={y(DAILY[0]) - 12} textAnchor="middle" fontSize="12" fontWeight="600" fill={MUTED}>2</text>
        {g > 0 && (
          <g>
            <line x1={hx} x2={hx} y1={hy + 8} y2={y(0)} stroke={AFTER} strokeOpacity=".25" strokeDasharray="2 3" />
            <circle cx={hx} cy={hy} r={11} fill={AFTER} opacity=".14"><animate attributeName="r" values="6;14;6" dur="1.4s" repeatCount="indefinite" /><animate attributeName="opacity" values=".28;0;.28" dur="1.4s" repeatCount="indefinite" /></circle>
            <circle cx={hx} cy={hy} r={5} fill="#fff" stroke={AFTER} strokeWidth="2.6" />
            <g transform={`translate(${Math.min(hx, W - Rr - 4)} ${hy - 30})`}>
              <rect x={-26} y={-11} width={52} height={20} rx={10} fill={INK} />
              <text x={-6} y={3.5} textAnchor="middle" fontSize="11" fontWeight="600" fill="#fff">{hv.toFixed(1)}</text>
              <path d={rising ? 'M13 3 L17 -3 L21 3 Z' : 'M13 -3 L17 3 L21 -3 Z'} fill={rising ? '#4ade80' : '#fb7185'} />
            </g>
          </g>
        )}
      </svg>
      <Tip tip={tip} />
    </Card>
  )
}

/* KPI tile: the after value, the before value, and a before/after bar pair on one scale */
const TILES = [
  { icon: Quote, label: 'Share of AI answers', b: 5, a: 35, fmt: (v: number) => `${Math.round(v)}%`, delta: '7× more' },
  { icon: Clock3, label: 'Owner time per week', b: 360, a: 15, fmt: (v: number) => (v >= 60 ? `${(v / 60).toFixed(1).replace('.0', '')} h` : `${Math.round(v)} min`), delta: '−96%' },
  { icon: Coins, label: 'Cost per month', b: 15, a: 0.99, fmt: (v: number) => `${v < 2 ? v.toFixed(2) : Math.round(v)}M ₫`, delta: '−93%' },
  { icon: RefreshCw, label: 'Channels in sync', b: 1, a: 4, fmt: (v: number) => `${Math.round(v)}/4`, delta: '+3 channels' },
]
function Tile({ t, g }: { t: (typeof TILES)[number]; g: number }) {
  const I = t.icon, v = t.b + (t.a - t.b) * g, max = Math.max(t.b, t.a)
  return (
    <div className="flex min-h-0 flex-col rounded-2xl border border-slate-100 bg-white p-4">
      <div className="flex items-center gap-2 text-[12px] font-medium text-slate-500"><I size={14} className="text-slate-400" />{t.label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="tnum text-[30px] font-semibold leading-none tracking-tight" style={{ color: INK }}>{t.fmt(v)}</span>
        <span style={{ opacity: g > 0.95 ? 1 : 0, transition: 'opacity .4s' }}><Delta>{t.delta}</Delta></span>
      </div>
      <div className="mt-auto flex flex-col gap-1.5 pt-3">
        {[['W1', t.b, BEFORE, MUTED], ['W6', v, AFTER, INK]].map(([k, val, c, ink]: any) => (
          <div key={k} className="flex items-center gap-2" title={`${k === 'W1' ? 'Week 1' : 'Week 6'}: ${t.fmt(val)}`}>
            <span className="w-6 text-[10px] font-semibold text-slate-400">{k}</span>
            <div className="h-2 flex-1 rounded-full bg-slate-50"><div className="h-full rounded-full" style={{ width: `${Math.max(2, (val / max) * 100)}%`, background: c }} /></div>
            <span className="tnum w-14 text-right text-[11px] font-semibold" style={{ color: ink }}>{t.fmt(val)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* dumbbell: each AI, week 1 dot → week 6 dot on a shared 0–10 scale */
const BY_AI: [Provider, string, number, number][] = [['gpt', 'ChatGPT', 1, 4], ['claude', 'Claude', 0, 3], ['gemini', 'Gemini', 1, 3], ['pplx', 'Perplexity', 0, 4]]
function Dumbbells({ g }: { g: number }) {
  const [tip, setTip] = useState<TipT>(null)
  const X0 = 100, X1 = 300, sx = (v: number) => X0 + (v / 10) * (X1 - X0)
  return (
    <Card title="Mentions per AI" sub="Out of 10 buyer questions each">
      <div className="mt-2"><Legend /></div>
      <svg width={340} height={230} className="mt-2 overflow-visible" onMouseLeave={() => setTip(null)}>
        {[0, 5, 10].map((v) => <g key={v}><line x1={sx(v)} x2={sx(v)} y1={8} y2={204} stroke="#f1f5f9" /><text x={sx(v)} y={222} textAnchor="middle" fontSize="10" fill="#94a3b8">{v}</text></g>)}
        {BY_AI.map(([p, name, b, a], k) => {
          const cy = 30 + k * 50, av = b + (a - b) * g
          return (
            <g key={p} onMouseEnter={() => setTip({ x: 20 + sx(av), y: 110 + cy - 4, t: `${name}: ${b} → ${a} of 10` })}>
              <rect x={0} y={cy - 22} width={340} height={44} fill="transparent" />
              <foreignObject x={0} y={cy - 11} width={96} height={22}><div className="flex items-center gap-1.5 text-[12px] font-medium text-slate-700"><Logo p={p} size={15} />{name}</div></foreignObject>
              <line x1={sx(b)} x2={sx(av)} y1={cy} y2={cy} stroke={AFTER} strokeOpacity=".35" strokeWidth="3" strokeLinecap="round" />
              <circle cx={sx(b)} cy={cy} r={6} fill={BEFORE} stroke="#fff" strokeWidth="2" />
              <circle cx={sx(av)} cy={cy} r={7} fill={AFTER} stroke="#fff" strokeWidth="2" />
              <text x={X1 + 12} y={cy + 4} fontSize="12" fontWeight="600" fill={INK}>{Math.round(av)}<tspan fill="#94a3b8" fontWeight="400"> /10</tspan></text>
            </g>
          )
        })}
      </svg>
      <Tip tip={tip} />
    </Card>
  )
}

/* attribution: where the 12 new answers came from (one hue, sorted) */
const WHY: [any, string, number][] = [[Quote, 'Cited by review blogs', 5], [FileText, 'FAQ and product info', 4], [RefreshCw, 'Same price on every channel', 2], [Star, 'New buyer reviews', 1]]
function WhyItWorked({ g }: { g: number }) {
  return (
    <Card title="Where the +12 answers came from" sub="Each fix re-tested in AI chats">
      <div className="mt-4 flex flex-1 flex-col justify-around">
        {WHY.map(([I, l, v]) => (
          <div key={l} title={`${l}: +${v} answers`}>
            <div className="flex items-center gap-2 text-[12.5px] text-slate-700"><I size={14} className="text-slate-400" />{l}<span className="tnum ml-auto font-semibold" style={{ color: INK }}>+{Math.round(v * g)}</span></div>
            <div className="mt-1.5 h-2.5 rounded-full bg-slate-50"><div className="h-full rounded-full" style={{ width: `${(v / 5) * 100 * g}%`, background: AFTER }} /></div>
          </div>
        ))}
      </div>
    </Card>
  )
}

/* cost & time: two comparisons, each on its own scale */
function CostTime({ g }: { g: number }) {
  const rows = [
    { title: 'Cost per month', items: [['Marketing agency', 15000, '15,000k ₫'], ['Picked', 990, '990k ₫']] },
    { title: 'Owner time per week', items: [['Doing it by hand', 360, '6 hours'], ['Picked', 15, '15 min']] },
  ] as const
  return (
    <Card title="Cost and time" sub="Same goal, done by agents">
      <div className="mt-4 flex flex-1 flex-col justify-around gap-4">
        {rows.map((r) => {
          const max = r.items[0][1]
          return (
            <div key={r.title}>
              <div className="text-[11px] font-semibold uppercase tracking-[.08em] text-slate-400">{r.title}</div>
              {r.items.map(([l, v, lab], k) => (
                <div key={l} className="mt-2" title={`${l}: ${lab}`}>
                  <div className="flex text-[12px]"><span className={k ? 'font-semibold text-slate-800' : 'text-slate-500'}>{l}</span><span className={`tnum ml-auto ${k ? 'font-semibold text-slate-800' : 'text-slate-500'}`}>{lab}</span></div>
                  <div className="mt-1 h-2.5 rounded-full bg-slate-50"><div className="h-full rounded-full" style={{ width: `${Math.max(1.5, (v / max) * 100 * (k ? 1 : 1))}%`, background: k ? AFTER : BEFORE, opacity: k ? Math.max(0.15, g) : 1 }} /></div>
                </div>
              ))}
            </div>
          )
        })}
        <div className="flex gap-2"><Delta>−93% cost</Delta><Delta>−96% time</Delta></div>
      </div>
    </Card>
  )
}

export function ImpactNode() {
  const p = useP('impact', 100), ran = useRan('impact')
  const g = ran ? ease(seg(p, 0.04, 0.6)) : 0
  const gs = ran ? seg(p, 0.02, 0.86) : 0 // the hero line streams in at a steady pace
  return (
    <div className="card lyr flex h-full w-full flex-col overflow-hidden bg-slate-50/70">
      <div className="flex items-center gap-3 px-6 pb-3 pt-5">
        <div className="grid h-11 w-11 place-items-center rounded-[14px] bg-indigo-600 text-white"><ChartColumn size={21} /></div>
        <div><div className="text-[21px] font-semibold tracking-tight">Impact</div><div className="text-[12.5px] text-slate-500">xT Store · 6-week pilot · 1 owner, 0 new software</div></div>
        <div className="ml-auto flex items-center gap-3"><Legend /><span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[.12em] text-slate-400">Illustrative projection</span></div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[560px_1fr] gap-3 px-6">
        <HeroVisibility g={gs} />
        <div className="grid min-h-0 grid-cols-2 grid-rows-2 gap-3">{TILES.map((t) => <Tile key={t.label} t={t} g={g} />)}</div>
      </div>
      <div className="grid h-[380px] shrink-0 grid-cols-3 gap-3 px-6 pb-6 pt-3">
        <Dumbbells g={g} />
        <WhyItWorked g={g} />
        <CostTime g={g} />
      </div>
      <Ports />
    </div>
  )
}

/* ═════════════ Track: this week's visibility, streamed day by day ═════════════ */
const AI_SPLIT: [Provider, string, number][] = [['gpt', 'ChatGPT', 0.3], ['claude', 'Claude', 0.2], ['gemini', 'Gemini', 0.2], ['pplx', 'Perplexity', 0.3]]
const split = (sc: number) => {
  const raw = AI_SPLIT.map(([, , w]) => w * sc), out = raw.map(Math.floor)
  let left = sc - out.reduce((a, b) => a + b, 0)
  raw.map((r, k) => [r - out[k], k]).sort((a, b) => b[0] - a[0]).forEach(([, k]) => { if (left-- > 0) out[k]++ })
  return out
}
export function TrackCard() {
  const t = useSim((s) => Math.round(s.t * 20) / 20)
  const active = phaseOf(t) === 'track'
  const sc = scoreAt(t), wk = weekLabel(t), n = week(t)
  const c = ct(t), [s0, s1] = PH.track
  const f = c < s0 ? 0 : Math.min(1, (c - s0) / SCORE_FLIP) // the head reaches the week's last day exactly when the score flips
  const D = Math.max(0.01, Math.min(DAYS, ((n + 1) + f) * 7 - 1))
  const prevSc = SCORES[Math.max(0, SCORES.indexOf(sc) - 1)], delta = sc - prevSc
  const W = 350, H = 150, L = 4, Rr = 10, T = 14, B = 22
  const x = (d: number) => L + (d / DAYS) * (W - L - Rr), y = (v: number) => T + (1 - v / 16) * (H - T - B)
  const nI = Math.floor(D), pts = DAILY.slice(0, nI + 1).map((v, d) => [x(d), y(v)])
  const hv = valAt(Math.min(D, DAYS - 1e-6)), hx = x(D), hy = y(hv)
  if (D > nI) pts.push([hx, hy])
  const line = smooth(pts), per = split(sc)
  return (
    <div className="card flex h-full w-full flex-col p-5 transition-shadow duration-700" style={active ? { boxShadow: '0 0 0 6px #4f46e514', borderColor: '#4f46e566' } : undefined}>
      <div className="flex items-center gap-2.5">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><TrendingUp size={18} /></div>
        <div><div className="text-[15px] font-semibold tracking-tight">AI Visibility</div><div className="text-[11.5px] text-slate-500">Re-tested every day</div></div>
        <span className="ml-auto flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">{active && <span className="live-dot" style={{ ['--c' as any]: AFTER }} />}Week {wk}</span>
      </div>
      <div className="mt-4 flex items-end gap-3">
        <span key={sc} className="pop tnum text-[52px] font-semibold leading-[.85] tracking-[-.04em]" style={{ color: INK }}>{sc}<span className="text-[24px] tracking-normal text-slate-300">/40</span></span>
        <div className="pb-1">{delta > 0 ? <Delta>+{delta} vs last week</Delta> : <span className="text-[11.5px] text-slate-500">Baseline week</span>}<div className="mt-1 text-[11px] text-slate-400">{Math.round((sc / 40) * 100)}% of buyer questions</div></div>
      </div>
      <svg width={W} height={H} className="mt-3 overflow-visible">
        <defs>
          <linearGradient id="tk-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={AFTER} stopOpacity=".2" /><stop offset="1" stopColor={AFTER} stopOpacity="0" /></linearGradient>
          <linearGradient id="tk-line" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor="#a5b4fc" /><stop offset="1" stopColor={AFTER} /></linearGradient>
        </defs>
        {[0, 1, 2, 3, 4, 5].map((w) => <rect key={w} x={x(w * 7)} y={T - 6} width={x(7) - x(0) - 2} height={H - T - B + 6} rx={6} fill={w === n + (f > 0 ? 1 : 0) ? '#f5f7ff' : 'transparent'} />)}
        {[5, 10, 15].map((v) => <line key={v} x1={L} x2={W - Rr} y1={y(v)} y2={y(v)} stroke="#f1f5f9" />)}
        <line x1={L} x2={W - Rr} y1={y(0)} y2={y(0)} stroke="#e2e8f0" />
        <path d={`M${hx.toFixed(1)} ${y(0)} H${W - Rr}`} stroke="#e2e8f0" strokeDasharray="2 5" />
        {pts.length > 1 && <path d={`${line} L${hx.toFixed(1)} ${y(0)} L${pts[0][0].toFixed(1)} ${y(0)} Z`} fill="url(#tk-area)" />}
        <path d={line} fill="none" stroke="url(#tk-line)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        {EVENTS.map((ev) => D >= ev.d && <circle key={ev.d} cx={x(ev.d)} cy={y(DAILY[ev.d])} r={3.5} fill={ev.up ? '#22c55e' : '#f43f5e'} stroke="#fff" strokeWidth="1.5"><title>{ev.t}</title></circle>)}
        <circle cx={hx} cy={hy} r={10} fill={AFTER} opacity=".15">{active && <><animate attributeName="r" values="5;12;5" dur="1.4s" repeatCount="indefinite" /><animate attributeName="opacity" values=".3;0;.3" dur="1.4s" repeatCount="indefinite" /></>}</circle>
        <circle cx={hx} cy={hy} r={4.5} fill="#fff" stroke={AFTER} strokeWidth="2.4" />
        {[0, 1, 2, 3, 4, 5].map((w) => <text key={w} x={x(w * 7 + 3.5)} y={H - 5} textAnchor="middle" fontSize="10" fontWeight={w === n + (f > 0 ? 1 : 0) ? 600 : 400} fill={x(w * 7) <= hx ? '#64748b' : '#cbd5e1'}>W{w + 1}</text>)}
      </svg>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {AI_SPLIT.map(([pv, name], k) => (
          <div key={pv} className="rounded-xl bg-slate-50 px-2 py-2" title={`${name}: ${per[k]} questions`}>
            <div className="flex items-center gap-1.5"><Logo p={pv} size={13} /><span className="tnum text-[14px] font-semibold" style={{ color: INK }}>{per[k]}</span></div>
            <div className="mt-1.5 h-1 rounded-full bg-slate-200/70"><div className="h-full rounded-full" style={{ width: `${(per[k] / 5) * 100}%`, background: AFTER, transition: 'width .6s ease' }} /></div>
          </div>
        ))}
      </div>
      <div className="mt-auto flex items-center gap-2 pt-3 text-[11px] text-slate-400">
        <RefreshCw size={12} style={active ? { animation: 'spin 1.4s linear infinite' } : undefined} />Loops back to Research every week
        <span className="ml-auto flex items-center gap-2"><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-emerald-500" />win</span><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-rose-500" />dip</span></span>
      </div>
      <Ports />
    </div>
  )
}

export const flowTypes = {
  minesrc: MineSourceNode, minetop: MineTopNode, citesrc: CiteSourcesNode, citemail: CiteMailNode, citever: CiteVerifyNode,
  syncchan: SyncChanNode, synctruth: SyncTruthNode, riskclaims: RiskClaimsNode, riskpii: RiskPiiNode, riskroute: RiskRouteNode,
  zalo: ZaloNode, impact: ImpactNode, track: TrackCard,
}
