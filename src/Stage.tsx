import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Bot, Check, Sparkles, X } from 'lucide-react'
import { DEPT_ICON } from './nodes'
import { LIVE_ORDER, ORDER, usePhase, useSim, type Phase } from './sim'
import { useLive } from './live'
import { jump, snap, useOne } from './SystemOne'
import { OFFLINE_MSG, useEdge } from './edge'
import { useNeeds, useWork, useWorkPoll } from './Workspace'
import { shortEngine, useCompany, useCompanyPoll, type AgentInfo } from './company'

/* Stage overlays: the opening, the scoreboard, the approval stamp, the agent team, presenter notes and the Q&A sheet. */

const NAME: Record<Phase, string> = { intake: 'Shop', mining: 'Signals', research: 'Research', analysis: 'Analysis', content: 'Content', citations: 'Citations', sync: 'Channel Sync', qa: 'QA', risk: 'Risk Gate', approve: 'Approve', publish: 'Publish', track: 'Track', impact: 'Impact' }
const useOrder = () => (useLive((s) => s.mode) === 'script' ? ORDER : LIVE_ORDER)

/* ───────────── 1 · opening: the company wakes up ───────────── */
export function Wake() {
  const mode = useLive((s) => s.mode), brand = useLive((s) => s.brand)
  const [on, setOn] = useState(() => !/[?&](t|nowake|nocam)\b/.test(location.search))
  const first = useRef(true)
  useEffect(() => { if (first.current) { first.current = false; return } if (mode !== 'script') setOn(true) }, [mode])
  useEffect(() => { if (!on) return; const id = setTimeout(() => setOn(false), 2600); return () => clearTimeout(id) }, [on, mode])
  const steps = LIVE_ORDER.filter((k) => k !== 'intake')
  return (
    <AnimatePresence>
      {on && (
        <motion.div key="wake" onClick={() => setOn(false)} initial={{ opacity: 1 }} exit={{ opacity: 0, filter: 'blur(8px)' }} transition={{ duration: 0.7 }} className="absolute inset-0 z-50 grid place-items-center bg-white/92 backdrop-blur-md">
          <div className="flex flex-col items-center">
            <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 18 }} className="grid h-16 w-16 place-items-center rounded-[20px] bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-[0_24px_60px_-18px_rgba(79,70,229,.7)]"><Check size={34} strokeWidth={3.2} /></motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="mt-5 text-[30px] font-semibold tracking-tight">{mode === 'script' ? 'Picked' : `Picked × ${brand || '…'}`}</motion.div>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }} className="mt-1 text-[14px] text-slate-500">{mode === 'script' ? 'A company of AI agents is waking up' : mode === 'replay' ? 'Replaying a real run' : 'Starting a live run'}</motion.div>
            <div className="mt-7 flex items-center gap-2">
              {steps.map((k, i) => {
                const I = DEPT_ICON[k]
                return <motion.div key={k} initial={{ opacity: 0.15, y: 8, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.5 + i * 0.12, type: 'spring', stiffness: 300, damping: 20 }} className="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 text-white"><I size={18} /></motion.div>
              })}
            </div>
            <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.5, duration: 1.7, ease: 'easeInOut' }} className="mt-5 h-[3px] w-[560px] origin-left rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-emerald-500" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ───────────── 3 · scoreboard: 40 tiles and the rival race ───────────── */
export function ScoreBoard() {
  const phase = usePhase()
  const { mode, qs, summary, brand } = useLive()
  const show = mode !== 'script' && (phase === 'research' || phase === 'analysis') && qs.length > 0
  const rows = summary ? [...summary.competitors.filter((c) => c.name !== brand), { name: brand, count: summary.mentioned }].sort((a, b) => b.count - a.count).slice(0, 6) : []
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ type: 'spring', stiffness: 260, damping: 28 }} className="pointer-events-none absolute right-5 top-5 z-20 w-[300px] rounded-[20px] border border-slate-200 bg-white/95 p-4 shadow-[0_30px_70px_-30px_rgba(15,23,42,.45)] backdrop-blur">
          <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[.14em] text-slate-400"><span className="live-dot" />Gemini answers<span className="ml-auto rounded-full bg-emerald-50 px-2 py-px text-emerald-600">Real</span></div>
          <div className="mt-2 flex items-end gap-2"><span key={summary?.mentioned} className="pop tnum text-[34px] font-semibold leading-none tracking-tight text-slate-900">{summary?.mentioned ?? 0}</span><span className="pb-1 text-[12.5px] text-slate-500">of {summary?.answered ?? 0} answers name <b className="text-slate-800">{brand}</b></span></div>
          <div className="mt-3 grid grid-cols-10 gap-[5px]">
            {qs.map((q) => {
              const c = q.stage === 'done' ? (q.mentioned ? '#22c55e' : '#f43f5e') : q.stage === 'error' ? '#cbd5e1' : q.stage === 'run' ? '#a5b4fc' : '#eef0f5'
              return <motion.div key={q.qi} animate={{ backgroundColor: c, scale: q.stage === 'run' ? 0.82 : 1, rotateX: q.stage === 'done' ? 360 : 0 }} transition={{ duration: 0.5 }} className="grid aspect-square place-items-center rounded-[6px] text-[9px] font-bold text-white">{q.stage === 'done' && q.mentioned && q.rank ? q.rank : ''}</motion.div>
            })}
          </div>
          <div className="mt-4 space-y-1.5">
            {rows.map((r) => (
              <motion.div layout key={r.name} transition={{ type: 'spring', stiffness: 300, damping: 30 }} className="flex items-center gap-2 text-[12px]">
                <span className={`w-[78px] truncate ${r.name === brand ? 'font-semibold text-indigo-600' : 'text-slate-600'}`}>{r.name}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100"><motion.div animate={{ width: `${(r.count / max) * 100}%` }} transition={{ duration: 0.5 }} className="h-full rounded-full" style={{ background: r.name === brand ? '#4f46e5' : '#94a3b8' }} /></div>
                <span className="tnum w-6 text-right font-semibold text-slate-700">{r.count}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ───────────── 5 · approval stamp ───────────── */
export function Stamp() {
  const phase = usePhase()
  const st = useLive((s) => (s.mode === 'script' ? '' : s.approval?.status ?? ''))
  const scripted = useLive((s) => s.mode === 'script')
  const key = scripted ? (phase === 'publish' ? 'approved' : '') : st === 'approved' || st === 'rejected' ? st : ''
  const [show, setShow] = useState('')
  useEffect(() => { if (!key) return; setShow(key); const id = setTimeout(() => setShow(''), 2100); return () => clearTimeout(id) }, [key])
  const ok = show === 'approved'
  return (
    <AnimatePresence>
      {show && (
        <motion.div key={show} initial={{ opacity: 0, scale: 2.4, rotate: -22 }} animate={{ opacity: 1, scale: 1, rotate: -9 }} exit={{ opacity: 0, y: -30 }} transition={{ type: 'spring', stiffness: 420, damping: 22 }} className="pointer-events-none absolute left-1/2 top-[38%] z-30 -translate-x-1/2">
          <div className="rounded-2xl border-[5px] px-8 py-3 text-[46px] font-black uppercase tracking-[.12em]" style={{ color: ok ? '#16a34a' : '#e11d48', borderColor: ok ? '#16a34a' : '#e11d48', background: '#ffffffd9', boxShadow: `0 30px 80px -30px ${ok ? '#16a34a' : '#e11d48'}` }}>{ok ? 'Approved' : 'Rejected'}</div>
          <div className="mt-2 text-center text-[12px] font-semibold uppercase tracking-[.2em] text-slate-500">by the owner · a human</div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ───────────── agent team ───────────── */
const TEAM: { k: Phase; name: string; role: string }[] = [
  { k: 'mining', name: 'Mina', role: 'Question planner' }, { k: 'research', name: 'Scout ×5', role: 'Gemini tabs' }, { k: 'analysis', name: 'Ana', role: 'Analyst' },
  { k: 'sync', name: 'Sy', role: 'Site auditor' }, { k: 'content', name: 'Mira', role: 'Writer' }, { k: 'citations', name: 'Theo', role: 'Outreach' },
  { k: 'qa', name: 'Quinn', role: 'Fact checker' }, { k: 'risk', name: 'Rhea', role: 'Risk officer' }, { k: 'approve', name: 'Owner', role: 'Human' },
  { k: 'publish', name: 'Pax', role: 'Publisher' }, { k: 'track', name: 'Tara', role: 'Tracker' },
]
function work(k: Phase): string {
  const s = snap()
  if (s.mode === 'script') return ({ mining: 'Reads buyer questions', research: 'Asks AI like a buyer', analysis: 'Finds why AI skips the shop', sync: 'Aligns every channel', content: 'Writes the fixes', citations: 'Pitches trusted sources', qa: 'Re-tests each fix', risk: 'Stops false claims', approve: 'Approves on the phone', publish: 'Ships the fixes', track: 'Measures weekly' } as any)[k]
  switch (k) {
    case 'mining': return '40 buyer questions ready'
    case 'research': return s.answered != null ? `${s.answered}/40 answers · ${s.brand} named ${s.score}` : 'Opening Gemini tabs'
    case 'analysis': return s.missed != null ? `${s.missed} questions skip the brand` : 'Waiting for answers'
    case 'sync': return s.facts != null ? `${s.facts} sourced facts${s.siteScore != null ? ` · site ${s.siteScore}/100` : ''}` : 'Reading the website'
    case 'content': return s.faqs != null ? `${s.faqs} FAQs, about page, pitch` : 'Waiting for facts'
    case 'citations': return s.sources[0] ? `Pitch drafted for ${s.sources[0].domain}` : 'Ranking cited sources'
    case 'qa': return s.riskFlags != null ? 'Every sentence matched to a fact' : 'Waiting for drafts'
    case 'risk': return s.riskFlags != null ? `${s.riskFlags} flags · ${s.pii} personal data hits` : 'Waiting for QA'
    case 'approve': return s.approval ? `Decision: ${s.approval}` : 'Not asked yet'
    case 'publish': return s.published ? 'Shop page, llms.txt, sitemap live' : 'Waiting for approval'
    default: return s.status === 'done' ? 'Baseline saved · rerun in 7 days' : 'Waiting'
  }
}
const SAY: Partial<Record<Phase, (s: ReturnType<typeof snap>) => string>> = {
  research: () => 'Here are 40 buyer questions. Ask each one in a fresh tab.',
  analysis: (s) => (s.score ? `All answers are in. ${s.brand} is named in ${s.score}.` : 'All answers are in.'),
  sync: (s) => (s.missed != null ? `${s.missed} questions skip the brand. I need facts from the website.` : 'I need facts from the website.'),
  content: (s) => (s.facts != null ? `${s.facts} facts, each with its source page. Write only from these.` : 'Write only from sourced facts.'),
  citations: (s) => (s.sources[0] ? `Gemini cites ${s.sources[0].domain} most. Draft a pitch for them.` : 'Draft a pitch for the top source.'),
  qa: (s) => (s.faqs != null ? `${s.faqs} FAQs and an about page are ready for checking.` : 'Drafts are ready for checking.'),
  risk: () => 'Sentences are matched to facts. Scan for claims and personal data.',
  approve: (s) => (s.riskFlags != null ? `${s.riskFlags} flags, ${s.pii} personal data hits. The owner decides.` : 'The owner decides.'),
  publish: (s) => `Owner ${s.approval ?? 'approved'}. Ship what was approved.`,
  track: () => 'Published. Save the baseline and rerun the same questions in 7 days.',
}
const ENGINE_NOTE: Record<string, string> = { fast: 'seconds', write: 'drafting', deep: 'judging' }
function EngineChip({ e }: { e: AgentInfo['engine'] }) {
  if (e.council) return <span className="rounded-full bg-indigo-100 px-1.5 py-px text-[10px] font-semibold text-indigo-700">council ×{e.council.length}</span>
  if (e.browser) return <span className="rounded-full bg-sky-100 px-1.5 py-px text-[10px] font-semibold text-sky-700">browser</span>
  if (e.rules) return <span className="rounded-full bg-slate-100 px-1.5 py-px text-[10px] font-semibold text-slate-500">rules</span>
  return <span className="rounded-full bg-violet-100 px-1.5 py-px text-[10px] font-semibold text-violet-700">{shortEngine(e.primary)}</span>
}
function EngineWall() {
  const { engines, recent } = useCompany()
  const now = useSim((s) => s.now), hot = new Set(recent.filter((r) => now - (r.at + r.ms) < 12000 || now - r.at < r.ms + 12000).map((r) => r.engine))
  const max = Math.max(1, ...engines.map((e) => e.avgMs ?? 0))
  const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n))
  return (
    <div className="space-y-1 px-3 py-2">
      {engines.map((e) => (
        <div key={e.id} className={`rounded-xl px-2.5 py-1.5 transition-colors ${hot.has(e.id) ? 'bg-indigo-50' : ''}`}>
          <div className="flex items-center gap-1.5 text-[12px]">
            <span className={`h-1.5 w-1.5 flex-none rounded-full ${hot.has(e.id) ? 'bg-indigo-500' : e.calls ? 'bg-emerald-400' : 'bg-slate-200'}`} />
            <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">{e.label}</span>
            <span className={`rounded-full px-1.5 py-px text-[9.5px] font-bold uppercase tracking-[.08em] ${e.driver === 'codex' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{e.driver}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[10.5px] text-slate-400">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-400 transition-[width] duration-700" style={{ width: `${e.avgMs ? Math.max(6, (e.avgMs / max) * 100) : 0}%` }} /></div>
            <span className="tnum w-12 text-right">{e.avgMs ? `${(e.avgMs / 1000).toFixed(1)} s` : '–'}</span>
            <span className="tnum w-9 text-right">{e.calls}×</span>
            <span className="tnum w-10 text-right">{e.tokens ? `${fmt(e.tokens)} tk` : ''}</span>
          </div>
        </div>
      ))}
      {!engines.length && <div className="px-2 py-8 text-center text-[13px] text-slate-400">Backend is off.</div>}
      <div className="px-2 pt-2 text-[10.5px] leading-snug text-slate-400">Measured by the engine room on this machine: every call is logged with its time and tokens. Tiers: fast = {ENGINE_NOTE.fast}, write = {ENGINE_NOTE.write}, deep = {ENGINE_NOTE.deep}.</div>
    </div>
  )
}
export function Team() {
  const open = useOne((s) => s.team)
  const [tab, setTab] = useState<'agents' | 'engines'>('agents')
  const [openId, setOpenId] = useState('')
  const phase = usePhase()
  useLive((s) => `${s.status}|${s.summary?.answered}|${Object.keys(s.at).length}`) // re-read live facts when they change
  useCompanyPoll(open)
  const roster = useCompany((s) => s.agents)
  const order = useOrder(), cur = order.indexOf(phase), s = snap()
  const talk = order.slice(1, cur + 1).filter((k) => SAY[k]).slice(-3).map((k) => ({ k, from: TEAM.find((a) => a.k === order[order.indexOf(k) - 1])?.name ?? 'Shop', to: TEAM.find((a) => a.k === k)?.name ?? NAME[k], text: SAY[k]!(s) }))
  const rows = roster.length ? roster : TEAM.map((a) => ({ id: a.k, name: a.name, role: a.role, phase: a.k, engine: {} as AgentInfo['engine'], tools: [], soul: '', soulHash: '', drift: false, lastCalls: 0, lastMs: null, lastEngine: null }))
  return (
    <AnimatePresence>
      {open && (
        <motion.aside initial={{ x: -380, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -380, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 32 }} className="absolute bottom-4 left-4 top-4 z-30 flex w-[360px] flex-col overflow-hidden rounded-[22px] border border-slate-200 bg-white/95 shadow-[0_40px_100px_-30px_rgba(15,23,42,.45)] backdrop-blur-xl">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3"><Bot size={17} className="text-indigo-600" /><span className="text-[14.5px] font-semibold tracking-tight">Agent company</span><span className="ml-auto text-[11px] text-slate-400">{s.mode === 'script' ? 'Scripted' : s.mode === 'replay' ? 'Real · recorded' : 'Real · live'}</span><button onClick={() => useOne.setState({ team: false })} className="grid h-7 w-7 place-items-center rounded-full text-slate-400 hover:bg-slate-100"><X size={15} /></button></div>
          <div className="mx-3 mt-3 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 text-[12.5px] font-semibold">{(['agents', 'engines'] as const).map((k) => <button key={k} onClick={() => setTab(k)} className={`rounded-lg py-1.5 ${tab === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{k === 'agents' ? 'Agents' : 'AI engines'}</button>)}</div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
            {tab === 'engines' ? <EngineWall /> : rows.map((a) => {
              const i = order.indexOf(a.phase as Phase), st = i === cur ? 'working' : i < cur ? 'done' : 'standby', I = DEPT_ICON[a.phase as Phase], on = openId === a.id
              return (
                <div key={a.id}>
                  <button onClick={() => (a.soul ? setOpenId(on ? '' : a.id) : jump(a.phase as Phase))} className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-slate-50 ${st === 'working' ? 'bg-indigo-50/70' : ''}`}>
                    <div className={`grid h-8 w-8 flex-none place-items-center rounded-[10px] ${st === 'standby' ? 'bg-slate-100 text-slate-400' : 'bg-slate-900 text-white'}`}>{I && <I size={15} />}</div>
                    <div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><span className="text-[12.5px] font-semibold text-slate-800">{a.name}</span><span className="truncate text-[10.5px] text-slate-400">{a.role}</span><span className="ml-auto flex-none"><EngineChip e={a.engine} /></span></div><div className="truncate text-[11.5px] text-slate-500">{work(a.phase as Phase)}</div></div>
                    {st === 'working' ? <span className="live-dot" style={{ ['--c' as any]: '#4f46e5' }} /> : st === 'done' ? <Check size={13} strokeWidth={3} className="text-emerald-500" /> : <span className="h-1.5 w-1.5 rounded-full bg-slate-200" />}
                  </button>
                  {on && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mx-2 mb-1 overflow-hidden rounded-xl bg-slate-50 px-3 py-2 text-[11.5px] leading-snug text-slate-600">
                      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.1em] text-slate-400">Soul <span className="rounded bg-white px-1 font-mono normal-case tracking-normal">{a.soulHash}</span>{a.drift && <span className="rounded-full bg-amber-100 px-1.5 text-amber-700">changed</span>}</div>
                      {a.soul}
                      <div className="mt-1.5 flex flex-wrap gap-1">{a.tools.map((t) => <span key={t} className="rounded-full bg-white px-1.5 py-px font-mono text-[10px] text-slate-500">{t}</span>)}</div>
                      <div className="mt-1.5 text-[10.5px] text-slate-400">{a.engine.council ? `Council: ${a.engine.council.join(' + ')} · majority decides` : a.engine.primary ? `Engine: ${a.engine.primary}${a.engine.fallback?.length ? ` → ${a.engine.fallback.join(' → ')}` : ''}` : ''}{a.lastMs ? ` · last call ${(a.lastMs / 1000).toFixed(1)} s on ${a.lastEngine}` : ''}</div>
                    </motion.div>
                  )}
                </div>
              )
            })}
          </div>
          {tab === 'agents' && <div className="border-t border-slate-100 px-4 py-3">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-400">Handoffs</div>
            <div className="flex min-h-[96px] flex-col justify-end gap-1.5">
              <AnimatePresence initial={false} mode="popLayout">
                {talk.map((m) => <motion.div layout key={m.k} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-xl bg-slate-50 px-2.5 py-1.5 text-[11.5px] leading-snug text-slate-600"><b className="text-slate-800">{m.from}</b> → <b className="text-slate-800">{m.to}</b>: {m.text}</motion.div>)}
              </AnimatePresence>
            </div>
          </div>}
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

/* ───────────── presenter mode ───────────── */
const NOTES: Record<Phase, [number, string]> = {
  intake: [1, 'Mở: người mua giờ hỏi AI thay vì tìm Google. Shop nhỏ không biết AI có nhắc mình không.'],
  mining: [1, 'Agent chuẩn bị 40 câu hỏi mà người mua thật hay hỏi cho ngành hàng này.'],
  research: [1, 'Phần THẬT: nhiều tab Gemini ẩn danh, hỏi song song. 40 câu trong khoảng 3 phút. Chỉ bảng điểm góc phải.'],
  analysis: [1, 'Đọc số: thương hiệu được nhắc bao nhiêu trên 40, đối thủ nào dẫn, nguồn nào Gemini trích.'],
  sync: [2, 'Agent đọc website của shop, rút dữ kiện kèm trang nguồn. Mọi câu viết sau đều phải bám vào đây.'],
  content: [2, 'Viết FAQ, trang giới thiệu, thư gửi trang đánh giá: trả lời đúng các câu Gemini chưa nhắc shop.'],
  citations: [2, 'Nhắm đúng nguồn Gemini đang trích. Thư mới ở dạng nháp, chưa gửi (nói thật).'],
  qa: [2, 'Từng câu được đối chiếu với dữ kiện. Câu không có nguồn bị đánh dấu.'],
  risk: [2, 'Cổng rủi ro: chặn lời quảng cáo quá đà và dữ liệu cá nhân trước khi tới chủ shop.'],
  approve: [3, 'Con người quyết định: chủ shop quét QR, duyệt trên điện thoại. Mời giám khảo quét thử.'],
  publish: [3, 'Chỉ đăng phần được duyệt: trang shop, llms.txt, JSON-LD để AI đọc được.'],
  track: [3, 'Lưu mốc hôm nay, 7 ngày sau hỏi lại đúng 40 câu để đo thay đổi.'],
  impact: [3, 'Chốt: đo thật, sửa thật, người duyệt. Kêu gọi hành động.'],
}
export function Presenter() {
  const on = useOne((s) => s.presenter)
  const phase = usePhase(), order = useOrder()
  const now = useSim((s) => Math.floor(s.now / 1000))
  const [t0, setT0] = useState(0)
  useEffect(() => { if (on) setT0(Math.floor(Date.now() / 1000)) }, [on])
  if (!on) return null
  const sec = Math.max(0, now - t0), i = order.indexOf(phase), next = order[(i + 1) % order.length], [sp, note] = NOTES[phase]
  return (
    <div className="absolute left-5 top-5 z-30 w-[380px] rounded-[18px] border border-slate-800 bg-slate-900/95 p-4 text-white shadow-[0_30px_80px_-30px_rgba(15,23,42,.8)]">
      <div className="flex items-center gap-3">
        <button title="Reset the timer" onClick={() => setT0(Math.floor(Date.now() / 1000))} className="tnum text-[28px] font-semibold leading-none tracking-tight" style={{ color: sec > 300 ? '#fb7185' : sec > 240 ? '#fbbf24' : '#fff' }}>{String(Math.floor(sec / 60)).padStart(2, '0')}:{String(sec % 60).padStart(2, '0')}</button>
        <div className="text-[11px] leading-tight text-slate-400">Step {i + 1}/{order.length}<br /><b className="text-[13px] text-white">{NAME[phase]}</b></div>
        <span className="ml-auto rounded-full bg-indigo-500 px-2.5 py-1 text-[11.5px] font-semibold">Speaker {sp}</span>
      </div>
      <div className="mt-3 text-[13.5px] leading-snug text-slate-100">{note}</div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400"><span>Next: <b className="text-slate-200">{NAME[next]}</b> · Speaker {NOTES[next][0]}</span><span>← → step · P hide · / chat · T team · I Q&amp;A</span></div>
    </div>
  )
}

/* ───────────── Q&A sheet ───────────── */
const QA: [string, string[]][] = [
  ['Cost', ['Research uses the public Gemini web app in anonymous tabs: no API bill.', '40 buyer questions take about 3 minutes on 5 parallel tabs.', 'Writing and checking run on low-cost LLM tiers, cached by content hash.']],
  ['Data', ['Reads only public pages: the shop website and public AI answers.', 'Every fact keeps the page it came from; text without a source is flagged.', 'A personal-data scan runs before anything reaches the owner.']],
  ['Who is responsible', ['Nothing ships without the owner: each document is approved or rejected.', 'The risk gate checks every sentence against sourced facts first.', 'Published pages are marked as AI-assisted and list their sources.']],
  ['Why us', ['Global GEO tools are English dashboards for enterprise teams: they report.', 'Picked measures in Vietnamese and also does the fix, end to end.', 'Built for small shops with no marketing team: one tap to approve.']],
]
const TRUTH: [string, string][] = [['Real', 'Gemini answers, scoring, website audit, facts, drafts, risk gate, owner approval, published page'], ['Simulated', 'Zalo and Shopee signal mining, sending the outreach email, weekly tracking history']]
export function Info() {
  const on = useOne((s) => s.info)
  return (
    <AnimatePresence>
      {on && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => useOne.setState({ info: false })} className="absolute inset-0 z-40 grid place-items-center bg-slate-900/25 backdrop-blur-sm">
          <motion.div initial={{ y: 24, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 24 }} onClick={(e) => e.stopPropagation()} className="w-[860px] max-w-[92%] rounded-[26px] border border-slate-200 bg-white p-6 shadow-[0_50px_120px_-30px_rgba(15,23,42,.5)]">
            <div className="flex items-center gap-2"><Sparkles size={17} className="text-indigo-600" /><span className="text-[17px] font-semibold tracking-tight">How Picked works, honestly</span><button onClick={() => useOne.setState({ info: false })} className="ml-auto grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-slate-100"><X size={16} /></button></div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {QA.map(([h, l], i) => <motion.div key={h} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 * i }} className="rounded-2xl bg-slate-50 p-4"><div className="text-[13.5px] font-semibold text-slate-900">{h}</div><ul className="mt-1.5 space-y-1 text-[12.5px] leading-snug text-slate-600">{l.map((x) => <li key={x} className="flex gap-1.5"><Check size={13} strokeWidth={3} className="mt-[3px] flex-none text-emerald-500" />{x}</li>)}</ul></motion.div>)}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">{TRUTH.map(([k, v]) => <div key={k} className="rounded-2xl border border-slate-200 p-3 text-[12px] leading-snug text-slate-600"><span className={`mr-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.1em] ${k === 'Real' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{k}</span>{v}</div>)}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ───────────── dock ───────────── */
export function Dock() {
  const o = useOne()
  const w = useWork((s) => s.open), need = useNeeds()
  useWorkPoll()
  const B = ({ k, label, on, go, main }: { k: string; label: string; on: boolean; go: () => void; main?: boolean }) => (
    <button onClick={go} className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold shadow-[0_10px_26px_-14px_rgba(15,23,42,.5)] transition-colors ${main ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white' : on ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:text-slate-900'}`}>
      {main && <Bot size={15} />}{label}<kbd className={`rounded px-1 text-[10px] font-bold ${main || on ? 'bg-white/20' : 'bg-slate-100 text-slate-400'}`}>{k}</kbd>
    </button>
  )
  return (
    <div className="absolute bottom-5 right-5 z-30 flex items-center gap-1.5">
      <button onClick={() => useWork.setState({ open: !w })} className={`relative flex h-9 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold shadow-[0_10px_26px_-14px_rgba(15,23,42,.5)] transition-colors ${w ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:text-slate-900'}`}>Inbox<kbd className={`rounded px-1 text-[10px] font-bold ${w ? 'bg-white/20' : 'bg-slate-100 text-slate-400'}`}>W</kbd>{need > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">{need}</span>}</button>
      <B k="T" label="Team" on={o.team} go={() => useOne.setState({ team: !o.team })} />
      <B k="I" label="Q&A" on={o.info} go={() => useOne.setState({ info: !o.info })} />
      <B k="P" label="Presenter" on={o.presenter} go={() => useOne.setState({ presenter: !o.presenter })} />
      <B k="/" label="NaN" on={o.open} main go={() => useOne.setState({ open: !o.open })} />
    </div>
  )
}

/* ───────────── backend status: shown only while the team's machine is switched off ───────────── */
export function EdgeNotice() {
  const online = useEdge((s) => s.online)
  return (
    <AnimatePresence>
      {online === false && (
        <motion.div initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }} transition={{ type: 'spring', stiffness: 320, damping: 30 }} className="pointer-events-none absolute left-1/2 top-4 z-40 -translate-x-1/2">
          <div className="flex items-center gap-2 whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 py-1.5 pl-3 pr-4 text-[13px] font-medium text-amber-900 shadow-[0_14px_36px_-18px_rgba(180,83,9,.5)]"><span className="h-2 w-2 rounded-full bg-amber-500" />{OFFLINE_MSG}</div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
