import { create } from 'zustand'

/* ───────────── global clock + UI state ───────────── */
type S = { t: number; sel: string | null; auto: boolean; hold: number }
export const useSim = create<S>(() => ({ t: 0, sel: null, auto: true, hold: 0 }))
/** continuous clock, advanced every frame (the store copy only ticks at 20 Hz) */
export const clock = { t: 0 }

/* ───────────── pipeline timeline (seconds inside one cycle) ───────────── */
export const PH = {
  intake: [0, 4],
  mining: [4, 10],
  research: [10, 25],
  analysis: [25, 32],
  content: [32, 43],
  citations: [43, 51],
  sync: [51, 58],
  qa: [58, 64],
  risk: [64, 70],
  approve: [70, 77],
  publish: [77, 81],
  track: [81, 88],
  impact: [88, 96],
} as const
export type Phase = keyof typeof PH
export const ORDER = Object.keys(PH) as Phase[]
export const CYCLE = 96
export const SCORES = [2, 4, 7, 9, 12, 14]
export const TOTAL_Q = 40

const cl = (x: number) => Math.max(0, Math.min(1, x))
export const cyc = (t: number) => Math.floor(Math.max(0, t) / CYCLE)
export const ct = (t: number) => Math.max(0, t) % CYCLE
export const phaseOf = (t: number): Phase => {
  const c = ct(t)
  return ORDER.find((k) => c >= PH[k][0] && c < PH[k][1]) ?? 'intake'
}
/** progress 0..1 of a phase; keeps last run's result (1) until the phase restarts */
export const prog = (t: number, k: Phase) => {
  const c = ct(t)
  const [s, e] = PH[k]
  if (c >= e) return 1
  if (c >= s) return (c - s) / (e - s)
  return cyc(t) > 0 ? 1 : 0
}
export const week = (t: number) => cyc(t) % 5
/** seconds into the Track step when the new weekly score lands */
export const SCORE_FLIP = 6
export const scoreAt = (t: number) => SCORES[week(t) + (ct(t) >= PH.track[0] + SCORE_FLIP ? 1 : 0)]
export const weekLabel = (t: number) => week(t) + 1 + (ct(t) >= PH.track[0] + SCORE_FLIP ? 1 : 0)

export const usePhase = () => useSim((s) => phaseOf(s.t))
export const useP = (k: Phase, q = 100) => useSim((s) => Math.round(prog(s.t, k) * q) / q)
export const stagger = (p: number, i: number, n: number, overlap = 0.35) => {
  const span = 1 / (n - (n - 1) * overlap)
  return cl((p - i * span * (1 - overlap)) / span)
}

/* ───────────── content ───────────── */
export type Provider = 'gpt' | 'claude' | 'gemini' | 'pplx'
export const PROVS: Provider[] = ['gpt', 'claude', 'gemini', 'pplx']

export const QUESTIONS = [
  'Thermal lunch box under 300k VND?',
  'Where to buy a lunch box in District 7?',
  'Safe lunch box for kids?',
  'Lunch box that keeps rice hot 6 hours?',
  'Best gift for office staff under 300k?',
  'Same-day delivery lunch box HCMC?',
  'Stainless or glass lunch box?',
  'Bulk lunch boxes for a factory?',
  'Leak-proof lunch box for school?',
  'Lunch box with 3 compartments?',
  'Cheap thermal bottle and box set?',
  'Microwave-safe thermal lunch box?',
  'Best lunch box brand in Vietnam 2026?',
  'Lunch box shop near Phu My Hung?',
  'BPA-free lunch box for toddlers?',
  'Corporate gift lunch box with logo?',
]

export const RIVALS = [
  { n: 'HeatBox Saigon', d: 'heatbox.vn', v: 31 },
  { n: 'Bento Corner', d: 'bentocorner.vn', v: 18 },
  { n: 'ComNong Shop', d: 'comnong.vn', v: 15 },
]
const REASONS = [
  '8-hour heat retention, many stores',
  'wide range, long warranty',
  'good prices, fast delivery',
  'popular with office workers',
  'strong reviews on Shopee',
  'kid-safe steel, easy to clean',
]
const INTRO: Record<Provider, string> = {
  gpt: 'Here are a few good options:',
  claude: "Based on what's available locally, I'd look at these:",
  gemini: 'Here are some popular choices in Ho Chi Minh City:',
  pplx: 'Top-rated options based on recent reviews:',
}

export type Answer = { intro: string; items: { name: string; reason: string; me?: boolean }[] }
export const hash = (a: number, b: number) => {
  let x = Math.imul(a, 73856093) ^ Math.imul(b, 19349663)
  x = Math.imul(x ^ (x >>> 13), 1274126177)
  return (x ^ (x >>> 16)) >>> 0
}
export const ansLen = (a: Answer) => a.intro.length + a.items.reduce((n, i) => n + i.name.length + i.reason.length + 3, 0)

/* ───────────── one live AI session (always running) ───────────── */
const P = 8
export function session(t: number, i: number, force = false) {
  t = Math.max(0, t)
  const local = t + ((i * 2.37) % P)
  const qi = Math.floor(local / P)
  const lt = local % P
  const provider = PROVS[i % 4]
  const q = QUESTIONS[(i * 5 + qi * 3) % QUESTIONS.length]
  const h = hash(i + 1, qi + 1)
  const mentioned = force || h % TOTAL_Q < scoreAt(t - lt)
  const items: Answer['items'] = RIVALS.map((r, k) => ({ name: r.n, reason: REASONS[(h + k) % REASONS.length] }))
  const rank = force ? 0 : 1 + ((h >>> 3) % 2)
  if (mentioned) items[rank] = { name: 'xT Store', reason: 'from 189k VND, same-day delivery in District 7', me: true }
  const ans: Answer = { intro: INTRO[provider], items }
  const total = ansLen(ans)
  let stage: 'boot' | 'type' | 'think' | 'answer' | 'done'
  let typed = q.length
  let shown = 0
  if (t < 0.7 + (i % 12) * 0.14) stage = 'boot'
  else if (lt < 1.4) { stage = 'type'; typed = Math.floor((q.length * lt) / 1.4) }
  else if (lt < 2.3) stage = 'think'
  else if (lt < 6) { stage = 'answer'; shown = Math.floor((total * (lt - 2.3)) / 3.7) }
  else { stage = 'done'; shown = total }
  return { i, qi, provider, q, ans, total, stage, typed, shown, mentioned, rank: rank + 1 }
}
export type Session = ReturnType<typeof session>
export const useSession = (i: number, force = false): Session => {
  useSim((s) => { const x = session(s.t, i, force); return `${x.qi}|${x.stage}|${x.typed}|${x.shown}` })
  return session(useSim.getState().t, i, force)
}
export const scoutName = (i: number) => `Scout-${String(i + 1).padStart(2, '0')}`

/* ───────────── content team documents ───────────── */
export const DOCS = [
  {
    key: 'info', title: 'Product info', agent: 'Mira', provider: 'claude' as Provider,
    text: 'xT Store · Thermal Lunch Box 750ml\n\nPrice      from 189,000 VND\nHeat       keeps rice hot 6 hours\nMaterial   304 stainless steel, BPA-free\nDelivery   same-day in District 7\nWarranty   12 months, 1-to-1 exchange',
  },
  {
    key: 'faq', title: 'FAQ page', agent: 'Quinn', provider: 'gpt' as Provider,
    text: 'Q: Is there a good thermal lunch box under 300k in District 7?\nA: Yes. xT Store sells stainless thermal boxes from 189k VND with same-day delivery in District 7.\n\nQ: Is it safe for kids?\nA: Yes. BPA-free 304 steel, leak-proof lid, 3 compartments.',
  },
  {
    key: 'pitch', title: 'Blog pitch', agent: 'Theo', provider: 'claude' as Provider,
    text: 'To: Top 10 Lunch Boxes 2026\n\nHi team, we are xT Store in District 7. Our 750ml thermal box keeps rice hot for 6 hours and costs 189k VND. Could we send you one to test for your next review?',
  },
  {
    key: 'review', title: 'Review request', agent: 'Lumi', provider: 'gemini' as Provider,
    text: 'Zalo · 120 past buyers\n\nHi! Thanks for buying from xT Store. If the lunch box kept your meal hot, could you share an honest review? It takes 30 seconds and helps other buyers find us.',
  },
]

export const DIAG = [
  { key: 'Found', okFrom: 0, text: 'AI can read the shop info', bad: '' },
  { key: 'Mentioned', okFrom: 3, text: 'Cited by review blogs', bad: 'Not in the blogs AI cites' },
  { key: 'Understood', okFrom: 2, text: 'Prices match everywhere', bad: 'Facebook and Shopee prices differ' },
  { key: 'Chosen', okFrom: 9, text: 'Answers buyer questions', bad: 'Nothing answers "under 300k"' },
]
export const CHECKS = [
  { key: 'facts', title: 'Fact check', sub: 'Matches shop data' },
  { key: 'privacy', title: 'Privacy', sub: 'No personal data leaves' },
  { key: 'law', title: 'AI Law', sub: 'Labeled, no fake claims' },
]

/* ───────────── live activity feed ───────────── */
export const URLS: Record<Provider, string> = { gpt: 'chatgpt.com', claude: 'claude.ai', gemini: 'gemini.google.com', pplx: 'perplexity.ai' }
export function feed(t: number) {
  const k = Math.floor(t / 1.6)
  return [0, 1, 2, 3].map((o) => {
    const n = k - o
    const h = hash(n + 11, 7)
    const i = h % 12
    const provider = PROVS[h % 4]
    const kind = (h >>> 4) % 4
    const d = DOCS[(h >>> 6) % 4]
    const text =
      kind === 0 ? `${scoutName(i)} opened ${URLS[provider]}`
      : kind === 1 ? `${scoutName(i)} asked "${QUESTIONS[h % QUESTIONS.length]}"`
      : kind === 2 ? `${d.agent} drafting ${d.title.toLowerCase()}`
      : `QA re-tested a fix on ${URLS[provider]}`
    return { id: n, provider: kind === 2 ? d.provider : provider, text }
  }).filter((e) => e.id >= 0)
}
