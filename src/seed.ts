import { toEnglish } from '../server/questions.mjs'

/* Seed data for the 2-minute reel. Everything that would take minutes is replayed from runs saved earlier on the server:
   the X-rays, the audit and the Gemini answer are real recordings; only the new agent’s prompt and its first reply are written samples.
   While `seed.on`, three slow calls are answered from here; every other call (Copilot, the browser, the cost card) is the real one. */
export const seed: { on: boolean; analyses: Record<string, string>; ask: any | null } = { on: false, analyses: {}, ask: null }

const BOT = { name: 'Kim', role: 'Keyword researcher', greeting: 'Hi, I’m Kim. I find the words buyers type into Google and Gemini.', starters: ['Find keywords for clay pots', 'What do buyers ask about lunch boxes?', 'Which phrases are rising?'],
  soul: 'You are Kim, a keyword researcher for Vietnamese kitchenware. You find what buyers type into Google and Gemini and group it by intent. You answer in short sections, never invent search volumes, and when a request needs data you hand over to Scout or Ana by name.' }
const REPLY = 'Here are five clay-pot searches buyers use:\n\n1. **clay pot for braised fish**: cooking intent, strong in autumn\n2. **clay pot rice cooker**: everyday use\n3. **where to buy a clay pot**: ready to buy\n4. **clay pot for induction hobs**: a safety question\n5. **Bat Trang clay pot**: brand and origin\n\nI have no volume data yet, so I will not rank them. Scout can ask Gemini which one it answers best.'
const REPLY_LUNCH = 'Buyers type: **thermal lunch box for kids**, **leak-proof lunch box**, **304 stainless lunch box**, **lunch box that keeps rice hot**. No volume data yet, so not ranked.'
// the saved Gemini answer is in Vietnamese (the buyers' language); the reel shows it in English, marked as a translation
const ANSWER_EN = `When choosing an insulated lunch box for a school child, what matters most is safe material (304 stainless steel, BPA-free virgin PP plastic), a leak-proof seal so it can travel in a backpack, and a light weight and size that suit the child.

**1. By design and use**

**Multi-tier lunch boxes** (with a handle or an insulated bag): two or three separate tiers for rice, mains and soup, with a 304 stainless steel core. Typical brands: LocknLock, Zojirushi, Thermos.

**Food jars** (round insulated jars): vacuum walls keep food warm for 4 to 8 hours, ideal for porridge, soup or mixed rice. Typical brands: Thermos, Zojirushi, Tiger, Elmich.

**2. Trusted brands for children**

**Thermos (USA / Japan):** world-famous vacuum insulation; very durable and safe.

**Zojirushi (Japan):** a very high finish, with a neat bag and microwave-safe inner boxes.

**LocknLock (Korea):** well known in Vietnam, fairly priced, with secure clips that stop spills.

**Elmich (Czech Republic):** European-standard housewares; a full 304 stainless steel inner for hot, sour or salty food.`

let installed = false
const json = (v: any, ms = 700) => new Promise<Response>((res) => setTimeout(() => res(new Response(JSON.stringify(v), { status: 200, headers: { 'content-type': 'application/json' } })), ms))
export function installSeed() {
  if (installed) return; installed = true
  const real = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url, path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0]
    if (seed.on && (init?.method ?? 'GET').toUpperCase() === 'POST') {
      if (path === '/api/bots/draft') return json({ bot: BOT }, 900)
      if (path === '/api/one/chat') { try { const b = JSON.parse(String(init?.body ?? '{}')); if (b.persona) return json({ reply: /lunch/i.test(b.text) ? REPLY_LUNCH : REPLY, actions: [] }, 800) } catch { /* not ours */ } }
      if (path === '/api/one/ask' && seed.ask) return json(seed.ask, 1200)
    }
    return real(input, init)
  }
}

/** Reads the saved runs once: which analysis to replay for a site, and one real Gemini answer. */
export async function loadSeed() {
  installSeed()
  try { const idx = await fetch('/analyses/index.json').then((r) => r.json()); for (const a of idx) { try { const h = new URL(a.url).hostname.replace(/^www\./, ''); if (!seed.analyses[h]) seed.analyses[h] = a.id } catch { /* skip */ } } } catch { /* none */ }
  try {
    const list = await fetch('/runs/index.json').then((r) => r.json())
    const run = await fetch(`/runs/${list[0].id}.json`).then((r) => r.json()), e = run.events.find((x: any) => x.type === 'q.done' && x.mentioned && x.text)
    if (e) seed.ask = { q: toEnglish(e.q), brand: run.brand || 'Elmich', text: ANSWER_EN, translated: true, brands: e.brands, mentioned: true, rank: e.rank, domains: e.domains, ms: e.ms }
  } catch { /* no saved run: the real call is used */ }
}
export const analysisFor = (input: string) => { try { return seed.analyses[new URL(/^https?:/.test(input) ? input : `https://${input}`).hostname.replace(/^www\./, '')] } catch { return undefined } }
