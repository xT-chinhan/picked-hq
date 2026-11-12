import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  Bot, Check, FileText, Globe, ListChecks, Loader2, Lock, Mail, MessageCircleQuestion, Minus, MousePointer2,
  PenLine, RefreshCw, Scale, ScanSearch, Search, Send, ShieldCheck, Star, Store, TrendingUp, UserCheck, X,
} from 'lucide-react'
import facebook from 'simple-icons/icons/facebook.svg'
import shopee from 'simple-icons/icons/shopee.svg'
import zalo from 'simple-icons/icons/zalo.svg'
import gmaps from 'simple-icons/icons/googlemaps.svg'
import Chat, { BRAND, Logo } from './Chat'
import { ChartColumn, Inbox, Quote, ShieldX } from 'lucide-react'
import {
  CHECKS, DIAG, DOCS, PH, QUESTIONS, RIVALS, SCORES, TOTAL_Q, ct, cyc, prog, scoreAt, scoutName, stagger,
  useP, usePhase, useSession, useSim, week, type Phase,
} from './sim'

export const Ports = () => (
  <>
    <Handle id="l" type="target" position={Position.Left} />
    <Handle id="t" type="target" position={Position.Top} />
    <Handle id="r" type="source" position={Position.Right} />
    <Handle id="b" type="source" position={Position.Bottom} />
    <Handle id="ts" type="source" position={Position.Top} />
    <Handle id="bt" type="target" position={Position.Bottom} />
  </>
)
export const useRan = (k: Phase) => useSim((s) => cyc(s.t) > 0 || ct(s.t) >= PH[k][0])
export const Spin = ({ size = 14, color = '#94a3b8' }) => <Loader2 size={size} color={color} style={{ animation: 'spin 1s linear infinite' }} />

/* ───────────── department frame ───────────── */
export const DEPT_ICON = { research: Search, analysis: ScanSearch, content: PenLine, qa: ShieldCheck, approve: UserCheck, publish: Send, track: TrendingUp, intake: Store, mining: Inbox, citations: Quote, sync: RefreshCw, risk: ShieldX, impact: ChartColumn }
export function DeptNode({ data }: NodeProps<any>) {
  const active = usePhase() === data.phase
  const Icon = DEPT_ICON[data.phase as Phase]
  return (
    <div
      className="relative h-full w-full rounded-[28px] border transition-all duration-700"
      style={{
        background: active ? `linear-gradient(180deg, ${data.color}0d, #ffffffcc 34%)` : '#ffffff99',
        borderColor: active ? `${data.color}66` : '#e3e6ee',
        boxShadow: active ? `0 0 0 6px ${data.color}14` : 'none',
      }}
    >
      <div className="flex h-[76px] items-center gap-3.5 px-6">
        <div className="grid h-11 w-11 place-items-center rounded-[14px] text-white" style={{ background: data.color }}><Icon size={22} strokeWidth={2.2} /></div>
        <div>
          <div className="text-[21px] font-semibold tracking-tight">{data.title}</div>
          <div className="text-[12.5px] text-slate-500">{data.sub}</div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex -space-x-2">
            {Array.from({ length: Math.min(5, data.agents) }).map((_, k) => (
              <div key={k} className={`grid h-7 w-7 place-items-center rounded-full border-2 border-white`} style={{ background: `color-mix(in srgb, ${data.color} 14%, #fff)`, color: data.color, animationDelay: `${k * 0.14}s` }}><Bot size={14} /></div>
            ))}
          </div>
          <span className="tnum text-[13px] font-medium text-slate-500">{data.agents} agents</span>
          <span className="flex items-center gap-2 rounded-full px-3 py-1 text-[12.5px] font-semibold" style={{ background: active ? `${data.color}14` : '#f1f5f9', color: active ? data.color : '#94a3b8' }}>
            {active ? <span className="live-dot" style={{ ['--c' as any]: data.color }} /> : <Check size={13} strokeWidth={3} />}
            {active ? 'Working' : 'Standby'}
          </span>
        </div>
      </div>
      <Ports />
    </div>
  )
}

/* ───────────── client ───────────── */
export function StoreNode() {
  const active = usePhase() === 'intake'
  return (
    <div className="card h-full w-full p-5 transition-shadow duration-700" style={active ? { boxShadow: '0 0 0 6px #4f46e514', borderColor: '#4f46e566' } : undefined}>
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.14em] text-slate-400">Client<span className="live-dot ml-auto" /></div>
      <div className="mt-4 grid h-14 w-14 place-items-center rounded-2xl bg-slate-900 text-white"><Store size={26} /></div>
      <div className="mt-3 text-[24px] font-semibold tracking-tight">xT Store</div>
      <div className="text-[13px] text-slate-500">Thermal lunch boxes</div>
      <div className="mt-3 flex flex-wrap gap-1.5 text-[11.5px] font-medium text-slate-600">
        <span className="rounded-full bg-slate-100 px-2.5 py-1">District 7, HCMC</span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1">No website</span>
      </div>
      <Ports />
    </div>
  )
}

/* ───────────── research ───────────── */
export function PlannerNode() {
  const p = useP('research', 200)
  const n = Math.round(p * TOTAL_Q)
  const top = useSim((s) => Math.floor(s.t / 1.1))
  return (
    <div className="card lyr flex h-full w-full flex-col p-4">
      <div className="flex items-center gap-2.5">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><ListChecks size={18} /></div>
        <div><div className="text-[14px] font-semibold">Planner</div><div className="text-[11px] text-slate-500">Asks like real buyers</div></div>
      </div>
      <div className="relative mx-auto mt-5 grid h-[132px] w-[132px] place-items-center">
        <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
          <circle cx="50" cy="50" r="44" fill="none" stroke="#eef0f6" strokeWidth="7" />
          <circle cx="50" cy="50" r="44" fill="none" stroke="#4f46e5" strokeWidth="7" strokeLinecap="round" strokeDasharray={276.5} strokeDashoffset={276.5 * (1 - p)} style={{ transition: 'stroke-dashoffset .4s linear' }} />
        </svg>
        <div className="text-center"><div className="tnum text-[34px] font-semibold leading-none tracking-tight">{n}<span className="text-slate-300">/{TOTAL_Q}</span></div><div className="mt-1 text-[10.5px] font-medium uppercase tracking-[.12em] text-slate-400">questions</div></div>
      </div>
      <div className="mt-5 flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
        {Array.from({ length: 11 }).map((_, k) => {
          const q = QUESTIONS[(top + k) % QUESTIONS.length]
          return (
            <div key={k} className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/70 px-2.5 py-[7px] text-[11px] text-slate-600" style={{ opacity: 1 - k * 0.075 }}>
              <MessageCircleQuestion size={13} className="shrink-0 text-indigo-500" /><span className="truncate">{q}</span>
            </div>
          )
        })}
      </div>
      <Ports />
    </div>
  )
}

const STATUS = { boot: 'opening', type: 'typing', think: 'waiting', answer: 'reading', done: 'logged' }
export function SessionFrame({ i, force, fs, name }: { i: number; force?: boolean; fs?: number; name?: string }) {
  const s = useSession(i, force)
  const done = s.stage === 'done'
  const tone = done ? (s.mentioned ? '#22c55e' : '#f87171') : '#e6e8ef'
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-[14px] bg-white transition-[box-shadow,border-color] duration-500" style={{ border: `1px solid ${tone}`, boxShadow: done ? `0 0 0 3px ${tone}2e` : 'none' }}>
      <div className="flex flex-none items-center gap-1.5 px-2.5 py-[5px] text-slate-500" style={{ fontSize: (fs ?? 9) * 1.08 }}>
        <Bot size={(fs ?? 9) * 1.4} className="text-indigo-500" />
        <span className="font-semibold text-slate-700">{name ?? scoutName(i)}</span>
        <span className="ml-auto flex items-center gap-1.5">{!done && <span className="mini-dot" style={{ background: '#6366f1' }} />}{STATUS[s.stage]}</span>
      </div>
      <div className="min-h-0 flex-1 border-t border-slate-100"><Chat s={s} fs={fs} /></div>
    </div>
  )
}
export function SessionNode({ data }: NodeProps<any>) {
  return <div className="lyr h-full w-full"><SessionFrame i={data.i} /><Ports /></div>
}
export function RetestNode({ data }: NodeProps<any>) {
  const ran = useRan('qa')
  return (
    <div className="lyr h-full w-full">
      {ran ? <SessionFrame i={data.i} force name={`Retest-${data.i - 99}`} fs={9.6} /> : <div className="card h-full w-full p-4"><Skel n={6} /></div>}
      <Ports />
    </div>
  )
}
export const Skel = ({ n = 4 }) => <div className="flex flex-col gap-2.5">{Array.from({ length: n }).map((_, k) => <div key={k} className="sk h-3" style={{ width: `${[88, 70, 94, 56, 80, 64][k % 6]}%` }} />)}</div>

/* ───────────── analysis ───────────── */
export function DiagNode({ data }: NodeProps<any>) {
  const d = DIAG[data.k]
  const p = useP('analysis', 50)
  const ran = useRan('analysis')
  const w = useSim((s) => week(s.t))
  const lp = stagger(p, data.k, 4, 0.1)
  const st = w >= d.okFrom ? 'ok' : d.key === 'Understood' || (d.key === 'Chosen' && w >= 3) ? 'warn' : 'bad'
  const C = { ok: ['#16a34a', '#ecfdf3', Check], warn: ['#d97706', '#fffbeb', Minus], bad: ['#dc2626', '#fef2f2', X] }[st] as any
  const I = C[2]
  const ready = lp >= 1
  return (
    <div className="card flex h-full w-full items-center gap-3.5 px-4">
      {!ran ? <div className="sk h-12 w-12 rounded-2xl!" /> : !ready
        ? <div className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-50"><Spin size={20} color="#7c3aed" /></div>
        : <div key={st} className="pop grid h-12 w-12 place-items-center rounded-2xl text-white" style={{ background: C[0] }}><I size={24} strokeWidth={3} /></div>}
      <div className="min-w-0 flex-1">
        <div className="text-[16px] font-semibold tracking-tight">{d.key}</div>
        {ready ? <div className="text-[11.5px] leading-snug text-slate-500">{st === 'ok' ? d.text : d.bad}</div> : <div className="sk mt-1.5 h-2.5 w-4/5" />}
      </div>
      <Ports />
    </div>
  )
}
export function RivalsNode() {
  const p = useP('analysis', 50)
  const me = useSim((s) => scoreAt(s.t))
  const rows = [...RIVALS.map((r) => ({ n: r.n, v: r.v, me: false })), { n: 'xT Store', v: me, me: true }]
  return (
    <div className="card h-full w-full p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[.12em] text-slate-400">Who AI picks</div>
      <div className="mt-4 flex flex-col gap-4">
        {rows.map((r, k) => (
          <div key={r.n}>
            <div className="flex items-baseline justify-between text-[13px]"><span className={r.me ? 'font-semibold text-rose-600' : 'font-medium text-slate-700'}>{r.n}</span><span className={`tnum font-semibold ${r.me ? 'text-rose-600' : 'text-indigo-600'}`}>{Math.round(r.v * Math.min(1, p * 1.4))}</span></div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${(r.v / TOTAL_Q) * 100 * Math.min(1, p * 1.4)}%`, background: r.me ? '#e11d48' : ['#4f46e5', '#6d73ee', '#a5b4fc'][k], transition: 'width .5s ease' }} /></div>
          </div>
        ))}
      </div>
      <Ports />
    </div>
  )
}
export function ShareNode() {
  const me = useSim((s) => scoreAt(s.t))
  const pct = Math.round((me / TOTAL_Q) * 100)
  return (
    <div className="card flex h-full w-full flex-col items-center justify-center p-4">
      <div className="relative grid h-[150px] w-[150px] place-items-center">
        <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
          <circle cx="50" cy="50" r="42" fill="none" stroke="#f1f2f7" strokeWidth="10" />
          <circle cx="50" cy="50" r="42" fill="none" stroke={pct >= 25 ? '#16a34a' : '#e11d48'} strokeWidth="10" strokeLinecap="round" strokeDasharray={263.9} strokeDashoffset={263.9 * (1 - me / TOTAL_Q)} style={{ transition: 'stroke-dashoffset 1s ease, stroke .6s' }} />
        </svg>
        <div key={pct} className="pop tnum text-[40px] font-semibold tracking-tight">{pct}<span className="text-[20px] text-slate-400">%</span></div>
      </div>
      <div className="mt-3 text-center text-[12.5px] leading-snug text-slate-500">of buyer questions<br />recommend xT Store</div>
      <Ports />
    </div>
  )
}

/* ───────────── content ───────────── */
const DOC_ICON = { info: FileText, faq: MessageCircleQuestion, pitch: Mail, review: Star }
export function WriterBody({ k, fs = 11.5 }: { k: number; fs?: number }) {
  const d = DOCS[k]
  const p = useP('content', 400)
  const ran = useRan('content')
  const lp = stagger(p, k, 4, 0.55)
  const n = Math.floor(d.text.length * lp)
  const I = DOC_ICON[d.key]
  const writing = lp > 0 && lp < 1
  return (
    <div className="flex h-full w-full flex-col" style={{ fontSize: fs }}>
      <div className="flex items-center gap-[.8em] border-b border-slate-100 px-[1.2em] py-[.9em]">
        <div className="grid h-[2.8em] w-[2.8em] place-items-center rounded-[.9em] bg-orange-50 text-orange-600"><I size={fs * 1.45} /></div>
        <div className="min-w-0">
          <div className="text-[1.22em] font-semibold tracking-tight">{d.title}</div>
          <div className="flex items-center gap-[.4em] text-[.92em] text-slate-500"><Logo p={d.provider} size={fs * 1.05} />{d.agent} · {BRAND[d.provider].name}</div>
        </div>
        <span className="ml-auto flex items-center gap-[.45em] rounded-full px-[.8em] py-[.3em] text-[.9em] font-semibold" style={writing ? { background: '#fff7ed', color: '#ea580c' } : lp >= 1 ? { background: '#ecfdf3', color: '#16a34a' } : { background: '#f1f5f9', color: '#94a3b8' }}>
          {writing ? <><span className="mini-dot" style={{ background: '#ea580c' }} />Writing</> : lp >= 1 ? <><Check size={fs} strokeWidth={3} />Draft</> : 'Queued'}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden px-[1.3em] py-[1.1em]">
        {!ran || lp === 0 ? <Skel n={6} /> : <div className={`whitespace-pre-wrap leading-[1.6] text-slate-700 ${writing ? 'caret' : ''}`}>{d.text.slice(0, n)}</div>}
      </div>
    </div>
  )
}
export function WriterNode({ data }: NodeProps<any>) {
  return <div className="card lyr h-full w-full overflow-hidden"><WriterBody k={data.k} /><Ports /></div>
}

/* ───────────── QA & risk ───────────── */
const CHECK_ICON = { facts: ShieldCheck, privacy: Lock, law: Scale }
export function CheckNode({ data }: NodeProps<any>) {
  const c = CHECKS[data.k]
  const p = useP('qa', 50)
  const ran = useRan('qa')
  const lp = stagger(p, data.k, 3, 0.1)
  const I = CHECK_ICON[c.key]
  return (
    <div className="card flex h-full w-full items-center gap-3 px-4">
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><I size={21} /></div>
      <div className="min-w-0 flex-1"><div className="text-[15px] font-semibold tracking-tight">{c.title}</div><div className="text-[11.5px] text-slate-500">{c.sub}</div></div>
      {!ran ? <div className="sk h-7 w-7 rounded-full!" /> : lp < 1 ? <Spin size={20} color="#059669" /> : <div className="pop grid h-7 w-7 place-items-center rounded-full bg-emerald-500 text-white"><Check size={16} strokeWidth={3.2} /></div>}
      <Ports />
    </div>
  )
}
export function ConfNode() {
  const p = useP('qa', 100)
  const v = Math.round(96 * Math.min(1, p * 1.2))
  return (
    <div className="card flex h-full w-full flex-col items-center justify-center p-4">
      <svg viewBox="0 0 120 70" className="w-[190px]">
        <path d="M10 62 A50 50 0 0 1 110 62" fill="none" stroke="#eef0f6" strokeWidth="10" strokeLinecap="round" />
        <path d="M10 62 A50 50 0 0 1 110 62" fill="none" stroke="#059669" strokeWidth="10" strokeLinecap="round" strokeDasharray={157} strokeDashoffset={157 * (1 - v / 100)} style={{ transition: 'stroke-dashoffset .3s linear' }} />
      </svg>
      <div className="tnum -mt-9 text-[38px] font-semibold tracking-tight">{v}<span className="text-[18px] text-slate-400">%</span></div>
      <div className="mt-1 text-[12.5px] text-slate-500">confidence</div>
      <div className="mt-3 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-500">Below 90% → human review</div>
      <Ports />
    </div>
  )
}

/* ───────────── human gate ───────────── */
export function ApprovalNode() {
  const active = usePhase() === 'approve'
  const p = useP('approve', 40)
  const ran = useRan('approve')
  const clicked = p >= 0.42
  const cur = !active ? { x: 300, y: 430, o: 0 } : p < 0.36 ? { x: 232, y: 96, o: 1 } : { x: 232, y: 96, o: p > 0.9 ? 0 : 1 }
  return (
    <div className="card relative h-full w-full p-5 transition-shadow duration-700" style={active ? { boxShadow: '0 0 0 6px #0f172a0d', borderColor: '#0f172a44' } : undefined}>
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-full bg-slate-900 text-white"><UserCheck size={21} /></div>
        <div><div className="text-[17px] font-semibold tracking-tight">Owner approval</div><div className="text-[11.5px] text-slate-500">Nothing ships without a human</div></div>
      </div>
      <div className={`mt-4 flex h-11 items-center justify-center rounded-xl text-[14px] font-semibold text-white transition-all duration-200 ${active && p >= 0.36 && p < 0.46 ? 'scale-95' : ''}`} style={{ background: clicked && ran ? '#16a34a' : '#4f46e5' }}>
        {clicked && ran ? <><Check size={16} strokeWidth={3} className="mr-1.5" />Approved</> : 'Approve all'}
      </div>
      <div className="mt-4 flex flex-col gap-2.5">
        {DOCS.map((d, k) => {
          const I = DOC_ICON[d.key]
          const ok = ran && p >= 0.5 + k * 0.1
          return (
            <div key={d.key} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
              <I size={17} className="text-slate-500" />
              <span className="text-[13.5px] font-medium">{d.title}</span>
              <span className="ml-auto flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold" style={ok ? { background: '#16a34a', color: '#fff' } : { background: '#eef0f6', color: '#64748b' }}>{ok ? <><Check size={11} strokeWidth={3.5} />Ready</> : 'Pending'}</span>
            </div>
          )
        })}
      </div>
      <div className="mt-4 flex items-center gap-2 text-[11.5px] text-slate-400"><Lock size={12} />Every approval is logged</div>
      <div className="pointer-events-none absolute left-0 top-0 z-10" style={{ transform: `translate(${cur.x}px, ${cur.y}px)`, opacity: cur.o, transition: 'transform 1.6s cubic-bezier(.3,.9,.3,1), opacity .4s' }}>
        <MousePointer2 size={26} fill="#0f172a" color="#fff" strokeWidth={1.5} />
      </div>
      <Ports />
    </div>
  )
}

/* ───────────── publish + tracking ───────────── */
export const Mask = ({ src, color, size = 20 }) => <span style={{ width: size, height: size, background: color, WebkitMask: `url("${src}") center/contain no-repeat`, mask: `url("${src}") center/contain no-repeat`, display: 'block' }} />
const CHANNELS = [
  { n: 'Website', el: <Globe size={20} color="#4f46e5" /> },
  { n: 'Facebook', el: <Mask src={facebook} color="#0866FF" /> },
  { n: 'Shopee', el: <Mask src={shopee} color="#EE4D2D" /> },
  { n: 'Zalo', el: <Mask src={zalo} color="#0068FF" /> },
  { n: 'Maps', el: <Mask src={gmaps} color="#34A853" /> },
]
export function PublishNode() {
  const active = usePhase() === 'publish'
  const p = useP('publish', 40)
  const ran = useRan('publish')
  return (
    <div className="card h-full w-full p-5 transition-shadow duration-700" style={active ? { boxShadow: '0 0 0 6px #0ea5e914', borderColor: '#0ea5e966' } : undefined}>
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-[14px] bg-sky-500 text-white"><Send size={20} /></div>
        <div><div className="text-[17px] font-semibold tracking-tight">Publish</div><div className="text-[11.5px] text-slate-500">Where AI reads about the shop</div></div>
      </div>
      <div className="mt-5 grid grid-cols-5 gap-2">
        {CHANNELS.map((c, k) => {
          const ok = ran && p >= (k + 1) / 6
          return (
            <div key={c.n} className="flex flex-col items-center gap-1.5">
              <div className="relative grid h-[52px] w-[52px] place-items-center rounded-2xl border border-slate-100 bg-slate-50 transition-all duration-500" style={ok ? { background: '#fff', borderColor: '#86efac' } : { filter: 'grayscale(1)', opacity: 0.55 }}>
                {c.el}
                {ok && <span className="pop absolute -right-1.5 -top-1.5 grid h-[18px] w-[18px] place-items-center rounded-full bg-emerald-500 text-white"><Check size={11} strokeWidth={4} /></span>}
              </div>
              <span className="text-[11px] font-medium text-slate-500">{c.n}</span>
            </div>
          )
        })}
      </div>
      <Ports />
    </div>
  )
}
export function TrackNode() {
  const active = usePhase() === 'track'
  const sc = useSim((s) => scoreAt(s.t))
  const idx = SCORES.indexOf(sc)
  const W = 340, H = 190, x = (k: number) => 14 + (k * (W - 28)) / 5, y = (v: number) => H - 26 - (v / 16) * (H - 44)
  const pts = SCORES.slice(0, idx + 1).map((v, k) => [x(k), y(v)])
  const d = pts.map((q, k) => `${k ? 'L' : 'M'}${q[0]} ${q[1]}`).join(' ')
  return (
    <div className="card h-full w-full p-5 transition-shadow duration-700" style={active ? { boxShadow: '0 0 0 6px #16a34a14', borderColor: '#16a34a66' } : undefined}>
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-[14px] bg-emerald-500 text-white"><TrendingUp size={21} /></div>
        <div><div className="text-[17px] font-semibold tracking-tight">AI Visibility</div><div className="text-[11.5px] text-slate-500">Measured every week</div></div>
        <div key={sc} className="pop tnum ml-auto text-[40px] font-semibold leading-none tracking-tight" style={{ color: sc >= 7 ? '#16a34a' : '#e11d48' }}>{sc}<span className="text-slate-300">/{TOTAL_Q}</span></div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full">
        {[0, 1, 2, 3].map((k) => <line key={k} x1="14" x2={W - 14} y1={y(k * 5)} y2={y(k * 5)} stroke="#f1f2f7" />)}
        {pts.length > 1 && <path d={`${d} L${pts[pts.length - 1][0]} ${H - 26} L${pts[0][0]} ${H - 26} Z`} fill="#16a34a14" />}
        <path d={d} fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {SCORES.map((v, k) => <circle key={k} cx={x(k)} cy={k <= idx ? y(v) : H - 26} r={k <= idx ? 5 : 3} fill="#fff" stroke={k <= idx ? '#16a34a' : '#dfe3ec'} strokeWidth={k <= idx ? 3 : 2} style={{ transition: 'cy .8s cubic-bezier(.2,1.2,.4,1)' }} />)}
        {SCORES.map((_, k) => <text key={k} x={x(k)} y={H - 6} textAnchor="middle" fontSize="10" fill={k === idx ? '#0f172a' : '#94a3b8'} fontWeight={k === idx ? 600 : 400}>W{k + 1}</text>)}
      </svg>
      <div className="mt-2 flex items-center gap-2 text-[11.5px] text-slate-400"><RefreshCw size={12} style={active ? { animation: 'spin 1.4s linear infinite' } : undefined} />Loops back to Research every week</div>
      <Ports />
    </div>
  )
}

const DotsNode = () => <div className="world-dots" />
export const nodeTypes = {
  dots: DotsNode,
  dept: DeptNode, store: StoreNode, planner: PlannerNode, session: SessionNode, retest: RetestNode, diag: DiagNode,
  rivals: RivalsNode, share: ShareNode, writer: WriterNode, check: CheckNode, conf: ConfNode, approval: ApprovalNode,
  publish: PublishNode, track: TrackNode,
}
export { prog }
