import { useEffect, useMemo, useRef } from 'react'
import { BaseEdge, ReactFlow, ReactFlowProvider, getBezierPath, getSmoothStepPath, useReactFlow, useStoreApi, type Edge, type EdgeProps, type Node } from '@xyflow/react'
import { AnimatePresence, motion } from 'motion/react'
import { Bot, Check, Maximize, Pause, Play, Sparkles, X } from 'lucide-react'
import { BRAND, Logo } from './Chat'
import { DEPT_ICON, SessionFrame, WriterBody, nodeTypes } from './nodes'
import { flowTypes } from './flows'
const types = { ...nodeTypes, ...flowTypes }
import { CYCLE, DOCS, ORDER, PROVS, TOTAL_Q, URLS, clock, ct, feed, phaseOf, scoreAt, scoutName, usePhase, useSim, weekLabel, type Phase } from './sim'
import { ALL, C, LOCAL, OWNER, R, SHOT, VIEW } from './layout'
import Swarm from './Swarm'
import { dropTrack, setTrack } from './fx'


const N = (id: string, type: string, [x, y, w, h]: number[], data: any = {}, parentId?: string): Node => ({ id, type, position: { x, y }, width: w, height: h, data, parentId, draggable: false, selectable: false })
const nodes: Node[] = [
  { id: 'dots', type: 'dots', position: { x: -3000, y: -2600 }, width: 8600, height: 7200, data: {}, zIndex: -1, draggable: false, selectable: false, style: { pointerEvents: 'none' } },
  N('store', 'store', R.store),
  N('research', 'dept', R.research, { phase: 'research', title: 'Research', sub: 'Opens real AI chats and asks like buyers', color: C.research, agents: 22 }),
  N('planner', 'planner', LOCAL.planner, {}, 'research'),
  ...Array.from({ length: 12 }, (_, i) => N(`s-${i}`, 'session', LOCAL.sess(i), { i }, 'research')),
  N('analysis', 'dept', R.analysis, { phase: 'analysis', title: 'Analysis', sub: 'Finds why AI skips the shop', color: C.analysis, agents: 9 }),
  ...[0, 1, 2, 3].map((k) => N(`d-${k}`, 'diag', LOCAL.diag(k), { k }, 'analysis')),
  N('rivals', 'rivals', LOCAL.rivals, {}, 'analysis'),
  N('share', 'share', LOCAL.share, {}, 'analysis'),
  N('content', 'dept', R.content, { phase: 'content', title: 'Content', sub: 'Writes the fixes', color: C.content, agents: 10 }),
  ...[0, 1, 2, 3].map((k) => N(`w-${k}`, 'writer', LOCAL.writer(k), { k }, 'content')),
  N('qa', 'dept', R.qa, { phase: 'qa', title: 'QA & Risk', sub: 'Re-tests every fix first', color: C.qa, agents: 12 }),
  ...[0, 1, 2].map((k) => N(`c-${k}`, 'check', LOCAL.check(k), { k }, 'qa')),
  N('conf', 'conf', LOCAL.conf, {}, 'qa'),
  N('r-100', 'retest', LOCAL.retest(0), { i: 100 }, 'qa'),
  N('r-101', 'retest', LOCAL.retest(1), { i: 101 }, 'qa'),
  N('approval', 'approval', R.approval),
  N('mining', 'dept', R.mining, { phase: 'mining', title: 'Signals', sub: 'Learns what real buyers ask', color: C.mining, agents: 6 }),
  N('ms-0', 'minesrc', LOCAL.mineSrc(0), { src: 'zalo' }, 'mining'), N('ms-1', 'minesrc', LOCAL.mineSrc(1), { src: 'shopee' }, 'mining'),
  N('mtop', 'minetop', LOCAL.mineTop, {}, 'mining'),
  N('citations', 'dept', R.citations, { phase: 'citations', title: 'Citations', sub: 'Pitches the sources AI trusts', color: C.citations, agents: 7 }),
  N('csrc', 'citesrc', LOCAL.citeSrc, {}, 'citations'),
  ...[0, 1, 2].map((k) => N(`cm-${k}`, 'citemail', LOCAL.citeMail(k), { k }, 'citations')),
  N('cver', 'citever', LOCAL.citeVer, {}, 'citations'),
  N('sync', 'dept', R.sync, { phase: 'sync', title: 'Channel Sync', sub: 'One truth on every channel', color: C.sync, agents: 5 }),
  ...[0, 1, 2, 3].map((k) => N(`sch-${k}`, 'syncchan', LOCAL.syncChan(k), { k }, 'sync')),
  N('struth', 'synctruth', LOCAL.syncTruth, {}, 'sync'),
  N('risk', 'dept', R.risk, { phase: 'risk', title: 'Risk Gate', sub: 'Stops false claims and leaks', color: C.risk, agents: 4 }),
  N('rk-c', 'riskclaims', LOCAL.riskClaims, {}, 'risk'), N('rk-p', 'riskpii', LOCAL.riskPii, {}, 'risk'), N('rk-r', 'riskroute', LOCAL.riskRoute, {}, 'risk'),
  N('zalo', 'zalo', R.zalo),
  N('impact', 'impact', R.impact),
  N('publish', 'publish', R.publish),
  N('track', 'track', R.track),
]

const E = (id: string, source: string, target: string, data: any = {}, sh = 'r', th = 'l'): Edge => ({ id, source, target, sourceHandle: sh, targetHandle: th, type: 'flow', data })
const T = (on: Phase, color: string) => ({ thin: true, color, on: [on] })
const edges: Edge[] = [
  E('em', 'mining', 'store', { on: ['mining'], color: C.mining }),
  E('e1', 'store', 'research', { on: ['intake', 'research'], color: C.research }),
  E('e2', 'research', 'analysis', { on: ['analysis'], color: C.analysis }),
  E('e3', 'analysis', 'content', { on: ['content'], color: C.content, kind: 'step' }, 'b', 't'),
  E('ec', 'content', 'citations', { on: ['citations'], color: C.citations }, 'b', 't'),
  E('ecs', 'citations', 'sync', { on: ['sync'], color: C.sync }),
  E('esq', 'sync', 'qa', { on: ['qa'], color: C.qa }, 'ts', 'bt'),
  E('e4', 'content', 'qa', { on: ['qa'], color: C.qa }),
  E('eqr', 'qa', 'risk', { on: ['risk'], color: C.risk }),
  E('era', 'risk', 'approval', { on: ['approve'], color: '#0f172a' }),
  E('eaz', 'approval', 'zalo', { on: ['approve'], color: '#0068FF' }),
  E('ezp', 'zalo', 'publish', { on: ['publish'], color: '#0ea5e9' }),
  E('e7', 'publish', 'track', { on: ['track'], color: '#16a34a' }, 'b', 't'),
  E('eti', 'track', 'impact', { on: ['impact'], color: '#4f46e5' }),
  E('loop', 'impact', 'store', { on: ['impact', 'intake'], color: '#4f46e5', kind: 'loop' }, 'b', 'l'),
  E('mm0', 'ms-0', 'mtop', T('mining', C.mining)), E('mm1', 'ms-1', 'mtop', T('mining', C.mining)),
  ...[0, 1, 2].map((k) => E(`cs${k}`, 'csrc', `cm-${k}`, T('citations', C.citations))),
  E('cv', 'cm-1', 'cver', T('citations', C.citations)),
  E('sy0', 'sch-0', 'sch-1', T('sync', C.sync)), E('sy1', 'sch-2', 'sch-3', T('sync', C.sync)),
  E('sy2', 'sch-1', 'struth', T('sync', C.sync)), E('sy3', 'sch-3', 'struth', T('sync', C.sync)),
  E('rk1', 'rk-c', 'rk-p', T('risk', C.risk), 'b', 't'), E('rk2', 'rk-p', 'rk-r', T('risk', C.risk), 'b', 't'),
  E('qr1', 'r-100', 'rk-c', T('risk', C.risk)), E('qr2', 'r-101', 'rk-c', T('risk', C.risk)),
  ...Array.from({ length: 12 }, (_, i) => E(`p-${i}`, i % 4 ? `s-${i - 1}` : 'planner', `s-${i}`, { thin: true, color: C.research, on: ['research'] })),
  ...[0, 1, 2].map((k) => E(`dd-${k}`, `d-${k}`, `d-${k + 1}`, { thin: true, color: C.analysis, on: ['analysis'] }, 'b', 't')),
  ...[0, 1].map((k) => E(`cc-${k}`, `c-${k}`, `c-${k + 1}`, { thin: true, color: C.qa, on: ['qa'] }, 'b', 't')),
  ...[[3, 0], [7, 1], [11, 3]].map(([a, b]) => E(`sa-${a}`, `s-${a}`, `d-${b}`, { thin: true, color: C.analysis, on: ['analysis'] })),
  E('dr', 'd-0', 'rivals', { thin: true, color: C.analysis, on: ['analysis'] }), E('ds', 'd-2', 'share', { thin: true, color: C.analysis, on: ['analysis'] }),
  E('wq1', 'w-1', 'c-0', { thin: true, color: C.qa, on: ['qa'] }), E('wq3', 'w-3', 'conf', { thin: true, color: C.qa, on: ['qa'] }),
]

/* ───────────── animated edge: idle line + flowing particles when its phase is live ───────────── */
function FlowEdge({ id, sourceX: sx, sourceY: sy, targetX: tx, targetY: ty, sourcePosition, targetPosition, data }: EdgeProps<any>) {
  const active = useSim((s) => data.on.includes(phaseOf(s.t)))
  let path: string
  if (data.kind === 'loop') {
    const yb = 2900, xl = tx - 60, r = 26
    path = `M${sx} ${sy} L${sx} ${yb - r} Q${sx} ${yb} ${sx - r} ${yb} L${xl + r} ${yb} Q${xl} ${yb} ${xl} ${yb - r} L${xl} ${ty + r} Q${xl} ${ty} ${xl + r} ${ty} L${tx} ${ty}`
  } else if (data.kind === 'step') {
    ;[path] = getSmoothStepPath({ sourceX: sx, sourceY: sy, targetX: tx, targetY: ty, sourcePosition, targetPosition, borderRadius: 28 })
  } else {
    ;[path] = getBezierPath({ sourceX: sx, sourceY: sy, targetX: tx, targetY: ty, sourcePosition, targetPosition })
  }
  const w = data.thin ? 1.2 : 2.2
  // particles for this edge are painted by the canvas overlay
  useEffect(() => { setTrack(id, path, { color: data.color, on: data.on, thin: data.thin }); return () => { dropTrack(id) } }, [id, path, data])
  return (
    <>
      <BaseEdge id={id} path={path} style={{ stroke: '#dfe2ea', strokeWidth: w, strokeLinecap: 'round' }} />
      <path d={path} fill="none" stroke={data.color} strokeWidth={w + 0.6} strokeLinecap="round" style={{ opacity: active ? (data.thin ? 0.4 : 0.6) : 0, transition: 'opacity .8s' }} />
    </>
  )
}
const edgeTypes = { flow: FlowEdge }
const DBG = new URLSearchParams(location.search)
if (DBG.has('t')) clock.t = Number(DBG.get('t')) || 0 // ?t=88 starts the demo at a given second
for (const k of DBG.keys()) document.body.classList.add(k)

/* ───────────── camera director ─────────────
   Each step has one still, pixel-snapped framing; between steps the camera glides on a critically damped
   spring (position + log-zoom), so there is no bounce and no zoom-out-zoom-in. While it glides the canvas
   is moved as a cached GPU layer (will-change) and re-rastered a few times, not every frame. It yields to
   the user and picks up from wherever they left the view. */
/** re-raster the cached canvas layers at the current zoom (they are otherwise only moved, never repainted) */
let sharpFrames = 0
function sharpen() {
  if (sharpFrames > 0) { sharpFrames = 2; return }
  sharpFrames = 2
  document.body.classList.add('sharp')
  const tick = () => { if (--sharpFrames > 0) requestAnimationFrame(tick); else document.body.classList.remove('sharp') }
  requestAnimationFrame(tick)
}
function Director() {
  const rf = useReactFlow()
  const store = useStoreApi()
  useEffect(() => {
    const cam = { on: false, still: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }
    const W0 = 2.4
    let raf = 0, last = performance.now(), nextSharp = 0
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.1, (now - last) / 1000); last = now
      const ui = useSim.getState()
      const { width: W, height: H, transform } = store.getState()
      if (!ui.auto || ui.sel || now < ui.hold || !W || !H) { cam.on = false; return }
      if (!cam.on) { const [x, y, z] = transform; Object.assign(cam, { on: true, still: false, x: (W / 2 - x) / z, y: (H / 2 - y) / z, z: Math.log(z), vx: 0, vy: 0, vz: 0 }) }
      const [tx, ty, th] = SHOT[phaseOf(clock.t)]
      const tz = Math.log(Math.min(H / th, W / (th * 1.42)))
      const far = Math.abs(tx - cam.x) > 0.5 || Math.abs(ty - cam.y) > 0.5 || Math.abs(tz - cam.z) > 0.0015 || Math.abs(cam.vx) + Math.abs(cam.vy) > 2 || Math.abs(cam.vz) > 0.004
      if (!far) {
        if (cam.still) return
        Object.assign(cam, { still: true, x: tx, y: ty, z: tz, vx: 0, vy: 0, vz: 0 })
        const z = Math.exp(tz)
        rf.setViewport({ x: Math.round(W / 2 - tx * z), y: Math.round(H / 2 - ty * z), zoom: z })
        sharpen()
        return
      }
      if (cam.still) { cam.still = false; nextSharp = now + 420 }
      if (now > nextSharp && Math.abs(cam.vz) > 0.02) { sharpen(); nextSharp = now + 420 } // stay crisp while the zoom is changing
      cam.vx += (W0 * W0 * (tx - cam.x) - 2 * W0 * cam.vx) * dt; cam.x += cam.vx * dt
      cam.vy += (W0 * W0 * (ty - cam.y) - 2 * W0 * cam.vy) * dt; cam.y += cam.vy * dt
      cam.vz += (W0 * W0 * (tz - cam.z) - 2 * W0 * cam.vz) * dt; cam.z += cam.vz * dt
      const z = Math.exp(cam.z)
      rf.setViewport({ x: W / 2 - cam.x * z, y: H / 2 - cam.y * z, zoom: z })
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [rf, store])
  return null
}

/* ───────────── top bar ───────────── */
const LABEL: Record<Phase, string> = {
  intake: 'Shop', mining: 'Signals', research: 'Research', analysis: 'Analysis', content: 'Content', citations: 'Citations', sync: 'Channel Sync',
  qa: 'QA', risk: 'Risk Gate', approve: 'Approve', publish: 'Publish', track: 'Track', impact: 'Impact',
}
const STEPS = ORDER.filter((k) => k !== 'intake').map((k) => ({ k, label: LABEL[k], view: VIEW[k] }))
const AGENTS = nodes.reduce((n, x) => n + (x.type === 'dept' ? x.data.agents as number : 0), 0)
const holdCam = (ms = 14000) => useSim.setState({ hold: performance.now() + ms })
function Tasks() {
  const n = useSim((s) => Math.floor(s.t * 6.8))
  return <span><b className="tnum font-semibold text-slate-800">{n.toLocaleString()}</b> tasks</span>
}
function CycleBeam() {
  const p = useSim((s) => Math.round((ct(s.t) / CYCLE) * 100))
  return <div className="absolute bottom-[-1px] left-0 h-[2px] w-full origin-left bg-gradient-to-r from-indigo-500 via-violet-500 to-emerald-500" style={{ transform: `scaleX(${p / 100})`, transition: 'transform 1s linear' }} />
}
function TopBar() {
  const rf = useReactFlow()
  const phase = usePhase()
  const sc = useSim((s) => scoreAt(s.t))
  const wk = useSim((s) => weekLabel(s.t))
  const auto = useSim((s) => s.auto)
  return (
    <header className="relative z-20 grid h-14 flex-none grid-cols-[1fr_auto_1fr] items-center gap-4 whitespace-nowrap border-b border-slate-200/70 bg-white px-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-indigo-500 to-violet-600 text-white"><Check size={17} strokeWidth={3.2} /></div>
        <span className="text-[16px] font-semibold tracking-tight">Picked</span>
        <span className="h-4 w-px bg-slate-200" />
        <span className="truncate text-[13px] font-medium text-slate-500">xT Store</span>
      </div>

      <nav className="flex items-center gap-0.5 rounded-full bg-slate-100/80 p-1">
        {STEPS.map((s) => {
          const I = DEPT_ICON[s.k]
          const on = phase === s.k
          return (
            <button key={s.k} title={s.label} onClick={() => { holdCam(); rf.fitBounds(s.view, { duration: 900, padding: 0.04 }).then(sharpen) }} className="relative flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium text-slate-400 transition-colors hover:text-slate-700">
              {on && <motion.span layoutId="step" className="absolute inset-0 rounded-full bg-white shadow-[0_1px_3px_rgba(15,23,42,.12)]" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
              <I size={15} className="relative" color={on ? '#0f172a' : undefined} />
              {on && <span className="relative text-slate-900">{s.label}</span>}
            </button>
          )
        })}
      </nav>

      <div className="flex min-w-0 items-center justify-end gap-3">
        <div className="hidden items-center gap-2 text-[12.5px] text-slate-500 xl:flex">
          <div className="flex -space-x-1">{PROVS.map((p) => <span key={p} className="grid h-5 w-5 place-items-center rounded-full bg-white ring-1 ring-slate-200"><Logo p={p} size={11} /></span>)}</div>
          <span><b className="tnum font-semibold text-slate-800">{AGENTS}</b> agents</span>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-slate-100/80 py-1 pl-3 pr-1">
          <span className="text-[11px] font-medium text-slate-500">Visibility · W{wk}</span>
          <span key={sc} className="pop tnum rounded-full bg-white px-2.5 py-0.5 text-[15px] font-semibold shadow-[0_1px_3px_rgba(15,23,42,.12)]" style={{ color: sc >= 7 ? '#16a34a' : '#e11d48' }}>{sc}<span className="text-slate-300">/{TOTAL_Q}</span></span>
        </div>
        <button title={auto ? 'Auto camera on' : 'Auto camera off'} onClick={() => useSim.setState({ auto: !auto, hold: 0 })} className="grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100">{auto ? <Pause size={15} /> : <Play size={15} />}</button>
        <button title="Whole company" onClick={() => { holdCam(); rf.fitBounds(ALL, { duration: 900, padding: 0.04 }).then(sharpen) }} className="-ml-2 grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100"><Maximize size={15} /></button>
      </div>
      <CycleBeam />
    </header>
  )
}

/* ───────────── story caption: one line per step ───────────── */
const CAP: Record<Phase, string> = {
  intake: 'A shop joins. No website needed.',
  mining: 'Agents learn what real buyers ask, from Zalo and Shopee.',
  research: 'They ask 4 AIs the same questions.',
  analysis: 'They find why AI skips the shop.',
  content: 'They write the fixes.',
  citations: 'They pitch the sources AI trusts.',
  sync: 'They make every channel say the same thing.',
  qa: 'Every fix is re-tested in real AI chats.',
  risk: 'False claims and personal data are stopped.',
  approve: 'The owner approves in one tap, on Zalo.',
  publish: 'Fixes go live where AI reads.',
  track: 'AI Visibility climbs, week after week.',
  impact: 'Six weeks: from 2 to 14 out of 40.',
}
function Caption() {
  const phase = usePhase()
  return (
    <div className="pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2">
      <AnimatePresence mode="wait">
        <motion.div key={phase} initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -10, filter: 'blur(6px)' }} transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }} className="flex items-center gap-3 rounded-full border border-slate-200/80 bg-white py-2 pl-2 pr-5 shadow-[0_18px_44px_-20px_rgba(15,23,42,.45)]">
          <span className="tnum grid h-7 w-7 place-items-center rounded-full bg-slate-900 text-[12.5px] font-semibold text-white">{ORDER.indexOf(phase) + 1}</span>
          <span className="whitespace-nowrap text-[15px] font-medium tracking-tight text-slate-800">{CAP[phase]}</span>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/* ───────────── live feed + inspector ───────────── */
function Feed() {
  const k = useSim((s) => Math.floor(s.t / 1.6))
  const items = useMemo(() => feed(useSim.getState().t), [k])
  return (
    <div className="pointer-events-none absolute bottom-5 left-5 z-10 flex w-[330px] flex-col-reverse gap-1.5">
      <AnimatePresence initial={false} mode="popLayout">
        {items.map((e, i) => (
          <motion.div key={e.id} layout initial={{ opacity: 0, y: 14, scale: 0.96 }} animate={{ opacity: 1 - i * 0.24, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }} className="flex items-center gap-2 rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-[12px] text-slate-600 shadow-[0_8px_20px_-14px_rgba(15,23,42,.35)]">
            <Logo p={e.provider} size={14} /><span className="truncate">{e.text}</span>
          </motion.div>
        ))}
      </AnimatePresence>
      <div className="mb-1 flex items-center gap-2 pl-1 text-[10.5px] font-semibold uppercase tracking-[.14em] text-slate-400"><span className="live-dot" />Live activity</div>
    </div>
  )
}
function Inspector() {
  const sel = useSim((s) => s.sel)
  const [kind, raw] = sel ? sel.split('-') : []
  const i = Number(raw)
  const prov = kind === 'w' ? DOCS[i]?.provider : PROVS[i % 4]
  return (
    <AnimatePresence>
      {sel && (
        <motion.aside key="insp" initial={{ x: 520, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 520, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 32 }} className="absolute bottom-4 right-4 top-4 z-30 flex w-[480px] flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white/95 shadow-[0_40px_100px_-30px_rgba(15,23,42,.45)] backdrop-blur-xl">
          <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-indigo-50 text-indigo-600"><Bot size={20} /></div>
            <div>
              <div className="text-[16px] font-semibold tracking-tight">{kind === 'w' ? DOCS[i].agent : kind === 'r' ? `Retest-${i - 99}` : scoutName(i)}</div>
              <div className="flex items-center gap-1.5 text-[12px] text-slate-500"><Logo p={prov} size={13} />{kind === 'w' ? `Writing in ${BRAND[prov].name}` : `Live session on ${URLS[prov]}`}</div>
            </div>
            <button onClick={() => useSim.setState({ sel: null })} className="ml-auto grid h-9 w-9 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18} /></button>
          </div>
          <div className="min-h-0 flex-1 p-4">
            {kind === 'w'
              ? <div className="card h-full overflow-hidden"><WriterBody k={i} fs={15} /></div>
              : <SessionFrame i={i} force={kind === 'r'} fs={14.5} name={kind === 'r' ? `Retest-${i - 99}` : undefined} />}
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-[11px] text-slate-400"><span className="flex items-center gap-2"><span className="live-dot" />Streaming live</span><span className="uppercase tracking-[.14em]">Illustrative</span></div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

/* ───────────── app ───────────── */
function Stage() {
  const rf = useReactFlow()
  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="relative min-h-0 flex-1">
        <div className="ambient"><i style={{ ['--c' as any]: '#6366f11c', left: '-12vw', top: '-22vw' }} /><i style={{ ['--c' as any]: '#0ea5e916', right: '-10vw', bottom: '-30vw', animationDelay: '-9s' }} /><i style={{ ['--c' as any]: '#f9731612', left: '28vw', bottom: '-38vw', animationDelay: '-16s' }} /></div>
        <ReactFlow
          nodes={nodes} edges={edges} nodeTypes={types} edgeTypes={edgeTypes}
          onlyRenderVisibleElements
          minZoom={0.15} maxZoom={2.2} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}
          onInit={(i) => { i.fitBounds(ALL, { padding: 0.04 }).then(sharpen) }}
          onMoveStart={(ev) => { if (ev) holdCam() }}
          onMoveEnd={(ev) => { if (ev) sharpen() }}
          onPaneClick={() => useSim.setState({ sel: null })}
          onNodeClick={(_, n) => {
            if (/^(s|r|w)-/.test(n.id)) return useSim.setState({ sel: n.id })
            holdCam()
            const abs = rf.getInternalNode(n.id)!.internals.positionAbsolute
            rf.fitBounds({ x: abs.x - 30, y: abs.y - 30, width: (n.width ?? 300) + 60, height: (n.height ?? 300) + 60 }, { duration: 900, padding: 0.06 }).then(sharpen)
          }}
          proOptions={{ hideAttribution: true }}
        >
          {!DBG.has('nocam') && <Director />}
        </ReactFlow>
        {!DBG.has('noswarm') && <Swarm />}
        <Feed />
        <Caption />
        <Inspector />
        <div className="pointer-events-none absolute bottom-5 right-5 z-10 text-[10.5px] font-semibold uppercase tracking-[.16em] text-slate-400">Illustrative · AI for Business Innovation 2026</div>
      </div>
    </div>
  )
}

export default function App() {
  useEffect(() => {
    let raf = 0, last = performance.now(), acc = 0
    const loop = (now: number) => {
      const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now
      if (DBG.has('nosim') && clock.t > 8) { raf = requestAnimationFrame(loop); return }
      clock.t += dt; acc += dt
      if (acc >= 0.08) { useSim.setState({ t: clock.t }); acc = 0 }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return <ReactFlowProvider><Stage /></ReactFlowProvider>
}
