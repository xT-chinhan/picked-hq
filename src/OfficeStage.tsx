import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowRight, Check, CheckCheck, FileText, GitBranch, Globe, LayoutGrid, Pause, Play, RotateCcw, ScanSearch, ShieldCheck, Terminal, BookOpen } from 'lucide-react'
import { Avatar, PEOPLE, COUNCIL, type Person } from './avatars'
import { openAnalyze } from './Analyze'
import { useStory } from './Story'
import { useApps } from './Apps'
import './office-stage.css'

/* The office home: the whole company on one screen, no scrolling. Agents are scattered like people working a floor, not a parade in a row;
   the demo on the right is a simulation (labelled), the real actions live in the Run menu. Every text is 13 px or larger. */
const TEAM: Person[] = [...PEOPLE, ...COUNCIL]
const SLOT = ['lia', 'nan', 'mina', 'scout1', 'scout2', 'ana', 'scout3', 'scout4', 'scout5', 'sy', 'mira', 'theo', 'quinn', 'g4', 'astra', 'opus', 'rhea', 'owner', 'pax', 'tara']
const COLS = 4, ROWS = 5
const nameOf = (p: Person) => (p.id.startsWith('scout') ? `Scout ${p.id.slice(5)}` : p.name.replace(/^Claude /, ''))

/** A hand-feel floor plan: a honeycomb of desks, each pushed off its grid point so no two neighbours line up. */
function place(i: number) {
  const row = Math.floor(i / COLS), col = i % COLS
  const jx = Math.sin(i * 12.9898) * 0.13, jy = Math.cos(i * 7.233) * 0.11
  const x = (col + 0.5 + (row % 2 ? 0.28 : -0.2) + jx) / COLS
  const y = (row + 0.5 + Math.sin(col * 1.7 + row * 0.9) * 0.14 + jy) / ROWS
  return { x: Math.min(0.92, Math.max(0.09, x)), y: Math.min(0.9, Math.max(0.12, y)) }
}
const SPOT = new Map(SLOT.map((id, i) => [id, place(i)]))

function useBox() {
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return
    const o = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }))
    o.observe(el); return () => o.disconnect()
  }, [])
  return { ref, ...box }
}

const SCENES = [
  { agent: 'nan', to: 'mina', name: 'A little direction. A whole team.', task: 'Understand the assignment', icon: GitBranch, words: 'Help more people discover our brand when they ask AI what to buy.', reply: 'Mina, let’s find out what our customers are asking.', answer: 'On it. Starting with real buying questions.', output: ['Brand context received', 'Research team assigned', 'Owner approval required'], label: 'Request received' },
  { agent: 'mina', to: 'scout1', name: 'Good answers start with good questions.', task: 'Listen to the market', icon: Globe, words: 'Which lunch box keeps food warm, fits in a work bag, and is easy to clean?', reply: 'Scout, take these questions to the assistants.', answer: 'Opening the research tabs. I’ll bring back sources.', output: ['Buying intent mapped', 'Questions grouped by need', 'Research queue prepared'], label: 'Research brief' },
  { agent: 'scout1', to: 'ana', name: 'Follow the answer. Find the gap.', task: 'Read what AI recommends', icon: ScanSearch, words: 'Comparing recommendations, brand mentions and the sources behind every answer…', reply: 'Ana, here are the answers and their sources.', answer: 'I see the gaps. Let’s check the website next.', output: ['Answers collected', 'Citations linked to sources', 'Missing mentions highlighted'], label: 'Answer stream' },
  { agent: 'ana', to: 'mira', name: 'Turn evidence into something useful.', task: 'Create grounded content', icon: FileText, words: 'A useful answer needs clear product details, an identifiable source, and a reason to trust it.', reply: 'Mira, write from these verified facts.', answer: 'Every paragraph gets a source. No invented claims.', output: ['Website evidence organized', 'FAQ draft assembled', 'Source references attached'], label: 'Content draft' },
  { agent: 'quinn', to: 'rhea', name: 'A second look. Then another.', task: 'Check before it leaves', icon: ShieldCheck, words: 'Checking each claim against its source. The council reviews the evidence before anything moves on.', reply: 'Rhea, the evidence is ready for your review.', answer: 'Checking personal data and unsupported promises.', output: ['Claims checked against evidence', 'Risk review completed', 'Draft prepared for owner review'], label: 'Review in progress' },
  { agent: 'pax', to: 'tara', name: 'Your call. Always.', task: 'Put the owner in control', icon: CheckCheck, words: 'The draft is ready for your review. You choose what gets published. The team takes it from there.', reply: 'Waiting for the owner. Nothing ships yet.', answer: 'And I’ll measure again after approved changes.', output: ['Draft ready to review', 'Publication awaits approval', 'Follow-up measurement planned'], label: 'Ready for your review' },
]
const STEPS = ['Brief', 'Research', 'Analyze', 'Create', 'Review', 'Approve']
const get = (id: string) => TEAM.find((p) => p.id === id)!

function Desk({ p, x, y, size, active, speaking, text, onSelect, reduced, below }: { p: Person; x: number; y: number; size: number; active: boolean; speaking: boolean; text: string; onSelect: () => void; reduced: boolean; below: boolean }) {
  return (
    <button className={`os-agent ${active ? 'is-active' : ''}`} onClick={onSelect} style={{ left: `${x * 100}%`, top: `${y * 100}%`, '--agent': p.color } as CSSProperties} aria-label={`Meet ${p.name}, ${p.role}`}>
      <AnimatePresence>{speaking && <motion.span className={`os-bubble ${below ? 'is-below' : ''} ${x < 0.38 ? 'is-left' : x > 0.62 ? 'is-right' : ''}`} initial={{ opacity: 0, y: reduced ? 0 : 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}><b>{nameOf(p)} · {p.role}</b>{text}</motion.span>}</AnimatePresence>
      <span className="os-pad"><Avatar av={p.av} size={size} state={active && !reduced ? 'called' : 'idle'} delay={(x * 7 + y * 5) % 3} color={p.color} /></span>
      <strong>{nameOf(p)}</strong>
    </button>
  )
}

export function OfficeStage({ onWorkflow, onBrowser, bar }: { onWorkflow: () => void; onBrowser: () => void; bar: ReactNode }) {
  const reduced = !!useReducedMotion()
  const [tick, setTick] = useState(0), [selected, setSelected] = useState<string | null>(null), [paused, setPaused] = useState(false)
  const index = Math.floor(tick / 100) % SCENES.length, progress = tick % 100, scene = SCENES[index], Icon = scene.icon
  const moving = !reduced && !paused
  const floor = useBox()
  const size = Math.max(30, Math.min(54, floor.w / (COLS + 0.5) / 0.78, floor.h / ROWS - 34))
  useEffect(() => {
    if (!moving) return
    const id = window.setInterval(() => { if (!document.hidden) setTick((t) => t + 1) }, 100)
    return () => clearInterval(id)
  }, [moving])
  useEffect(() => { const replay = () => { setTick(0); setSelected(null); setPaused(false) }; window.addEventListener('picked:replay-office', replay); return () => window.removeEventListener('picked:replay-office', replay) }, [])
  useEffect(() => { if (!selected) return; const id = window.setTimeout(() => setSelected(null), 4200); return () => clearTimeout(id) }, [selected])
  const visible = reduced ? scene.words.length : Math.min(scene.words.length, Math.floor(progress * 2.4))
  return (
    <motion.main className={`os-root ${!moving ? 'os-paused' : ''}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: reduced ? 0 : -12 }} transition={{ duration: 0.35 }}>
      <header className="os-nav">
        <a className="os-brand" href="/" aria-label="Picked home"><span><Check size={20} strokeWidth={3} /></span>picked<span className="os-brand-dot">.</span></a>
        <nav aria-label="Main navigation">
          <span className="os-nav-current">The office</span>
          <a href="/workflow" onClick={(e) => { e.preventDefault(); onWorkflow() }}>Workflow <ArrowRight size={15} /></a>
          <button onClick={() => useStory.setState({ open: true, slide: 0 })}><BookOpen size={16} />Story</button>
          <button onClick={onBrowser}><Terminal size={16} />Browser</button>
          <button onClick={() => useApps.setState({ open: true })}><LayoutGrid size={16} />Apps</button>
        </nav>
        <button className="os-xray" onClick={() => openAnalyze()}><ScanSearch size={18} />Business X-ray<ArrowRight size={15} /></button>
      </header>

      <div className="os-body">
        <h1 className="os-heading">A team of AI agents that gets your brand <span>picked.</span></h1>
        <div className="os-workspace">
          <aside className="os-team" aria-label="Your agent team">
            <div className="os-panel-title"><span><span className="os-online" />Your AI company</span><small>{TEAM.length} agents on the floor</small></div>
            <div ref={floor.ref} className="os-floor">
              {SLOT.map((id) => {
                const p = get(id), s = SPOT.get(id)!
                const lead = id === scene.agent, receiver = id === scene.to
                const speaking = selected === id || (!selected && ((lead && progress < 46) || (receiver && progress >= 46 && progress < 92)))
                return <Desk key={id} p={p} x={s.x} y={s.y} size={size} active={lead || receiver || selected === id} speaking={speaking} text={selected === id ? p.line : lead ? scene.reply : scene.answer} onSelect={() => setSelected(id)} reduced={reduced} below={s.y < 0.4} />
              })}
            </div>
          </aside>

          <section className="os-stage" aria-label="Animated workflow demonstration">
            <div className="os-stage-top"><span><i />Inside the workflow</span><em>Simulated demo</em>
              <span className="os-play"><button onClick={() => setPaused((v) => !v)} aria-label={paused ? 'Play' : 'Pause'}>{paused ? <Play size={17} /> : <Pause size={17} />}</button><button onClick={() => { setTick(0); setSelected(null) }} aria-label="Restart"><RotateCcw size={17} /></button></span>
            </div>
            <div className="os-scene">
              <div className="os-scene-grid" />
              <AnimatePresence mode="wait"><motion.div key={index} className="os-scene-content" initial={{ opacity: 0, y: reduced ? 0 : 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -10 }} transition={{ duration: 0.3 }}>
                <div className="os-scene-caption"><span>{String(index + 1).padStart(2, '0')} / 06</span><h2>{scene.name}</h2></div>
                <div className="os-stream-card">
                  <div className="os-stream-head"><span className="os-task-icon"><Icon size={22} /></span><div><b>{scene.task}</b><small><span />{reduced ? 'Preview' : 'Agents are collaborating'}</small></div></div>
                  <div className="os-stream-paper"><div className="os-paper-label">{scene.label}</div><p>{scene.words.slice(0, visible)}<span className="os-caret" /></p></div>
                  <div className="os-evidence">{scene.output.map((line, i) => <motion.div key={line} initial={false} animate={{ opacity: reduced || progress > 24 + i * 18 ? 1 : 0.3, x: reduced || progress > 24 + i * 18 ? 0 : 6 }}><Check size={16} /><span>{line}</span></motion.div>)}</div>
                </div>
                <div className="os-handoff"><span className="os-person-chip"><img src={`/avatars/${get(scene.agent).av}.webp`} alt="" /><b>{nameOf(get(scene.agent))}</b></span><div className="os-wire"><span /><span /><span /></div><span className="os-handoff-label">{progress < 46 ? 'handing over…' : 'delivered'}</span><div className="os-wire"><span /><span /><span /></div><span className="os-person-chip"><img src={`/avatars/${get(scene.to).av}.webp`} alt="" /><b>{nameOf(get(scene.to))}</b></span></div>
              </motion.div></AnimatePresence>
            </div>
            <div className="os-timeline" aria-label="Demonstration steps">{SCENES.map((s, i) => <button key={s.task} aria-current={index === i ? 'step' : undefined} onClick={() => { setTick(i * 100); setSelected(null) }}><span><i style={{ width: `${index === i ? progress : i < index ? 100 : 0}%` }} /></span><b>{STEPS[i]}</b></button>)}</div>
          </section>
        </div>
        <footer className="os-footer">{bar}</footer>
      </div>
    </motion.main>
  )
}
