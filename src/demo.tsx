import { useEffect } from 'react'
import { create } from 'zustand'
import { AnimatePresence, motion } from 'motion/react'
import { Circle, MousePointer2, Play, Square, X } from 'lucide-react'
import { useStory } from './Story'
import { useApps } from './Apps'
import { useBrowser } from './BrowserPanel'
import { useOffice } from './Office'
import { useLive, startLive, stopLive } from './live'
import { useBots, useChat } from './chat'
import { useAnalyze } from './Analyze'
import { loadSeed, seed } from './seed'

/* Stage demo: an autopilot that drives the real interface the way a presenter would. A visible cursor moves to each control and clicks it,
   text is typed into the real inputs, and every job it starts is the real job (one at a time, it waits for each to finish).
   Escape or Stop ends it at once. */
type Cur = { x: number; y: number; on: boolean; down: boolean }
export const useDemo = create<{ panel: boolean; running: boolean; scene: string; caption: string; cur: Cur; picked: Record<string, boolean>; err: string; slow: boolean; clean: boolean; fast: boolean; focus: { x: number; y: number; w: number; h: number } | null; extZoom: boolean; ext: boolean; badge: string; big: string; video: { url: string; mb: string } | null }>(() => ({ panel: false, running: false, scene: '', caption: '', cur: { x: 0, y: 0, on: false, down: false }, picked: {}, err: '', slow: false, clean: false, fast: false, focus: null, extZoom: false, ext: false, badge: '', big: '', video: null }))
const set = useDemo.setState
let abort = false
class Stopped extends Error {}

const nap = (ms: number) => new Promise<void>((res, rej) => { const t0 = Date.now(); const id = setInterval(() => { if (abort) { clearInterval(id); rej(new Stopped()) } else if (Date.now() - t0 >= ms) { clearInterval(id); res() } }, 40) })
/** Pauses for the presenter's rhythm: “slow” mode (for recording a video) stretches every pause by 1.7. Waiting for a real job is never stretched. */
const sleep = (ms: number) => { const d = useDemo.getState(); return nap(d.fast ? ms * 0.72 : d.slow ? ms * 1.7 : ms) } // the 2-minute reel runs at 0.72 of the pause
const shown = (e: Element | null | undefined): e is HTMLElement => !!e && (e as HTMLElement).getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden'
type Target = string | (() => Element | null | undefined)
function find(t: Target): HTMLElement | null {
  if (typeof t === 'function') { const e = t(); return shown(e) ? e : null }
  if (t.startsWith('text=')) {
    const want = t.slice(5).toLowerCase(), all = [...document.querySelectorAll<HTMLElement>('button, a, [role=menuitem], label, summary')].filter(shown)
    return all.find((e) => e.innerText.trim().toLowerCase() === want) ?? null // exact text only: “Approve” must never hit “Approve the plan and start”
  }
  const all = [...document.querySelectorAll<HTMLElement>(t)].filter(shown)
  return all[all.length - 1] ?? null
}
async function el(t: Target, timeout = 15000) { const t0 = Date.now(); for (;;) { const e = find(t); if (e) return e; if (Date.now() - t0 > timeout) throw new Error(`Could not find ${typeof t === 'string' ? t.replace('text=', '“') + (t.startsWith('text=') ? '”' : '') : 'the control'} on screen.`); await nap(150) } }
async function point(e: HTMLElement) { e.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); await sleep(250); const r = e.getBoundingClientRect(), fr = (e.ownerDocument.defaultView?.frameElement as HTMLElement | null)?.getBoundingClientRect(); set((s) => ({ cur: { ...s.cur, on: true, x: (fr?.left ?? 0) + r.left + Math.min(r.width / 2, 60), y: (fr?.top ?? 0) + r.top + r.height / 2 } })); await sleep(820) }
async function click(t: Target, timeout?: number) { if (cam.s !== 1 && !String(t).includes('Approve')) await unzoom(); const e = await el(t, timeout); await point(e); set((s) => ({ cur: { ...s.cur, down: true } })); await sleep(130); e.click(); set((s) => ({ cur: { ...s.cur, down: false } })); await sleep(450) }
async function type(t: Target, text: string, { enter = false, clear = true } = {}) {
  if (cam.s !== 1) await unzoom()
  const e = (await el(t)) as HTMLInputElement | HTMLTextAreaElement; await point(e); e.focus()
  const setter = Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')!.set!
  const put = (v: string) => { setter.call(e, v); e.dispatchEvent(new Event('input', { bubbles: true })) }
  if (clear) put('')
  for (const ch of text) { put(e.value + ch); await nap(useDemo.getState().fast ? 9 + Math.random() * 7 : (useDemo.getState().slow ? 55 : 30) + Math.random() * 28) }
  await sleep(350)
  if (enter) { const f = e.closest('form'); if (f) f.requestSubmit(); else e.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) ; await sleep(400) }
}
async function until(p: string | (() => boolean), timeout = 60000, what = '') {
  const t0 = Date.now(), want = typeof p === 'string' ? p.toLowerCase() : '', ok = typeof p === 'string' ? () => document.body.innerText.toLowerCase().includes(want) : p // headings are upper-cased by CSS, and innerText follows it
  for (;;) { if (ok()) return; if (Date.now() - t0 > timeout) throw new Error(`Waited ${Math.round(timeout / 1000)} s for ${what || (typeof p === 'string' ? `“${p}”` : 'the job')}; it did not finish.`); await nap(400) }
}
const say = async (text: string, ms = 0) => { set({ caption: text }); if (ms) await sleep(ms) }
const chatBox = () => document.querySelector<HTMLElement>('main section .overflow-y-auto')
async function glide(px: number, steps = 6) { const b = chatBox(); if (!b) return; for (let i = 0; i < steps; i++) { b.scrollBy({ top: px / steps, behavior: 'smooth' }); await sleep(450) } }
async function show(text: string) { const e = [...document.querySelectorAll<HTMLElement>('main *')].find((x) => x.children.length <= 1 && x.textContent?.trim().toLowerCase().startsWith(text.toLowerCase()) && shown(x)); if (e) { e.scrollIntoView({ block: 'start', behavior: 'smooth' }); await sleep(900) } }
const composer = 'input[placeholder^="Message"]'
const row = (name: string) => () => [...document.querySelectorAll<HTMLElement>('aside button')].find((b) => b.innerText.trim().startsWith(name))
const esc = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
async function office() { if (!useOffice.getState().open) { useOffice.setState({ open: true }); await sleep(900) } }
async function everyone() { await office(); if (useChat.getState().active !== 'all') await click(row('Everyone')) }
async function ask(text: string) { await everyone(); await type(composer, text, { enter: true }) }


/* The camera: the whole messenger zooms smoothly onto what matters (centred on it) and a ring marks it; the next zoom glides from one target to the next. */
const stageEl = () => document.querySelector<HTMLElement>('main.absolute.inset-0')
const cam = { s: 1, tx: 0, ty: 0 }
async function zoom(t: Target, scale = 1.35, hold = 1400) {
  const m = stageEl(); if (!m) return
  const e = await el(t); e.scrollIntoView({ block: 'center', behavior: 'smooth' }); await nap(380)
  const r = e.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight
  const ux = (r.left - cam.tx) / cam.s, uy = (r.top - cam.ty) / cam.s, uw = r.width / cam.s, uh = r.height / cam.s // where it sits with no zoom
  const s = Math.max(1, Math.min(scale, vw / Math.max(uw + 60, 1), vh / Math.max(uh + 60, 1)))
  const tx = Math.max(vw - vw * s, Math.min(0, vw / 2 - (ux + uw / 2) * s)), ty = Math.max(vh - vh * s, Math.min(0, vh / 2 - (uy + uh / 2) * s))
  const fast = useDemo.getState().fast
  m.style.transformOrigin = '0 0'; m.style.willChange = 'transform'; m.style.transition = `transform ${fast ? 620 : 950}ms cubic-bezier(.22,.8,.24,1)`; m.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`
  cam.s = s; cam.tx = tx; cam.ty = ty
  set({ focus: { x: ux * s + tx - 8, y: uy * s + ty - 8, w: uw * s + 16, h: uh * s + 16 } })
  await sleep(hold)
}
async function unzoom() {
  const m = stageEl(); set({ focus: null }); if (!m || cam.s === 1) return
  m.style.transition = `transform ${useDemo.getState().fast ? 480 : 750}ms cubic-bezier(.22,.8,.24,1)`; m.style.transform = 'translate(0px, 0px) scale(1)'; cam.s = 1; cam.tx = 0; cam.ty = 0; await nap(useDemo.getState().fast ? 480 : 750)
}
const resetZoom = () => { const m = stageEl(); if (m) { m.style.transition = ''; m.style.transform = ''; m.style.willChange = '' } cam.s = 1; cam.tx = 0; cam.ty = 0; set({ focus: null }) }
/** The block that starts with this text (an eyebrow, a heading), as a zoom target: its section when it has one. */
const block = (text: string) => () => { const e = [...document.querySelectorAll<HTMLElement>('main *')].find((x) => x.children.length <= 1 && x.textContent?.trim().toLowerCase().startsWith(text.toLowerCase()) && shown(x)); return e ? (e.closest('section') ?? e.parentElement) : null }

type Scene = { id: string; title: string; about: string; mins: string; owner?: boolean; run: () => Promise<void> }
export const SCENES: Scene[] = [
  { id: 'team', title: 'The AI company', about: 'Agents as rows, group chat, direct chat', mins: '0.5', run: async () => {
    await office(); await say('This is Picked: a company of AI agents. Each row is an agent you can talk to; “Everyone” is the group chat.', 3500)
    await click(row('Sy')); await say('A direct chat: Sy is the site auditor and answers in its own role.', 3000)
    await click(row('Mira')); await say('Mira writes, only from facts found on your site.', 2500)
    await click(row('Everyone')); await say('In the group chat NaN routes each request to the right colleague.', 2500)
  } },
  { id: 'story', title: 'Story sheets', about: 'Positioning, business case, real data', mins: '0.5', run: async () => {
    await office(); await click('button[title="Menu"]'); await click('text=Story'); await say('The story: why AI recommendations matter, and the numbers behind Picked.', 3500)
    for (let i = 1; i < 5; i++) { useStory.setState({ slide: i }); await sleep(3800) }
    useStory.setState({ open: false }); await sleep(500)
  } },
  { id: 'apps', title: 'Connected apps (MCP)', about: '28 apps with permissions per agent', mins: '0.3', run: async () => {
    await office(); await click('button[title="Menu"]'); await click('text=Connected apps'); await say('The agents can use connected apps through MCP, each one switched on per agent.', 2500)
    const box = document.querySelector<HTMLElement>('.fixed.inset-0 .overflow-y-auto'); for (let i = 0; i < 4; i++) { box?.scrollBy({ top: 220, behavior: 'smooth' }); await sleep(900) }
    useApps.setState({ open: false }); await sleep(500)
  } },
  { id: 'agent', title: 'New agent from one sentence', about: 'The model writes the full prompt; it answers in role', mins: '1.5', run: async () => {
    await office(); await click('button[title="New agent"]'); await say('A new agent from one sentence: the model writes its full prompt.')
    await type('textarea', 'A keyword researcher for Vietnamese kitchenware who finds what buyers type into Google and Gemini')
    await click('text=Write the prompt'); await say('Writing the prompt with the team’s model… (real call)')
    await until('Create agent', 120000, 'the prompt'); await sleep(2500); await say('Name, role and a full prompt. Everything can be edited before keeping it.', 2500)
    await click('text=Create agent'); await sleep(800)
    await type(composer, 'Give me 5 keyword ideas for clay pots', { enter: true }); await say('The new agent answers in its own role.')
    await sleep(2500); await until(() => !document.body.innerText.includes('Thinking'), 90000, 'the answer'); await sleep(4500)
  } },
  { id: 'xray', title: 'Business X-ray', about: 'Robot read, 39 checks, live page, verdict', mins: '1.5', run: async () => {
    await ask('Analyze elmich.vn'); await say('A real X-ray of elmich.vn: our robot reads the site, 39 readiness checks, a live-page inspection, then Ana writes the verdict.')
    await until('Agent-readiness', 200000, 'the X-ray'); await sleep(1500); await say('The report: score, the three layers, a fix plan in order, and the evidence behind every finding.')
    await zoom(() => [...document.querySelectorAll<HTMLElement>('main h3')].find((h) => /scores|stands in the way/.test(h.innerText)), 1.4, 2200); await zoom(block('The fix plan'), 1.3, 2600); await zoom(block('Why each one matters'), 1.3, 2200); await unzoom()
  } },
  { id: 'copilot', title: 'GEO Copilot', about: 'Find the store online, one story everywhere, the plan', mins: '1', run: async () => {
    await ask('This is my store: locknlock.vn, do GEO for it'); await say('The GEO Copilot finds where the store lives online: the website and every profile it links to.')
    await until('These are mine', 60000, 'the places'); await sleep(2500); await say('The owner confirms what is theirs. Nothing is checked before that.', 2500)
    await click('text=These are mine, check them'); await until('What gets a store recommended', 60000, 'the checks'); await say('Every place is checked against the others: name, phone, address, profiles declared as one business.')
    await zoom(block('One business everywhere'), 1.45, 3200)
    await say('The four criteria for being recommended, with this store’s status and the measured evidence.'); await zoom(block('What gets a store recommended'), 1.3, 5500)
    await say('A ten-step plan: who does what, which criterion it serves, and what needs the owner.'); await zoom(block('The plan'), 1.3, 5500)
    await show('The fixes'); await say('Each fix is a real file built from the site’s own facts, shown before and after.', 3500)
    await click('text=Approve'); await say('Approved fixes are counted as agency hours not paid for.', 3000)
  } },
  { id: 'browser', owner: true, title: 'The agent’s browser', about: 'Opens a page on the right and scores it for AI', mins: '0.7', run: async () => {
    await ask('Open elmich.vn and review it'); await say('The agent opens the page in its own browser, on the right, and scores how readable it is for AI.')
    await until('The page is open in the browser on the right', 120000, 'the review'); await sleep(6000)
    useBrowser.setState({ open: false }); await sleep(600)
  } },
  { id: 'gemini', title: 'Ask Gemini, live', about: 'One real buyer question in a fresh tab', mins: '1', run: async () => {
    await ask('Ask Gemini: hộp cơm giữ nhiệt nào tốt nhất?'); await say('One real buyer question, asked in a fresh anonymous Gemini tab. Who does it name?')
    await until('What Gemini said', 150000, 'Gemini'); await sleep(1200); await say('The ranking: which brands Gemini names, in which order, and whether ours is there.'); await glide(500); await sleep(3500)
  } },
  { id: 'cost', title: 'Agency comparison', about: 'Measured times against agency hours', mins: '0.4', run: async () => {
    await ask('How much does this save versus an SEO agency?'); await until('What this replaces', 30000); await sleep(1000)
    await say('What this work costs through an agency, set against the times measured on this machine.'); await glide(400); await sleep(2500)
    await type('input[aria-label="Hourly rate in US dollars"]', '20'); await say('Change the rate or the hours to match a real quote: the totals follow.', 3500)
  } },
  { id: 'audit', owner: true, title: 'Audit a brand (in the chat)', about: 'Stages tick off live; the run stops at the owner approval', mins: '1.5', run: async () => {
    await ask('Audit Elmich'); await say('A full audit of Elmich: 40 saved Gemini answers re-scored, then analysis, the website, facts, content and the council.')
    await until(() => { const L = useLive.getState(); return L.status !== 'running' || L.approval?.status === 'pending' }, 240000, 'the audit')
    await say('It stops at the owner’s approval: nothing is published without it.', 4500)
    await stopLive(); await sleep(600)
  } },
  { id: 'sidebar', title: 'Search and collapse the team list', about: 'Find an agent, fold the sidebar, open it again', mins: '0.4', run: async () => {
    await office(); await type('aside input[placeholder="Search"]', 'quinn'); await say('Search finds an agent at once.', 2200)
    await click('aside button:has(svg.lucide-x)').catch(() => {}); await sleep(500)
    await click('button[title="Collapse"]'); await say('The list folds into faces, leaving room for the work.', 2800)
    await click('button[title="Expand"]'); await sleep(900)
  } },
  { id: 'edit', title: 'Edit, clear and delete an agent', about: 'The per-agent menu on hover', mins: '0.7', run: async () => {
    await office()
    const kim = () => [...document.querySelectorAll<HTMLElement>('aside button')].find((b) => b.innerText.trim().startsWith('Kim'))
    if (!kim()) { await say('No custom agent yet: play “New agent” first.', 3500); return }
    await click(kim()!.parentElement!.querySelector('button[aria-label^="Options"]') as HTMLElement | null ? () => kim()!.parentElement!.querySelector('button[aria-label^="Options"]') : 'text=Kim'); await say('Hover an agent for its menu: clear the conversation or delete the agent.', 3200)
    esc(); await sleep(400)
  } },
  { id: 'signin', owner: true, title: 'Sign in to read a social page', about: 'The owner signs in; the agent reads only after approval', mins: '1.2', run: async () => {
    await ask('GEO for locknlock.vn'); await until('These are mine', 60000, 'the places'); await sleep(1500)
    await say('A social page can be read from the owner’s own signed-in profile.')
    await click(() => [...document.querySelectorAll<HTMLElement>('main div')].find((d) => /^Youtube/i.test(d.innerText.trim()) && d.querySelector('button'))?.querySelector('button:not([type=button]):last-of-type, button'))
    await sleep(2500); await say('Signing in happens on the right, in the real page. Picked never sees the password.', 3500)
    await click('text=Approve and read'); await until('Read: ', 60000, 'the read'); await say('Read only, and only after approval. Sign out deletes the profile.', 3500)
  } },
  { id: 'plan', owner: true, title: 'Approve the plan: the team starts', about: 'One approval starts the audit and schedules the weekly re-measure', mins: '2', run: async () => {
    await ask('GEO for elmich.vn'); await until('These are mine', 60000, 'the places'); await sleep(1200); await click('text=These are mine, check them')
    await until('The plan', 60000, 'the plan'); await show('The plan'); await say('Ten steps: who does what, and which ones wait for the owner.', 3500)
    await type('input[placeholder^="e.g."]', 'hộp cơm giữ nhiệt'); await click('text=Approve the plan and start'); await say('One approval: the audit starts and the weekly re-measure is scheduled.')
    await until('Plan started', 30000); await sleep(4500)
    const st = await fetch('/api/status').then((r) => r.json()).catch(() => null)
    if (st?.running?.id) await fetch(`/api/audit/${st.running.id}/stop`, { method: 'POST' }).catch(() => {})
    const rts = await fetch('/api/routines').then((r) => r.json()).catch(() => ({ routines: [] }))
    for (const r of rts.routines ?? []) if (/weekly re-measure/.test(r.title)) await fetch(`/api/routines/${r.id}`, { method: 'DELETE' }).catch(() => {})
    await say('(Demo only: the run and the schedule were cleaned up.)', 2500)
  } },
  { id: 'workflow', owner: true, title: 'Workflow: audit a brand', about: 'The animated company, then a real audit on the canvas', mins: '2', run: async () => {
    await say('The workflow view: the whole company at work. First the animated walkthrough…', 1500)
    ;(window as any).__picked_workflow?.(); await sleep(20000)
    await say('…now a real audit of Elmich on the same canvas: 40 saved Gemini answers re-scored, then analysis, site audit, facts, content and the fact-check council.')
    await startLive({ brand: 'Elmich', mode: 'quick', replace: true })
    await until(() => { const L = useLive.getState(); return L.status !== 'running' || L.approval?.status === 'pending' }, 240000, 'the audit')
    await say('The run stops at the owner’s approval: nothing is published without it.', 5000)
    await stopLive(); useOffice.setState({ open: true }); await sleep(800)
  } },
  { id: 'extension', title: 'Extension: read the page you are on', about: 'Opens Shopee, the NaN panel reads it (one click on the icon)', mins: '1.5', run: async () => {
    await say('The NaN extension reads the page in your own Chrome: what you see, even where robots are turned away.')
    const ack = await new Promise<boolean>((res) => { const on = (e: MessageEvent) => { if (e.source === window && e.data?.source === 'picked-ext' && e.data.type === 'ack') { window.removeEventListener('message', on); res(true) } }; window.addEventListener('message', on); window.postMessage({ source: 'picked-demo', type: 'deep', url: 'https://shopee.vn/' }, location.origin); setTimeout(() => { window.removeEventListener('message', on); res(false) }, 1500) })
    if (!ack) { await say('The extension is not installed in this Chrome: load it from the extension folder and turn on page access, then play this scene again.', 7000); return }
    await say('Shopee is opening in a new tab. Click the N icon in the toolbar: the panel opens and starts the deep read by itself.', 12000)
  } },
]


/* ───────────── the 2-minute reel ───────────── */
const frameDoc = () => (document.querySelector<HTMLIFrameElement>('#ext-demo-frame')?.contentDocument ?? null)
const inFrame = (sel: string) => () => frameDoc()?.querySelector(sel)
const frameText = (t: string) => () => !!frameDoc()?.body?.innerText.toLowerCase().includes(t.toLowerCase())
const REEL: { id: string; title: string; run: () => Promise<void> }[] = [
  { id: 'team', title: 'The AI company', run: async () => {
    await office(); await say('Picked: a company of AI agents. Each row is one you can talk to.', 1500)
    await click(row('Sy')); await say('Sy audits websites.', 900); await click(row('Everyone')); await sleep(400)
  } },
  { id: 'agent', title: 'A new agent from one sentence', run: async () => {
    await click('button[title="New agent"]'); await say('A new agent from one sentence: the model writes its full prompt.')
    await type('textarea', 'A keyword researcher for Vietnamese kitchenware'); await click('text=Write the prompt')
    await until('Create agent', 20000, 'the prompt'); await sleep(700); await click('text=Create agent'); await sleep(500)
    await type(composer, 'Give me 5 keyword ideas for clay pots', { enter: true })
    await until(() => !document.body.innerText.includes('Thinking'), 20000, 'the reply'); await sleep(2200); await click(row('Everyone')); await sleep(300)
  } },
  { id: 'xray', title: 'Business X-ray', run: async () => {
    await type(composer, 'Analyze elmich.vn', { enter: true }); await say('Business X-ray: the robot reads the site, 39 checks, a live-page inspection, then the verdict.')
    await until('Agent-readiness', 40000, 'the X-ray'); await sleep(700); await say('Score, the three layers, a fix plan in order.')
    await zoom(() => [...document.querySelectorAll<HTMLElement>('main h3')].find((h) => /scores|stands in the way/.test(h.innerText)), 1.4, 1300); await zoom(block('The fix plan'), 1.3, 1400); await unzoom()
  } },
  { id: 'copilot', title: 'GEO Copilot', run: async () => {
    await type(composer, 'GEO for locknlock.vn', { enter: true }); await say('GEO Copilot: where does this store live online?')
    await until('These are mine', 30000, 'the places'); await sleep(600); await click('text=These are mine, check them')
    await until('What gets a store recommended', 30000, 'the checks'); await say('One story everywhere? Four criteria, a ten-step plan, fixes the owner approves.')
    await zoom(block('One business everywhere'), 1.45, 1100); await zoom(block('What gets a store recommended'), 1.3, 1500); await zoom(block('The plan'), 1.3, 1500); await zoom(block('The fixes'), 1.3, 1300); await click('text=Approve'); await sleep(400); await unzoom()
  } },
  { id: 'audit', title: 'Audit a brand', run: async () => {
    await type(composer, 'Audit Elmich', { enter: true }); await say('An audit: 40 Gemini answers, who is named, and why not you. (replayed from a saved run)')
    await until(() => { const L = useLive.getState(); return L.status !== 'running' && L.summary != null }, 40000, 'the audit'); await zoom(() => [...document.querySelectorAll<HTMLElement>('main span')].find((x) => /answers name/.test(x.innerText))?.closest('.rounded-2xl'), 1.6, 1500); await unzoom(); await stopLive(); await sleep(300)
  } },
  { id: 'gemini', title: 'A real Gemini answer', run: async () => {
    await type(composer, 'Ask Gemini: which thermal lunch box is best?', { enter: true }); await say('A buyer question to Gemini: who does it name? (a saved real answer)')
    await until('What Gemini said', 20000, 'the answer'); await sleep(500); await zoom(() => [...document.querySelectorAll<HTMLElement>('main div')].reverse().find((d) => /is named #|is not named/i.test(d.innerText) && d.classList.contains('rounded-[20px]')), 1.45, 1700); await unzoom()
  } },
  { id: 'cost', title: 'Versus an SEO agency', run: async () => {
    await type(composer, 'How much does this save versus an SEO agency?', { enter: true }); await until('What this replaces', 15000)
    await say('Measured times against agency hours.'); await zoom(() => [...document.querySelectorAll<HTMLElement>('main .tnum')].reverse().find((x) => /\$/.test(x.innerText))?.closest('.rounded-\[22px\]'), 1.5, 1700); await unzoom()
  } },
  { id: 'browser', title: 'The agent’s browser', run: async () => {
    if (!(await fetch('/api/owner').then((r) => r.json()).then((o) => o.owner).catch(() => false))) return // needs Owner mode: skipped at once, so the reel keeps its time
    await type(composer, 'Open elmich.vn', { enter: true }); await say('The agent opens the page on the right.')
    await until('The page is open in the browser', 30000, 'the page'); await sleep(1700); useBrowser.setState({ open: false }); await sleep(300)
  } },
  { id: 'extension', title: 'The Chrome extension', run: async () => {
    set({ ext: true }); await until(() => !!frameDoc()?.querySelector('#starters button'), 8000, 'the panel'); await say('The NaN extension reads the page you are on, even where robots are turned away.')
    await sleep(500); await click(inFrame('#starters button:nth-child(2)')); await until(frameText('Robot vs your browser'), 20000, 'the deep read')
    set({ extZoom: true }); await sleep(2000); set({ extZoom: false, ext: false }); await sleep(400)
  } },
  { id: 'workflow', title: 'The company at work', run: async () => {
    await click('button[title="Menu"]'); await click('text=Workflow (simulation)'); await say('And the whole company at work, on one canvas.'); await sleep(7000)
  } },
]
export const REEL_IDS = REEL.map((r) => r.id)
const REEL_LIMIT_MS = 120000

type Rec = { stop: () => Promise<Blob>; onEnd: (f: () => void) => void }
async function startRecorder(): Promise<Rec> {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30, width: 1920, height: 1080 }, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include' } as any)
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)), chunks: BlobPart[] = []
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 }); rec.ondataavailable = (e) => e.data.size && chunks.push(e.data); rec.start(1000)
  return {
    stop: () => new Promise((res) => { if (rec.state === 'inactive') { stream.getTracks().forEach((t) => t.stop()); return res(new Blob(chunks, { type: 'video/webm' })) } rec.onstop = () => { stream.getTracks().forEach((t) => t.stop()); res(new Blob(chunks, { type: 'video/webm' })) }; rec.stop() }),
    onEnd: (f) => stream.getVideoTracks()[0]?.addEventListener('ended', f),
  }
}

/** The 2-minute reel: starts from a clean first screen, runs every flow fast on seeded data, and (optionally) records the tab to a file. */
export async function playReel({ record }: { record: boolean }) {
  if (useDemo.getState().running) return
  abort = false; set({ panel: false, err: '', video: null })
  let rec: Rec | null = null
  if (record) { try { rec = await startRecorder() } catch (e: any) { set({ err: /denied|NotAllowed|Permission/i.test(String(e)) ? 'Screen recording was not allowed.' : String(e.message || e) }); return } rec.onEnd(() => { abort = true }) }
  set({ running: true, scene: '2-minute reel', fast: true, clean: true, slow: false, badge: 'Recording · some results are replayed from saved real runs' })
  await loadSeed(); seed.on = true
  const madeBots = new Set(useBots.getState().bots.map((b) => b.id))
  // a clean first screen: no conversations, nothing open
  useStory.setState({ open: false }); useApps.setState({ open: false }); useBrowser.setState({ open: false }); useAnalyze.setState({ open: false, phase: 'idle', report: null, feed: [] })
  useChat.setState({ threads: {}, active: 'all', draft: '', last: {}, q: '' }); useBots.setState({ bots: [] }); try { localStorage.removeItem('picked.chat.v2') } catch { /* fine */ }
  await stopLive().catch(() => {}); useOffice.setState({ open: true })
  const t0 = Date.now(), guard = setTimeout(() => { abort = true }, REEL_LIMIT_MS)
  try {
    await nap(900)
    if (record) { for (const n of ['3', '2', '1']) { set({ big: n }); await nap(650) } set({ big: '' }) }
    for (const sc of REEL) {
      set({ scene: sc.title })
      try { await sc.run() } catch (e: any) { if (e instanceof Stopped) throw e; await say(`${sc.title}: ${e.message}`, 1200) }
    }
    set({ big: 'picked.' , caption: 'AI agents that get your brand picked.' }); await nap(2600)
  } catch { /* stopped, or out of time */ }
  clearTimeout(guard); seed.on = false
  set({ ext: false, big: '', caption: '' })
  const ms = Date.now() - t0
  useBots.setState((s) => ({ bots: s.bots.filter((b) => madeBots.has(b.id)) }))
  let video: { url: string; mb: string } | null = null
  if (rec) { const blob = await rec.stop(); if (blob.size > 0) { const url = URL.createObjectURL(blob); video = { url, mb: (blob.size / 1048576).toFixed(1) }; const a = document.createElement('a'); a.href = url; a.download = 'picked-demo-2min.webm'; a.click() } }
  resetZoom(); set({ running: false, scene: '', fast: false, clean: false, badge: '', cur: { x: 0, y: 0, on: false, down: false }, video: video ?? null, err: ms > REEL_LIMIT_MS ? `The reel took ${Math.round(ms / 1000)} s: over two minutes.` : '' })
}

/** Plays scenes one after another; a scene that fails says why and the next one starts. */
export async function play(ids: string[]) {
  if (useDemo.getState().running) return
  abort = false; set({ running: true, panel: false, err: '' })
  try {
    for (const s of SCENES.filter((x) => ids.includes(x.id))) {
      set({ scene: s.title })
      if (s.owner && !(await fetch('/api/owner').then((r) => r.json()).then((o) => o.owner).catch(() => false))) { await say(`${s.title}: unlock Owner mode (menu ☰) to play this one.`, 4500); continue }
      try { await s.run() } catch (e: any) { if (e instanceof Stopped) throw e; await say(`${s.title}: ${e.message}`, 4500) }
    }
    await say('That is the whole demo.', 2500)
  } catch { /* stopped */ }
  resetZoom(); set({ running: false, scene: '', caption: '', cur: { x: 0, y: 0, on: false, down: false } })
}
export const stop = () => { abort = true }
/** One ▶ button anywhere in the app: closes whatever is open and plays that scene. */
export const playScene = (id: string) => { useDemo.setState({ panel: false }); return play([id]) }

export function Demo() {
  const d = useDemo()
  const picked = (id: string) => d.picked[id] !== false
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && useDemo.getState().running && e.isTrusted) stop() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [])
  return (
    <>
      <AnimatePresence>
        {d.panel && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => set({ panel: false })} className="fixed inset-0 z-[80] grid place-items-center bg-ink/30 p-4">
            <motion.div initial={{ y: 16 }} animate={{ y: 0 }} onClick={(e) => e.stopPropagation()} className="max-h-[calc(100dvh-32px)] w-[620px] max-w-full overflow-y-auto rounded-[28px] border border-line bg-white p-6">
              <div className="flex items-center"><div className="text-[22px] font-semibold tracking-[-0.03em] text-ink">Stage demo</div><button onClick={() => set({ panel: false })} className="ml-auto grid h-9 w-9 place-items-center rounded-full text-mute hover:bg-surface"><X size={18} /></button></div>
              <div className="mt-4 flex flex-wrap items-center gap-2.5 rounded-2xl bg-surface p-3.5">
                <button onClick={() => void playReel({ record: true })} className="flex h-11 items-center gap-2 rounded-full bg-[#d92d20] px-5 text-[15.5px] font-semibold text-white hover:bg-[#b42318]"><Circle size={14} fill="currentColor" />Record 2-minute video</button>
                <button onClick={() => void playReel({ record: false })} className="flex h-11 items-center gap-2 rounded-full bg-white px-4 text-[15px] font-semibold text-ink ring-1 ring-line hover:bg-line"><Play size={14} />Preview the reel</button>
                <span className="w-full text-[13.5px] leading-snug text-mute">Starts from a clean first screen and runs every flow in under 2 minutes on saved data. Chrome asks which tab to share: pick this one. The file downloads when it ends.</span>
              </div>
              <p className="mt-4 text-[15px] text-mute">The autopilot drives the real interface: a cursor clicks, text is typed, and every job is real, one at a time. Press Esc to stop.</p>
              <div className="mt-4 divide-y divide-line overflow-hidden rounded-[18px] ring-1 ring-line">
                {SCENES.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                    <input type="checkbox" checked={picked(s.id)} onChange={(e) => set((st) => ({ picked: { ...st.picked, [s.id]: e.target.checked } }))} className="h-4 w-4 accent-[#111112]" aria-label={`Include ${s.title}`} />
                    <span className="w-5 text-[13px] font-semibold text-faint">{i + 1}</span>
                    <span className="min-w-0 flex-1"><span className="block text-[15.5px] font-semibold text-ink">{s.title}</span><span className="block text-[13.5px] text-mute">{s.about}</span></span>
                    <span className="text-[13px] text-faint">~{s.mins} min</span>
                    <button onClick={() => void play([s.id])} title={`Play ${s.title}`} className="grid h-9 w-9 place-items-center rounded-full bg-surface text-ink hover:bg-line"><Play size={15} /></button>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[14.5px] text-ink">
                <label className="flex items-center gap-2"><input type="checkbox" checked={d.slow} onChange={(e) => set({ slow: e.target.checked })} className="h-4 w-4 accent-[#111112]" />Slow pace (for recording a video)</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={d.clean} onChange={(e) => set({ clean: e.target.checked })} className="h-4 w-4 accent-[#111112]" />Hide the control bar</label>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button onClick={() => void play(SCENES.filter((s) => picked(s.id)).map((s) => s.id))} className="flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-[15.5px] font-semibold text-white hover:bg-[#0057b8]"><Play size={16} />Play {SCENES.filter((s) => picked(s.id)).length === SCENES.length ? 'everything' : 'the selected scenes'}</button>
                <span className="text-[13.5px] text-faint">about {SCENES.filter((s) => picked(s.id)).reduce((n, s) => n + Number(s.mins), 0).toFixed(0)} min with real jobs</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {d.ext && (
          <motion.div key="ext" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }} className="fixed inset-0 z-[9990] grid place-items-center bg-ink/60 backdrop-blur-[3px]">
            <motion.div initial={{ y: 30, scale: 0.97 }} animate={{ y: 0, scale: d.extZoom ? 1.16 : 1 }} exit={{ y: 20, opacity: 0 }} transition={{ type: 'spring', stiffness: 120, damping: 22 }} className="overflow-hidden rounded-[22px] bg-white shadow-[0_40px_120px_-30px_rgba(0,0,0,.7)]">
              <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-2 text-[13px] text-mute"><span className="flex gap-1.5">{['#f87171', '#fbbf24', '#34d399'].map((c) => <span key={c} className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />)}</span><span className="ml-2 flex-1 truncate rounded-full bg-white px-3 py-1 ring-1 ring-line">shopee.vn · the page you are on (saved snapshot)</span><span className="font-semibold text-ink">NaN for Picked</span></div>
              <iframe id="ext-demo-frame" title="NaN extension panel" src="/ext/preview.html" className="block h-[700px] w-[430px] border-0" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {d.focus && <motion.div className="pointer-events-none fixed z-[9996] rounded-[20px] border-2 border-accent shadow-[0_0_0_6px_rgba(0,100,212,.18),0_18px_50px_-20px_rgba(0,100,212,.6)]" initial={false} animate={{ left: d.focus.x, top: d.focus.y, width: d.focus.w, height: d.focus.h, opacity: 1 }} transition={{ type: 'spring', stiffness: 150, damping: 24 }} />}
      <AnimatePresence>{d.big && <motion.div key={d.big} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.2 }} transition={{ duration: 0.4 }} className="pointer-events-none fixed inset-0 z-[9997] grid place-items-center bg-white/80 text-[clamp(64px,14vw,200px)] font-semibold tracking-[-0.06em] text-ink">{d.big}</motion.div>}</AnimatePresence>
      {d.badge && d.running && <div className="pointer-events-none fixed bottom-3 left-3 z-[9998] rounded-full bg-ink/70 px-3 py-1 text-[12.5px] text-white">{d.badge}</div>}
      <AnimatePresence>
        {(d.video || d.err) && !d.running && (
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="fixed bottom-6 right-6 z-[85] w-[340px] rounded-3xl border border-line bg-white p-4 shadow-[0_24px_70px_-26px_rgba(17,17,18,.5)]">
            {d.video ? (<><div className="text-[16px] font-semibold text-ink">Video saved</div><div className="mt-0.5 text-[14px] text-mute">picked-demo-2min.webm · {d.video.mb} MB. It also went to your Downloads.</div>
              <div className="mt-3 flex gap-2"><a href={d.video.url} download="picked-demo-2min.webm" className="flex h-10 items-center rounded-full bg-ink px-4 text-[14.5px] font-semibold text-white no-underline">Download again</a><button onClick={() => set({ video: null, err: '' })} className="h-10 rounded-full px-4 text-[14.5px] font-semibold text-mute hover:bg-surface">Close</button></div></>)
              : (<><div className="text-[15px] text-bad">{d.err}</div><button onClick={() => set({ err: '' })} className="mt-3 h-10 rounded-full px-4 text-[14.5px] font-semibold text-mute hover:bg-surface">Close</button></>)}
          </motion.div>
        )}
      </AnimatePresence>
      {d.running && (
        <>
          <div className={`pointer-events-auto fixed left-1/2 top-3 z-[9998] flex -translate-x-1/2 items-center gap-3 rounded-full bg-ink py-1.5 pl-4 pr-1.5 text-[14px] text-white shadow-[0_14px_40px_-18px_rgba(0,0,0,.6)] transition-opacity ${d.clean ? "opacity-0 hover:opacity-100" : ""}`}>
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#4da3ff]" /><span className="font-semibold">Autopilot</span><span className="text-white/70">{d.scene}</span>
            <button onClick={stop} className="flex h-8 items-center gap-1.5 rounded-full bg-white/15 px-3 font-semibold hover:bg-white/25"><Square size={12} fill="currentColor" />Stop</button>
          </div>
          <AnimatePresence mode="wait">{d.caption && /(Could not|Waited|unlock|not installed|No custom|took over)/i.test(d.caption) && <motion.div key={d.caption} initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ type: 'spring', stiffness: 220, damping: 26 }} className="pointer-events-none fixed bottom-[128px] left-1/2 z-[9998] max-w-[min(760px,90vw)] -translate-x-1/2 rounded-2xl bg-ink/90 px-5 py-3 text-center text-[17px] leading-snug text-white shadow-[0_20px_50px_-20px_rgba(0,0,0,.6)]">{d.caption}</motion.div>}</AnimatePresence>
          {d.cur.on && <motion.div className="pointer-events-none fixed left-0 top-0 z-[9999]" animate={{ x: d.cur.x, y: d.cur.y }} transition={d.fast ? { type: 'spring', stiffness: 190, damping: 24 } : { type: 'spring', stiffness: 85, damping: 17, mass: 0.9 }}>
            <MousePointer2 size={30} className="-translate-x-1 -translate-y-1 fill-ink text-white drop-shadow-[0_3px_6px_rgba(0,0,0,.35)]" strokeWidth={1.5} />
            <motion.span className="absolute -left-3 -top-3 h-8 w-8 rounded-full bg-accent/40" animate={{ scale: d.cur.down ? 1 : 0, opacity: d.cur.down ? 1 : 0 }} transition={{ duration: 0.18 }} />
          </motion.div>}
        </>
      )}
    </>
  )
}
;(window as any).__picked_demo = { play, stop, scenes: SCENES.map((s) => s.id), reel: (record: boolean) => playReel({ record }) } // lets a remote clicker or a test start scenes by id
