import { create } from 'zustand'
import { PEOPLE, type Person } from './avatars'
import { intent, snap, type Act } from './SystemOne'
import { OFFLINE_MSG, probe } from './edge'

/* The messenger's brain: one thread per agent plus the group chat ("all", answered by NaN, who hands the work to the right colleague).
   A message either talks (streamed word by word) or carries a real run that the chat shows live, inline. */
export type Run =
  | { kind: 'xray'; input: string }
  | { kind: 'audit'; act: Act }
  | { kind: 'exec'; act: Act }
export type CMsg = { id: number; who: string; text: string; ts: number; run?: Run; res?: any; thinking?: boolean; old?: boolean; flow?: boolean }

export const TEAM: Person[] = ['nan', 'lia', 'mina', 'scout1', 'ana', 'sy', 'mira', 'theo', 'quinn', 'rhea', 'pax', 'tara'].map((id) => PEOPLE.find((p) => p.id === id)!)
export const personOf = (id: string) => (id === 'me' ? null : PEOPLE.find((p) => p.id === id) ?? TEAM[0])
const serverId = (id: string) => (id.startsWith('scout') ? 'scout' : id)
export const ENGINE: Record<string, string> = { nan: 'Claude Opus 5.5', lia: 'Gemini 3.8', mina: 'Gemini 3.8', scout1: 'Gemini tabs', ana: 'Gemini 4', sy: 'Gemini 4', mira: 'Sonnet 5.5', theo: 'Gemini 4', quinn: 'Council of 3 models', rhea: 'Fixed rules', pax: 'Fixed rules', tara: 'Scheduler' }
export const STARTERS: Record<string, string[]> = {
  all: ['Analyze highlandscoffee.com.vn', 'Audit Elmich, quick', 'Ask Gemini: nồi chiên không dầu loại nào tốt?', 'Open elmich.vn and review it'],
  nan: ['Analyze elmich.vn', 'Audit Elmich, quick', 'What can you do?', 'Explain what is on screen'],
  lia: ['Translate: tôi muốn bán nồi cơm điện', 'Restore diacritics: noi com dien tu'],
  mina: ['What would buyers ask about lunch boxes?', 'Ask Gemini: hộp cơm giữ nhiệt nào tốt?'],
  scout1: ['Ask Gemini: bình giữ nhiệt nào tốt nhất?', 'Open elmich.vn and review it'],
  ana: ['Who does AI recommend most?', 'Why is Elmich skipped?', 'Analyze locknlock.com'],
  sy: ['Analyze elmich.vn', 'Analyze zojirushi.com.vn', 'Open elmich.vn and review it'],
  mira: ['What do you need to write an FAQ?', 'How do you keep claims honest?'],
  theo: ['Who should we pitch first?', 'What do you never promise?'],
  quinn: ['How does the council decide?', 'Which models vote?'],
  rhea: ['What claims do you block?', 'Is personal data allowed in a draft?'],
  pax: ['What gets published?', 'Open the shop page'],
  tara: ['What do you track?', 'When do you re-measure?'],
}
const GREET: Record<string, string> = {
  all: 'Everyone is here. Ask anything about SEO or AI recommendations, or give a real job: NaN hands it to the right colleague and you watch it run.',
  nan: 'I route your requests to the team and run real jobs: site X-rays, audits, Gemini questions, browser reviews, connected apps.',
}

const KEY = 'picked.chat.v2'
const load = (): Record<string, CMsg[]> => {
  try { const t = JSON.parse(localStorage.getItem(KEY) || '{}'); for (const k of Object.keys(t)) t[k] = t[k].map((m: CMsg) => ({ ...m, old: true, res: m.run && !m.res ? { interrupted: true } : m.res, thinking: false })); return t } catch { return {} }
}
let nextId = Date.now()
export const useChat = create<{ active: string; threads: Record<string, CMsg[]>; draft: string; q: string; last: Record<string, number> }>(() => ({ active: 'all', threads: load(), draft: '', q: '', last: {} }))
const save = () => { try { const t = useChat.getState().threads; localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.slice(-60).map((m) => ({ ...m, thinking: false }))])))) } catch { /* storage full: the chat still works */ } }
export const add = (thread: string, m: Omit<CMsg, 'id' | 'ts'>) => { const id = ++nextId; useChat.setState((s) => ({ threads: { ...s.threads, [thread]: [...(s.threads[thread] ?? []), { ...m, id, ts: Date.now() }] }, last: { ...s.last, [thread]: Date.now() } })); save(); return id }
export const patch = (thread: string, id: number, p: Partial<CMsg>) => { useChat.setState((s) => ({ threads: { ...s.threads, [thread]: (s.threads[thread] ?? []).map((m) => (m.id === id ? { ...m, ...p } : m)) } })); save() }
export const drop = (thread: string, id: number) => { useChat.setState((s) => ({ threads: { ...s.threads, [thread]: (s.threads[thread] ?? []).filter((m) => m.id !== id) } })); save() }
export const greeting = (thread: string) => GREET[thread] ?? `${personOf(thread)?.line ?? 'Hello.'} Ask me anything in my field, or give me a real job.`

const post = async (url: string, body: any, ms = 70000) => {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) })
  const j = await r.json().catch(() => ({}))
  if (j.offline) { probe(); throw new Error('offline') }
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
  return j
}

/** who does the work when the request comes into the group chat */
const OWNER: Record<string, string> = { analyze: 'ana', audit: 'scout1', replay: 'scout1', ask: 'scout1', browse: 'scout1', apps: 'nan', profile: 'ana', rivals: 'ana', score: 'ana', explain: 'nan', help: 'nan', shop: 'pax', approve: 'pax', reject: 'pax' }
const CANVAS = new Set(['goto', 'overview', 'stop'])
const ACK = (a: Act) => {
  switch (a.type) {
    case 'analyze': return a.q ? `On it. Sy will read ${a.q}, score it for AI readiness and inspect the live page.` : 'Which business should we look at? Give me a website or a name.'
    case 'audit': return `Starting the ${a.fresh ? 'fresh' : 'quick'} audit for ${a.brand}.`
    case 'replay': return `Replaying the recorded Gemini answers, scored for ${a.brand || 'the brand'}.`
    case 'ask': return 'Scout is opening a fresh Gemini tab with your question.'
    case 'browse': return `Opening ${a.url} in the browser${a.review ? ' and reviewing it' : ''}.`
    case 'apps': return 'Using the connected apps, one tool at a time.'
    default: return ''
  }
}

export function openRun(thread: string, a: Act, by?: string) {
  const who = by ?? (thread === 'all' ? OWNER[a.type] ?? 'nan' : thread)
  if (CANVAS.has(a.type)) { add(thread, { who: by ?? (thread === 'all' ? 'nan' : thread), text: 'That is a view of the animated workflow. Open the workflow to watch it.', flow: true }); return }
  if (a.type === 'analyze') { if (!a.q) return; add(thread, { who, text: '', run: { kind: 'xray', input: a.q } }); return }
  if (a.type === 'audit' || a.type === 'replay') { add(thread, { who, text: '', run: { kind: 'audit', act: a } }); return }
  add(thread, { who, text: '', run: { kind: 'exec', act: a } })
}

export async function sendTurn(thread: string, raw: string) {
  const text = raw.trim(); if (!text) return
  const speaker = thread === 'all' ? 'nan' : thread
  const history = (useChat.getState().threads[thread] ?? []).filter((m) => m.text).slice(-8).map((m) => ({ who: m.who, name: personOf(m.who)?.name ?? '', text: m.text }))
  add(thread, { who: 'me', text })
  const bot = add(thread, { who: speaker, text: '', thinking: true })
  let acts: Act[] = [], reply = ''
  try {
    const a = intent(text)
    if (a) { acts = [a]; reply = ACK(a) }
    else {
      const j = await post('/api/one/chat', { text, original: text, agent: serverId(speaker), history, state: snap() })
      reply = j.reply || ''; acts = (j.actions ?? []).filter((x: Act) => x.type && x.type !== 'none').slice(0, 3)
    }
  } catch (e: any) {
    const off = /Failed to fetch|unavailable|offline|HTTP 50|HTTP 404/.test(String(e.message))
    patch(thread, bot, { thinking: false, text: off ? `${OFFLINE_MSG}. Typed commands such as “analyze elmich.vn” or “profile Sunhouse” still work when the machine is on.` : `Something went wrong: ${e.message || e}` })
    return
  }
  if (reply) patch(thread, bot, { thinking: false, text: reply }); else drop(thread, bot)
  for (const a of acts) openRun(thread, a)
}
export const idle = (thread: string) => !(useChat.getState().threads[thread] ?? []).some((m) => m.run && !m.res)
