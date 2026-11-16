// NaN: the operator chat. Translation, prompt structuring, free-form intent and a single real Gemini question.
import { agentLlm } from './agents.mjs'
import { launch, ask } from './gemini.mjs'
import { parseAnswer } from './parse.mjs'
import { handleTranslateRequest, makeAgyRestorer } from './translate.mjs'

const PHASES = ['mining', 'research', 'analysis', 'sync', 'content', 'citations', 'qa', 'risk', 'approve', 'publish', 'track', 'impact']
const ACTIONS = ['audit', 'replay', 'ask', 'browse', 'apps', 'goto', 'approve', 'reject', 'shop', 'profile', 'explain', 'stop', 'overview', 'none']
const PROMPT = {
  type: 'object',
  properties: { role: { type: 'string' }, context: { type: 'string' }, task: { type: 'string' }, constraints: { type: 'array', items: { type: 'string' } }, output: { type: 'string' } },
  required: ['role', 'context', 'task', 'constraints', 'output'],
}
const CHAT = {
  type: 'object',
  properties: {
    prompt: PROMPT,
    reply: { type: 'string' },
    actions: { type: 'array', items: { type: 'object', properties: { type: { type: 'string', enum: ACTIONS }, brand: { type: 'string' }, website: { type: 'string' }, q: { type: 'string' }, url: { type: 'string' }, review: { type: 'boolean' }, phase: { type: 'string', enum: PHASES } }, required: ['type'] } },
  },
  required: ['prompt', 'reply', 'actions'],
}
const ABOUT = `Picked is a company of AI agents that measures and improves how AI assistants (Gemini) recommend a small brand.
Departments: mining (buyer questions), research (asks Gemini 40 buyer questions in parallel tabs), analysis (why the brand is skipped, rivals, cited sources),
sync (website audit + sourced facts), content (FAQ, about page, outreach pitch), citations, qa (each sentence checked against facts), risk (claims + personal data gate),
approve (the owner approves from a phone), publish (shop page, llms.txt, JSON-LD), track, impact.`
const STRUCT = `Rewrite the operator's request as a structured prompt with five parts: role (who the assistant acts as), context (what is known, from the screen state),
task (one precise instruction), constraints (2-4 short rules), output (the expected shape of the answer). English only. Do not invent numbers that are not in the state.`

const read = (req) => new Promise((resolve) => { let b = ''; req.on('data', (c) => { if (b.length < 20000) b += c }); req.on('end', () => { try { resolve(JSON.parse(b || '{}')) } catch { resolve({}) } }) })
const send = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)) }
const clip = (v, n) => String(v ?? '').slice(0, n)
const lia = agentLlm('lia'), nan = agentLlm('nan')
const restore = makeAgyRestorer(lia)
let asking = false

/** Handles /api/translate*, /api/one/prompt, /api/one/chat, /api/one/ask. Resolves false for any other route. */
export async function handleSystemOne(req, res, ctx = {}) {
  const route = req.url?.split('?')[0]
  if (route === '/api/translate' || route === '/api/translate/refine') return handleTranslateRequest(req, res, { restore })
  // read the body only for routes this module owns; another handler may need the stream
  if (req.method !== 'POST' || !['/api/one/prompt', '/api/one/chat', '/api/one/ask'].includes(route)) return false
  const b = await read(req), t0 = Date.now()
  const state = clip(JSON.stringify({ ...(b.state ?? {}), connectedApps: ctx.apps?.() ?? [] }), 2500)
  try {
    if (route === '/api/one/prompt') {
      const text = clip(b.text, 1500)
      if (!text.trim()) return send(res, 400, { error: 'empty' }), true
      const prompt = await nan.agyJson({ schema: PROMPT, timeoutMs: 60000, prompt: `${ABOUT}\n\n${STRUCT}\n\nScreen state (JSON): ${state}\n\nOperator request: ${text}` })
      return send(res, 200, { prompt, ms: Date.now() - t0 }), true
    }
    if (route === '/api/one/chat') {
      const text = clip(b.text, 1500)
      if (!text.trim()) return send(res, 400, { error: 'empty' }), true
      const out = await nan.agyJson({
        schema: CHAT, timeoutMs: 60000,
        prompt: `You are NaN, the operator console of Picked.\n${ABOUT}\n\nScreen state (JSON): ${state}\n\nOperator request (English): ${text}\nOriginal wording: ${clip(b.original, 600)}\n
Return three things.
1. prompt: ${STRUCT}
2. reply: answer the operator in the language of the original wording, at most 3 short sentences, using only numbers found in the state. If the state lacks the data, say so and name the action that would get it.
3. actions: zero or more of: audit {brand, website} (run a live audit), replay {brand} (replay the saved real run, re-scored for that brand), ask {q} (ask Gemini one real question, q in Vietnamese), apps {q} (use the connected apps listed in connectedApps to do q), browse {url, review} (open a web page in the agent browser; review=true also scores how readable it is for AI assistants),
goto {phase} (move the camera to a department), approve, reject (decide the pending owner approval), shop (open the published shop page), profile {brand} (brand profile card),
explain (describe what is on screen), stop (back to the demo loop), overview (whole company). Use an empty list when the request is only a question.`,
      })
      return send(res, 200, { ...out, ms: Date.now() - t0 }), true
    }
    if (route === '/api/one/ask') {
      const q = clip(b.q, 400).trim(), brand = clip(b.brand, 80) || 'Elmich'
      if (!q) return send(res, 400, { error: 'empty' }), true
      if (asking) return send(res, 409, { error: 'a question is already running' }), true
      asking = true
      const { ctx, close } = await launch({ headed: false })
      try {
        const raw = await ask(ctx, q, { timeoutMs: 70000 })
        const p = parseAnswer(raw, brand)
        return send(res, 200, { q, brand, text: raw.text, brands: p.brands, mentioned: p.mentioned, rank: p.rank, domains: p.domains, ms: raw.ms }), true
      } finally { asking = false; await close().catch(() => {}) }
    }
  } catch (e) { return send(res, 502, { error: String(e.message || e) }), true }
  return false
}
