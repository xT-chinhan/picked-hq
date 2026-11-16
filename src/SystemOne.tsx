import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowUp, Bot, Check, Sparkles, X } from 'lucide-react'
import { parseAnswer, summarize } from '../server/parse.mjs'
import { CYCLE, LIVE_ORDER, ORDER, PH, clock, cyc, phaseOf, type Phase } from './sim'
import { lget, replayRun, startLive, stopLive } from './live'
import { OFFLINE_MSG, probe } from './edge'
import { useWork } from './Workspace'
import { openPage, reviewTab, useBrowser } from './BrowserPanel'
import { useApps } from './Apps'
import { SLIDES, useStory } from './Story'
import { useOffice } from './Office'
import { Face } from './avatars'

/* NaN: the operator chat. Familiar commands are matched by rules in the browser (instant);
   anything else goes to the local LLM, which answers with a reply plus a list of real actions. */

export type Prompt = { role: string; context: string; task: string; constraints: string[]; output: string }
type Tr = { src: string; en: string; ms: number; provider: string; refined?: boolean }
type Step = { t: string; done: boolean }
export type Msg = { id: number; who: 'me' | 'one'; text: string; busy?: boolean; steps?: Step[]; tr?: Tr; pr?: Prompt & { by: 'rules' | 'llm' }; card?: any }
type Act = { type: string; brand?: string; website?: string; q?: string; phase?: Phase; fresh?: boolean; url?: string; review?: boolean }

export const useOne = create<{ open: boolean; msgs: Msg[]; team: boolean; presenter: boolean; info: boolean }>(() => ({ open: false, msgs: [], team: false, presenter: false, info: false }))
let mid = 0
const push = (m: Omit<Msg, 'id'>) => { const id = ++mid; useOne.setState((s) => ({ msgs: [...s.msgs, { ...m, id }] })); return id }
const patch = (id: number, p: Partial<Msg> | ((m: Msg) => Partial<Msg>)) => useOne.setState((s) => ({ msgs: s.msgs.map((m) => (m.id === id ? { ...m, ...(typeof p === 'function' ? p(m) : p) } : m)) }))
const step = (id: number, t: string) => patch(id, (m) => ({ steps: [...(m.steps ?? []).map((x) => ({ ...x, done: true })), { t, done: false }] }))
const finish = (id: number, text: string, card?: any) => patch(id, (m) => ({ text, card, busy: false, steps: (m.steps ?? []).map((x) => ({ ...x, done: true })) }))

/* ───────────── camera hooks (set by the stage) ───────────── */
type Nav = { goto: (k: Phase) => void; overview: () => void }
let nav: Nav = { goto: () => {}, overview: () => {} }
export const setNav = (n: Nav) => { nav = n }
/** jump to a step: the scripted loop is moved to that second; a live run only moves the camera */
export function jump(k: Phase) {
  if (lget().mode === 'script') { clock.t = cyc(clock.t) * CYCLE + PH[k][0] + 0.02 }
  nav.goto(k)
}

/* ───────────── helpers ───────────── */
export const plain = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim()
const post = async (url: string, body: any, ms = 70000) => {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) })
  const j = await r.json().catch(() => ({}))
  if (j.offline) { probe(); throw new Error('offline') }
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
  return j
}
const getJson = async (url: string) => { const r = await fetch(url); if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) throw new Error('unavailable'); return r.json() }
const savedRuns = (): Promise<any[]> => getJson('/api/runs').catch(() => getJson('/runs/index.json')).catch(() => [])
const loadRun = (id: string) => getJson(`/api/runs/${id}`).catch(() => getJson(`/runs/${id}.json`))
const serverUp = () => getJson('/api/runs').then(() => true).catch(() => false)

const BRANDS: [string, RegExp, string][] = [
  ['Elmich', /elmich/, 'https://elmich.vn'], ['Lock&Lock', /lock ?(&|n|and)? ?lock/, 'https://www.locknlock.vn'], ['Sunhouse', /sunhouse/, 'https://sunhouse.com.vn'],
  ['Zojirushi', /zojirushi/, 'https://www.zojirushi.com.vn'], ['Tiger', /\btiger\b/, ''], ['Thermos', /thermos/, ''], ['Tupperware', /tupperware/, ''], ['Kangaroo', /kangaroo/, ''], ['Stanley', /stanley/, ''],
]
function brandIn(n: string, tail = ''): { brand: string; website: string } | null {
  for (const [name, re, site] of BRANDS) if (re.test(n)) return { brand: name, website: site }
  const t = tail.replace(/\b(thuong hieu|brand|cho|for|the|audit|a|moi|fresh|real|that|live|giup|toi|tui|di|nhe)\b/g, ' ').replace(/[^a-z0-9& ]/g, ' ').replace(/\s+/g, ' ').trim()
  return t && t.length <= 30 ? { brand: t.replace(/\b[a-z]/g, (c) => c.toUpperCase()), website: '' } : null
}
const DEPT: [RegExp, Phase][] = [
  [/research|nghien cuu|tab gemini|gemini tab/, 'research'], [/analysis|phan tich/, 'analysis'], [/content|noi dung/, 'content'], [/risk|rui ro/, 'risk'],
  [/\bqa\b|kiem thu|kiem dinh/, 'qa'], [/approv|duyet/, 'approve'], [/publish|xuat ban|dang bai|dang trang/, 'publish'], [/track|theo doi/, 'track'],
  [/impact|tac dong|ket qua/, 'impact'], [/signal|mining|cau hoi khach/, 'mining'], [/citation|trich dan|nguon/, 'citations'], [/sync|dong bo|website|facts|du lieu shop/, 'sync'],
]
/** rule-based intent, a few microseconds */
export function intent(raw: string): Act | null {
  const n = plain(raw)
  let m: RegExpMatchArray | null
  if ((m = raw.match(/^\s*(?:apps?|app:|dùng app|dung app|use apps?)\s*[:,]?\s+(.{6,})$/i))) return { type: 'apps', q: m[1].trim() }
  if ((m = raw.match(/^\s*(?:ask|hỏi|hoi)(?:\s+gemini)?\s*[:,]?\s+(.{6,})$/i))) return { type: 'ask', q: m[1].trim() }
  if ((m = raw.match(/(?:mở|mo|open|xem|review|rà soát|ra soat|kiểm tra|kiem tra|check|browse|duyệt|truy cập|vào)\s+(?:trang\s+|page\s+|website\s+|site\s+)?((?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?)/i))) return { type: 'browse', url: m[1], review: /review|rà soát|ra soat|kiểm tra|kiem tra|check|đánh giá|danh gia/i.test(raw) }
  if (/^(stop|dung|thoat|exit|quay lai demo|back to (the )?demo)/.test(n)) return { type: 'stop' }
  if (/^(help|giup|lenh|commands?|\?)$/.test(n) || /(lam duoc gi|what can you do)/.test(n)) return { type: 'help' }
  if (/(toan canh|toan cong ty|whole company|overview|tong quan)/.test(n)) return { type: 'overview' }
  if (/(open|mo|xem|show).*(shop|cua hang|published page|trang da dang)/.test(n)) return { type: 'shop' }
  if (/(go to|goto|jump|den|nhay|chuyen|phong|department|show me the|mo phong|xem phong)/.test(n)) for (const [re, ph] of DEPT) if (re.test(n)) return { type: 'goto', phase: ph }
  if (/^(reject|tu choi|khong duyet)/.test(n)) return { type: 'reject' }
  if (/^(approve|duyet|dong y|ok duyet)/.test(n)) return { type: 'approve' }
  if ((m = n.match(/(?:profile|ho so|tra cuu|look up)\s*(.*)$/))) { const b = brandIn(n, m[1]); if (b) return { type: 'profile', ...b } }
  if ((m = n.match(/(?:replay|phat lai|chieu lai|cham lai|re-?score)\s*(.*)$/))) return { type: 'replay', ...(brandIn(n, m[1]) ?? {}) }
  if ((m = n.match(/(?:audit|kiem tra|chay|run|do|quet)\s+(.*)$/))) { const b = brandIn(n, m[1]); if (b) return { type: 'audit', ...b, fresh: /\b(moi|fresh|from scratch|that|real)\b/.test(n) } }
  if (/(explain|giai thich|dang lam gi|what.*(happening|going on)|status|tinh hinh|man hinh)/.test(n)) return { type: 'explain' }
  if (/(doi thu|competitor|rival|opponent)/.test(n)) return { type: 'rivals' }
  if (/(diem|score|bao nhieu lan|how many times|visibility)/.test(n)) return { type: 'score' }
  return null
}

/** what the operator is looking at, as compact facts for the LLM and for local answers */
export function snap() {
  const L = lget(), s = L.summary
  return {
    mode: L.mode, status: L.status, phase: phaseOf(clock.t), brand: L.brand || 'xT Store (scripted demo)', category: L.category, website: L.website,
    score: s ? `${s.mentioned}/${s.total}` : null, answered: s?.answered ?? null, top3: s?.top3 ?? null, avgRank: s?.avgRank ?? null,
    rivals: s?.competitors?.slice(0, 5) ?? [], sources: s?.sources?.slice(0, 5) ?? [], missed: L.analysis?.missed?.length ?? null,
    siteScore: L.site?.score ?? null, facts: L.facts?.facts?.length ?? null, faqs: L.content?.faqs?.length ?? null,
    riskFlags: L.risk?.flags?.length ?? null, pii: L.risk?.pii?.length ?? null, approval: L.approval?.status ?? null, published: L.publish?.localUrl ?? null,
  }
}
const NAME: Record<Phase, string> = { intake: 'Shop', mining: 'Signals', research: 'Research', analysis: 'Analysis', content: 'Content', citations: 'Citations', sync: 'Channel Sync', qa: 'QA', risk: 'Risk Gate', approve: 'Approve', publish: 'Publish', track: 'Track', impact: 'Impact' }

function explain(vi: boolean) {
  const s = snap(), d = NAME[s.phase]
  if (s.mode === 'script') return vi ? `Đây là vòng demo theo kịch bản, đang ở bước ${d}. Gõ "audit Elmich" để chạy bằng dữ liệu thật.` : `This is the scripted demo loop, now at ${d}. Type "audit Elmich" to run on real data.`
  const bits = [
    s.score && (vi ? `Gemini nhắc ${s.brand} ${s.score} câu` : `Gemini named ${s.brand} in ${s.score} answers`),
    s.rivals[0] && (vi ? `đối thủ dẫn đầu là ${s.rivals[0].name} (${s.rivals[0].count})` : `the leading rival is ${s.rivals[0].name} (${s.rivals[0].count})`),
    s.missed != null && (vi ? `${s.missed} câu chưa nhắc thương hiệu` : `${s.missed} questions skip the brand`),
    s.facts != null && (vi ? `${s.facts} dữ kiện có nguồn từ website` : `${s.facts} sourced facts from the website`),
    s.faqs != null && (vi ? `đã soạn ${s.faqs} FAQ` : `${s.faqs} FAQs drafted`),
    s.approval && (vi ? `duyệt: ${s.approval}` : `approval: ${s.approval}`),
  ].filter(Boolean)
  return (vi ? `Đang ở bước ${d} (${s.mode === 'replay' ? 'phát lại bản ghi thật' : 'chạy thật'}). ` : `Now at ${d} (${s.mode === 'replay' ? 'replay of a real run' : 'live run'}). `) + bits.join(vi ? '; ' : '; ') + '.'
}

/** runs one action for real; resolves with the line to show (and an optional card) */
async function exec(a: Act, vi: boolean, id: number): Promise<{ text: string; card?: any }> {
  const T = (v: string, e: string) => (vi ? v : e)
  switch (a.type) {
    case 'goto': if (!a.phase) break; jump(a.phase); return { text: T(`Đã chuyển tới phòng ${NAME[a.phase]}.`, `Moved to ${NAME[a.phase]}.`) }
    case 'overview': nav.overview(); return { text: T('Đây là toàn cảnh công ty.', 'Here is the whole company.') }
    case 'stop': stopLive(); return { text: T('Đã quay về vòng demo.', 'Back to the demo loop.') }
    case 'browse': {
      if (!a.url) break
      step(id, T('Mở trang trong trình duyệt của agent', 'Opening the page in the agent browser'))
      const tab = await openPage(a.url)
      if (!a.review) return { text: T(`Đã mở ${a.url}. Bạn xem trực tiếp ở bảng Browser.`, `Opened ${a.url}. Watch it live in the Browser panel.`) }
      step(id, T('Đọc trang và chấm theo tiêu chí AI đọc được', 'Reading the page and scoring how readable it is for AI'))
      const r = await reviewTab(tab); useBrowser.setState({ review: r })
      return { text: `${a.url}: ${r.summary}` }
    }
    case 'apps': {
      step(id, T('Dùng các ứng dụng đã kết nối (từng công cụ một)', 'Using the connected apps, one tool at a time'))
      const r = await post('/api/one/agent', { text: a.q || '' }, 170000)
      return { text: r.answer, card: r.steps?.length ? { kind: 'steps', steps: r.steps } : undefined }
    }
    case 'explain': return { text: explain(vi) }
    case 'help': return { text: T('Lệnh: audit <thương hiệu> · replay <thương hiệu> · hỏi: <câu hỏi cho Gemini> · hồ sơ <thương hiệu> · đến phòng <tên> · duyệt / từ chối · mở shop · giải thích · toàn cảnh · dừng. Câu hỏi tự do cũng được.', 'Commands: audit <brand> · replay <brand> · ask: <question for Gemini> · profile <brand> · go to <department> · approve / reject · open shop · explain · overview · stop. Free-form questions work too.') }
    case 'rivals': { const r = snap().rivals; return { text: r.length ? T(`Được Gemini nhắc nhiều nhất: ${r.map((x) => `${x.name} (${x.count})`).join(', ')}.`, `Named most by Gemini: ${r.map((x) => `${x.name} (${x.count})`).join(', ')}.`) : T('Chưa có dữ liệu thật trên màn hình. Gõ "replay Elmich" hoặc "audit Elmich".', 'No real data on screen yet. Type "replay Elmich" or "audit Elmich".') } }
    case 'score': { const s = snap(); return { text: s.score ? T(`${s.brand}: được nhắc ${s.score} câu, ${s.top3} lần trong top 3${s.avgRank ? `, hạng trung bình ${s.avgRank}` : ''}.`, `${s.brand}: named in ${s.score} answers, ${s.top3} times in the top 3${s.avgRank ? `, average rank ${s.avgRank}` : ''}.`) : T('Chưa có điểm thật. Gõ "replay Elmich" hoặc "audit Elmich".', 'No real score yet. Type "replay Elmich" or "audit Elmich".') } }
    case 'shop': { const u = lget().publish?.localUrl || '/shops/elmich/index.html'; window.open(u, '_blank'); return { text: T(`Đã mở trang shop: ${u}`, `Opened the shop page: ${u}`) } }
    case 'approve': case 'reject': {
      const ap = lget().approval
      if (!ap || ap.status !== 'pending' || lget().mode !== 'live') return { text: T('Hiện không có yêu cầu duyệt nào đang chờ.', 'No approval is waiting right now.') }
      await post(`/api/approve/${ap.id}`, { decisions: Object.fromEntries(ap.docs.map((d: any) => [d.key, a.type])) })
      return { text: a.type === 'approve' ? T(`Đã duyệt ${ap.docs.length} tài liệu. Đang đăng.`, `Approved ${ap.docs.length} documents. Publishing.`) : T('Đã từ chối. Không có gì được đăng.', 'Rejected. Nothing is published.') }
    }
    case 'replay': case 'audit': {
      const runs = await savedRuns(), brand = a.brand || lget().brand || 'Elmich'
      const full = runs.find((r) => r.total >= 40) ?? runs[0]
      if (a.type === 'audit' && (await serverUp())) {
        step(id, a.fresh ? T('Mở 5 tab Gemini ẩn danh', 'Opening 5 anonymous Gemini tabs') : T('Dùng lại câu trả lời Gemini đã lưu, chạy thật các bước sau', 'Reusing saved Gemini answers, running the rest for real'))
        const ok = await startLive({ brand, website: a.website || undefined, mode: a.fresh ? 'fresh' : 'quick', replace: true })
        if (!ok) return { text: lget().err === OFFLINE_MSG ? `${OFFLINE_MSG}.` : T(`Không chạy được: ${lget().err}`, `Could not start: ${lget().err}`) }
        return { text: a.fresh ? T(`Đang audit ${brand}: 40 câu hỏi thật trên Gemini, khoảng 3 phút.`, `Auditing ${brand}: 40 real questions on Gemini, about 3 minutes.`) : T(`Đang audit ${brand} trên 40 câu trả lời Gemini đã lưu; phân tích, nội dung, kiểm rủi ro và duyệt chạy thật.`, `Auditing ${brand} on 40 saved Gemini answers; analysis, content, risk and approval run for real.`) }
      }
      if (!full) return { text: T('Chưa có bản ghi nào để phát lại.', 'There is no saved run to replay.') }
      await replayRun(full.id, 8, brand)
      return { text: T(`Đang phát lại bản ghi thật (40 câu trả lời Gemini), chấm cho ${brand}.`, `Replaying the real run (40 Gemini answers), scored for ${brand}.`) }
    }
    case 'profile': {
      const runs = await savedRuns(), full = runs.find((r) => r.total >= 40) ?? runs[0]
      if (!full || !a.brand) return { text: T('Chưa có bản ghi để tra.', 'No saved run to look up.') }
      step(id, T('Chấm lại 40 câu trả lời đã lưu', 'Re-scoring 40 saved answers'))
      const run = await loadRun(full.id), res: any[] = []
      let sample = ''
      for (const ev of run.events) if (ev.type === 'q.done') { const p = parseAnswer({ text: ev.text, heads: [], cells: [], chips: ev.domains }, a.brand); res[ev.qi] = { ...ev, ...p }; if (p.mentioned && !sample) sample = ev.q }
      const s = summarize(res, a.brand, res.length)
      return { text: T(`Hồ sơ ${a.brand} trên Gemini (${full.total} câu hỏi "${run.category}").`, `${a.brand} on Gemini (${full.total} "${run.category}" questions).`), card: { kind: 'profile', s, sample } }
    }
    case 'ask': {
      if (!a.q) break
      step(id, T('Mở một tab Gemini ẩn danh', 'Opening an anonymous Gemini tab'))
      const r = await post('/api/one/ask', { q: a.q, brand: lget().brand || 'Elmich' }, 95000)
      return { text: r.mentioned ? T(`Gemini có nhắc ${r.brand}${r.rank ? ` ở vị trí ${r.rank}` : ''}.`, `Gemini named ${r.brand}${r.rank ? ` at #${r.rank}` : ''}.`) : T(`Gemini không nhắc ${r.brand}.`, `Gemini did not name ${r.brand}.`), card: { kind: 'answer', ...r } }
    }
  }
  return { text: '' }
}

const outputFor = (a: Act | null) => (!a ? 'A short answer (at most 3 sentences) and any actions to run.' : ['rivals', 'score', 'explain', 'help'].includes(a.type) ? 'A short factual answer built from the on-screen data.' : `Run the "${a.type}" action and confirm in one sentence.`)
const TASK: Record<string, (a: Act) => string> = {
  goto: (a) => `Move the camera to the ${a.phase} department.`, overview: () => 'Show the whole company.', stop: () => 'Leave the live run and go back to the demo loop.',
  explain: () => 'Explain what is on screen, using the on-screen numbers.', help: () => 'List the available commands.', rivals: () => 'List the competitors Gemini names most often.',
  score: () => 'Report how often Gemini names the brand.', shop: () => 'Open the published shop page.', approve: () => 'Approve every document waiting for the owner.',
  reject: () => 'Reject every document waiting for the owner.', replay: (a) => `Replay the recorded real run, scored for ${a.brand || 'the current brand'}.`,
  audit: (a) => `Run an audit for ${a.brand}${a.fresh ? ' with 40 fresh Gemini questions' : ''}.`, profile: (a) => `Build the Gemini visibility profile of ${a.brand}.`, ask: (a) => `Ask Gemini, in a fresh tab: "${a.q}"`,
}
const quickPrompt = (task: string, a: Act | null): Msg['pr'] => {
  const s = snap()
  if (a && TASK[a.type]) task = TASK[a.type](a)
  return {
    by: 'rules', role: 'NaN, the operator console of Picked (a company of AI agents for GEO).',
    context: `Brand: ${s.brand}. Mode: ${s.mode}. Step: ${NAME[s.phase]}.${s.score ? ` Score: ${s.score}.` : ''}`,
    task, constraints: ['Use only data that is on screen.', 'Reply in the operator\'s language.', 'Run a real action only when it is asked for.'], output: outputFor(a),
  }
}
async function translate(text: string): Promise<Tr & { needsRestore?: boolean }> {
  try { const j = await post('/api/translate', { text }, 6000); return { src: j.source, en: j.text, ms: j.ms, provider: j.provider, needsRestore: j.needsRestore } } catch { /* no local server: ask Google from the browser */ }
  const t0 = performance.now()
  const d = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(5000) }).then((r) => r.json())
  return { src: d[2], en: d[2] === 'en' ? text : d[0].map((x: any) => x[0]).join(''), ms: Math.round(performance.now() - t0), provider: 'google' }
}

export async function submit(raw: string) {
  const text = raw.trim()
  if (!text) return
  const n = plain(text)
  const vi = /[^\x00-\x7f]/.test(text) || /\b(toi|tui|khong|kiem tra|chay|mo|xem|phong|duyet|doi thu|hoi|giup|cho|nao|di|nhe|thuong hieu|ho so)\b/.test(n)
  let act = intent(text)
  const me = push({ who: 'me', text, pr: quickPrompt(text, act) })
  const bot = push({ who: 'one', text: '', busy: true, steps: [{ t: act ? `Command matched: ${act.type}` : 'Reading the request', done: false }] })
  // translation runs beside the action, never in front of it
  const tr = translate(text).then((t) => { patch(me, (m) => ({ tr: t, pr: m.pr && m.pr.by === 'rules' && !act ? { ...m.pr, task: t.en } : m.pr })); if (t.needsRestore) post('/api/translate/refine', { text }, 30000).then((j) => { if (j.refined) patch(me, (m) => ({ tr: { src: j.source, en: j.text, ms: j.ms, provider: 'google + accents', refined: true }, pr: m.pr && m.pr.by === 'rules' && !act ? { ...m.pr, task: j.text } : m.pr })) }).catch(() => {}); return t }).catch(() => null)
  try {
    if (!act) { const t = await tr; if (t && t.src !== 'en') act = intent(t.en); if (act) patch(me, { pr: quickPrompt(t!.en, act) }) }
    if (act) {
      const r = await exec(act, vi, bot)
      finish(bot, r.text, r.card)
      tr.then((t) => post('/api/one/prompt', { text: t?.en || text, state: snap() })).then((j) => patch(me, { pr: { ...j.prompt, by: 'llm' } })).catch(() => {})
      return
    }
    const t = await tr
    step(bot, 'Thinking with the system LLM')
    const j = await post('/api/one/chat', { text: t?.en || text, original: text, state: snap() })
    patch(me, { pr: { ...j.prompt, by: 'llm' } })
    const outs: string[] = [], cards: any[] = []
    for (const a of (j.actions ?? []).filter((x: Act) => x.type && x.type !== 'none').slice(0, 3)) { step(bot, `Action: ${a.type}`); const r = await exec(a, vi, bot).catch((e) => ({ text: String(e.message || e), card: undefined })); if (r.card) cards.push(r.card); else if (['audit', 'replay', 'approve', 'reject', 'ask'].includes(a.type) && r.text) outs.push(r.text) }
    finish(bot, [j.reply, ...outs].filter(Boolean).join(' '), cards[0])
  } catch (e: any) {
    const off = /Failed to fetch|unavailable|offline|HTTP 50|HTTP 404/.test(String(e.message))
    finish(bot, off ? `${OFFLINE_MSG}. ${vi ? 'Các lệnh như "replay Elmich", "hồ sơ Sunhouse", "đến phòng phân tích" vẫn chạy được.' : 'Commands such as "replay Elmich", "profile Sunhouse" or "go to analysis" still work.'}` : `${vi ? 'Lỗi' : 'Error'}: ${e.message || e}`)
  }
}

/* ───────────── chat window ───────────── */
function PromptCard({ m }: { m: Msg }) {
  const [open, setOpen] = useState(true)
  const p = m.pr!
  const rows: [string, string][] = [['Role', p.role], ['Context', p.context], ['Task', p.task], ['Constraints', p.constraints.join(' · ')], ['Output', p.output]]
  return (
    <div className="mt-1.5 w-full overflow-hidden rounded-xl border border-indigo-100 bg-indigo-50/50 text-left">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[.1em] text-indigo-500">
        <Sparkles size={11} />Structured prompt
        {m.tr ? <span className="rounded-full bg-white px-1.5 py-px font-semibold normal-case tracking-normal text-slate-500">{m.tr.src.toUpperCase()} → EN · {m.tr.provider} · {m.tr.ms} ms</span> : <span className="spinner" />}
        <span className={`ml-auto rounded-full px-1.5 py-px normal-case tracking-normal ${p.by === 'llm' ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-400'}`}>{p.by === 'llm' ? 'refined by LLM' : 'instant'}</span>
      </button>
      {open && (
        <div className="space-y-1 border-t border-indigo-100 px-2.5 py-2">
          {rows.map(([k, v]) => (
            <motion.div key={k + (p.by === 'llm' ? 1 : 0)} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} className="grid grid-cols-[72px_1fr] gap-2 text-[11.5px] leading-snug">
              <span className="font-semibold text-indigo-600">{k}</span><span className="text-slate-700">{v}</span>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
function Card({ c }: { c: any }) {
  if (c.kind === 'profile') {
    const s = c.s, rate = Math.round((s.mentioned / (s.answered || 1)) * 100)
    return (
      <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-end gap-2"><span className="text-[26px] font-semibold leading-none tracking-tight" style={{ color: rate >= 25 ? '#16a34a' : '#e11d48' }}>{s.mentioned}<span className="text-slate-300">/{s.total}</span></span><span className="pb-0.5 text-[11.5px] text-slate-500">answers name {s.brand} · {rate}%</span></div>
        <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[11px] text-slate-500">{[['Top 3', s.top3], ['First', s.first], ['Avg rank', s.avgRank ?? '–']].map(([k, v]) => <div key={k as string} className="rounded-lg bg-slate-50 py-1.5"><div className="text-[15px] font-semibold text-slate-800">{v as any}</div>{k}</div>)}</div>
        <div className="mt-2 space-y-1">{s.competitors.slice(0, 4).map((r: any) => <div key={r.name} className="flex items-center gap-2 text-[11.5px]"><span className="w-20 truncate text-slate-600">{r.name}</span><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"><motion.div initial={{ width: 0 }} animate={{ width: `${(r.count / s.total) * 100}%` }} transition={{ duration: 0.7 }} className="h-full rounded-full bg-indigo-500" /></div><span className="tnum w-5 text-right text-slate-500">{r.count}</span></div>)}</div>
        {c.sample && <div className="mt-2 text-[11px] text-slate-400">Named for: “{c.sample}”</div>}
        <div className="mt-2 text-[9.5px] font-semibold uppercase tracking-[.12em] text-emerald-600">Real · recorded Gemini answers</div>
      </div>
    )
  }
  if (c.kind === 'steps') return (
    <div className="mt-2 space-y-1.5">{c.steps.map((s: any, i: number) => <div key={i} className="rounded-xl border border-slate-200 bg-white px-3 py-2"><div className="flex items-center gap-1.5 text-[11.5px]"><span className={`h-1.5 w-1.5 rounded-full ${s.isError ? 'bg-rose-500' : 'bg-emerald-500'}`} /><b className="font-mono text-slate-700">{s.server}.{s.tool}</b><span className="ml-auto text-slate-400">{s.ms} ms</span></div><div className="mt-1 max-h-16 overflow-hidden text-[11px] leading-snug text-slate-500">{String(s.text).slice(0, 240)}</div></div>)}<div className="text-[9.5px] font-semibold uppercase tracking-[.12em] text-emerald-600">Real · MCP tool calls</div></div>
  )
  if (c.kind === 'answer') return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-[11.5px] font-medium text-slate-700">“{c.q}”</div>
      <div className="mt-1.5 flex flex-wrap gap-1">{c.brands.slice(0, 6).map((b: string, i: number) => <span key={b} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${b === c.brand ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{i + 1}. {b}</span>)}</div>
      <div className="mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap text-[11px] leading-snug text-slate-500">{c.text.slice(0, 900)}</div>
      <div className="mt-2 text-[9.5px] font-semibold uppercase tracking-[.12em] text-emerald-600">Real · gemini.google.com · {(c.ms / 1000).toFixed(1)} s</div>
    </div>
  )
  return null
}
const HINTS = ['audit Elmich', 'hồ sơ Sunhouse', 'đối thủ nào được AI gợi ý nhiều nhất?', 'đến phòng rủi ro', 'giải thích màn hình']

export default function SystemOne() {
  const { open, msgs } = useOne()
  const [v, setV] = useState('')
  const input = useRef<HTMLInputElement>(null), end = useRef<HTMLDivElement>(null)
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 60) }, [open])
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [msgs])
  const send = (t = v) => { setV(''); submit(t) }
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 24, scale: 0.97 }} transition={{ type: 'spring', stiffness: 340, damping: 30 }} className="absolute bottom-[68px] right-5 z-40 flex h-[min(640px,calc(100%-90px))] w-[430px] flex-col overflow-hidden rounded-[22px] border border-slate-200 bg-white/95 shadow-[0_40px_100px_-30px_rgba(15,23,42,.5)] backdrop-blur-xl">
          <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3">
            <Face av="a21" size={44} />
            <div><div className="text-[18px] font-semibold leading-none tracking-tight">NaN</div><div className="flex items-center gap-1.5 text-[11px] text-slate-500"><span className="live-dot" />Operator console · runs real actions</div></div>
            <button onClick={() => { (document.activeElement as HTMLElement)?.blur(); useOne.setState({ open: false }) }} className="ml-auto grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-slate-100"><X size={16} /></button>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {!msgs.length && (
              <div className="pt-6 text-center">
                <div className="text-[13px] text-slate-500">Type in any language. Commands run instantly;<br />anything else is answered by the system LLM.</div>
                <div className="mt-4 flex flex-wrap justify-center gap-1.5">{HINTS.map((h) => <button key={h} onClick={() => send(h)} className="rounded-full bg-slate-100 px-3 py-1 text-[12px] text-slate-600 hover:bg-indigo-50 hover:text-indigo-700">{h}</button>)}</div>
              </div>
            )}
            {msgs.map((m) => m.who === 'me' ? (
              <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-end">
                <div className="max-w-[88%] rounded-2xl rounded-br-md bg-slate-900 px-3.5 py-2 text-[13px] text-white">{m.text}</div>
                {m.tr && m.tr.src !== 'en' && <div className="mt-1 max-w-[92%] text-right text-[11.5px] italic text-slate-500">{m.tr.en}{m.tr.refined && <span className="ml-1 not-italic text-emerald-600">✓ accents restored</span>}</div>}
                {m.pr && <PromptCard m={m} />}
              </motion.div>
            ) : (
              <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="max-w-[94%]">
                {m.steps && <div className="mb-1 space-y-0.5">{m.steps.map((s, i) => <div key={i} className="flex items-center gap-1.5 text-[11px] text-slate-400">{s.done ? <Check size={11} strokeWidth={3} className="text-emerald-500" /> : <span className="spinner" />}{s.t}</div>)}</div>}
                {m.text && <div className="rounded-2xl rounded-bl-md bg-slate-100 px-3.5 py-2 text-[13px] leading-snug text-slate-800">{m.text}</div>}
                {m.card && <Card c={m.card} />}
              </motion.div>
            ))}
            <div ref={end} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); send() }} className="flex items-center gap-2 border-t border-slate-100 p-3">
            <input ref={input} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { e.currentTarget.blur(); useOne.setState({ open: false }) } }} placeholder="Ask or command, in any language…" className="h-10 min-w-0 flex-1 rounded-full border border-slate-200 px-4 text-[13.5px] outline-none focus:border-indigo-400" />
            <button className="grid h-10 w-10 place-items-center rounded-full bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40" disabled={!v.trim()}><ArrowUp size={18} strokeWidth={2.6} /></button>
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ───────────── global keys ───────────── */
export function useKeys() {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || e.metaKey || e.ctrlKey || e.altKey) return
      const o = useOne.getState(), k = e.key.toLowerCase()
      if (e.key === '/') { e.preventDefault(); useOne.setState({ open: true }) }
      else if (e.key === 'Escape') { useOne.setState({ open: false, info: false }); useStory.setState({ open: false }) }
      else if (k === 't') useOne.setState({ team: !o.team })
      else if (k === 'w') useWork.setState((x) => ({ open: !x.open }))
      else if (k === 'a') useApps.setState((x) => ({ open: !x.open }))
      else if (k === 'c') useOffice.setState((x) => ({ open: !x.open }))
      else if (k === 'v') useStory.setState((x) => ({ open: !x.open, slide: 0 }))
      else if (k === 'b') useBrowser.setState((x) => ({ open: !x.open, control: false }))
      else if (k === 'p') useOne.setState({ presenter: !o.presenter })
      else if (k === 'i' || e.key === '?') useOne.setState({ info: !o.info })
      else if (k === 'o') nav.overview()
      else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && useStory.getState().open) useStory.setState((x) => ({ slide: (x.slide + (e.key === 'ArrowRight' ? 1 : -1) + SLIDES) % SLIDES }))
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const order = lget().mode === 'script' ? ORDER : LIVE_ORDER, i = order.indexOf(phaseOf(clock.t)), d = e.key === 'ArrowRight' ? 1 : -1
        jump(order[(i + d + order.length) % order.length])
      }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])
}
