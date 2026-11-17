// The engine room: every AI the team owns behind one call, with a ledger of what each call really cost in time and tokens.
// agy (through agyxt) gives Gemini, Claude Opus/Sonnet and GPT-OSS models; Codex gives gpt-6.1-sol and gpt-6-astra through the API profile.
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { llm, parseLoose } from './llm.mjs'

const DATA = process.env.PICKED_DATA_DIR || path.join(import.meta.dirname, 'data')
const LEDGER = path.join(DATA, 'ledger.jsonl')
const API_HOME = path.join(os.homedir(), '.codex_profiles', 'api')

/** tier: fast = classify/route in seconds, write = drafting, deep = judging and planning. */
export const ENGINES = [
  { id: 'flash-low', label: 'Gemini 3.8 Flash · low', driver: 'agy', model: 'gemini-3.8-flash-low', tier: 'fast' },
  { id: 'flash-med', label: 'Gemini 3.8 Flash · medium', driver: 'agy', model: 'gemini-3.8-flash-medium', tier: 'fast' },
  { id: 'flash-high', label: 'Gemini 3.8 Flash · high', driver: 'agy', model: 'gemini-3.8-flash-high', tier: 'write' },
  { id: 'argon-low', label: 'Gemini 4 Argon · low', driver: 'agy', model: 'gemini-4-argon-low', tier: 'write' },
  { id: 'argon-med', label: 'Gemini 4 Argon · medium', driver: 'agy', model: 'gemini-4-argon-medium', tier: 'write' },
  { id: 'argon-high', label: 'Gemini 4 Argon · high', driver: 'agy', model: 'gemini-4-argon-high', tier: 'deep' },
  { id: 'hydrogen-low', label: 'Gemini 4 Hydrogen · low', driver: 'agy', model: 'gemini-4-hydrogen-low', tier: 'write' },
  { id: 'hydrogen-med', label: 'Gemini 4 Hydrogen · medium', driver: 'agy', model: 'gemini-4-hydrogen-medium', tier: 'write' },
  { id: 'hydrogen-high', label: 'Gemini 4 Hydrogen · high', driver: 'agy', model: 'gemini-4-hydrogen-high', tier: 'deep' },
  { id: 'hydrogen-xhigh', label: 'Gemini 4 Hydrogen · xhigh', driver: 'agy', model: 'gemini-4-hydrogen-xhigh', tier: 'deep' },
  { id: 'orchestrator', label: 'Orchestrator (Argon)', driver: 'agy', model: 'gemini-pro-orchestrator-g1-pro', tier: 'deep' },
  { id: 'sonnet-low', label: 'Claude Sonnet 5.5 · low', driver: 'agy', model: 'claude-sonnet-5-5-low', tier: 'write' },
  { id: 'sonnet-med', label: 'Claude Sonnet 5.5 · medium', driver: 'agy', model: 'claude-sonnet-5-5-medium', tier: 'write' },
  { id: 'sonnet-high', label: 'Claude Sonnet 5.5 · high', driver: 'agy', model: 'claude-sonnet-5-5-high', tier: 'deep' },
  { id: 'opus-low', label: 'Claude Opus 5.5 · low', driver: 'agy', model: 'claude-opus-5-5-low', tier: 'deep' },
  { id: 'opus-med', label: 'Claude Opus 5.5 · medium', driver: 'agy', model: 'claude-opus-5-5-medium', tier: 'deep' },
  { id: 'opus-high', label: 'Claude Opus 5.5 · high', driver: 'agy', model: 'claude-opus-5-5-high', tier: 'deep' },
  { id: 'oss', label: 'GPT-OSS 120B · medium', driver: 'agy', model: 'gpt-oss-120b-medium', tier: 'write', structured: false }, // ignores JSON schemas (measured), so free text only
  { id: 'sol', label: 'GPT-6.1 Sol (Codex)', driver: 'codex', model: 'gpt-6.1-sol', effort: 'low', home: API_HOME, tier: 'deep' },
  { id: 'astra', label: 'GPT-6 Astra (Codex)', driver: 'codex', model: 'gpt-6-astra', effort: 'low', home: API_HOME, tier: 'deep' },
]
export const engine = (id) => ENGINES.find((e) => e.id === id) ?? null

/* ───────────── ledger ───────────── */
const stats = new Map() // engine id -> {calls, fails, ms, tokens, last}
const recent = []
function load() {
  try { for (const l of fs.readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean).slice(-2000)) add(JSON.parse(l)) } catch { /* first start */ }
}
function add(r) {
  const s = stats.get(r.engine) ?? { calls: 0, fails: 0, ms: 0, tokens: 0, last: 0 }
  s.calls++; if (!r.ok) s.fails++; else s.ms += r.ms; s.tokens += r.tokens || 0; s.last = r.at
  stats.set(r.engine, s); recent.push(r); if (recent.length > 60) recent.shift()
}
function record(r) { add(r); try { fs.mkdirSync(DATA, { recursive: true }); fs.appendFileSync(LEDGER, JSON.stringify(r) + '\n') } catch { /* the ledger is best effort */ } }
load()
export function ledger() {
  return {
    engines: ENGINES.map((e) => { const s = stats.get(e.id); const ok = s ? s.calls - s.fails : 0; return { ...e, home: undefined, calls: s?.calls ?? 0, fails: s?.fails ?? 0, avgMs: ok ? Math.round(s.ms / ok) : null, tokens: s?.tokens ?? 0, last: s?.last ?? null } }),
    recent: recent.slice(-20).reverse(),
  }
}

/* ───────────── calling ───────────── */
/** Codex profiles to try, in order. PICKED_CODEX_HOMES (separated by |) lists them; a call that fails on one (usage limit, provider down) moves to the next, and the profile that worked is tried first next time. */
const HOMES = (process.env.PICKED_CODEX_HOMES || '').split('|').map((x) => x.trim()).filter(Boolean)
let goodHome = 0
async function codex(e, prompt, schema, timeoutMs) {
  const homes = HOMES.length ? HOMES : [e.home]
  let last
  for (let k = 0; k < homes.length; k++) {
    const i = (goodHome + k) % homes.length
    try { const r = await codexOnce(e, homes[i], prompt, schema, timeoutMs); goodHome = i; return r } catch (x) { last = x; if (/timed out/.test(String(x.message))) throw x }
  }
  throw last
}
function codexOnce(e, home, prompt, schema, timeoutMs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'picked-cx-')), out = path.join(dir, 'out.txt'), sp = path.join(dir, 'schema.json')
  if (schema) fs.writeFileSync(sp, JSON.stringify(schema))
  const args = ['exec', '--skip-git-repo-check', '--ephemeral', '-s', 'read-only', '--json', '-m', e.model, '-c', `model_reasoning_effort=${e.effort ?? 'low'}`, '-o', out, ...(schema ? ['--output-schema', sp] : []), prompt]
  return new Promise((resolve, reject) => {
    const p = spawn('codex', args, { env: { ...process.env, ...(home ? { CODEX_HOME: home } : {}) }, stdio: ['ignore', 'pipe', 'pipe'] })
    let so = '', se = ''
    const t = setTimeout(() => { p.kill('SIGKILL'); reject(new Error(`codex timed out after ${timeoutMs / 1000}s`)) }, timeoutMs)
    p.stdout.on('data', (d) => (so += d)); p.stderr.on('data', (d) => (se += d))
    p.on('error', (x) => { clearTimeout(t); reject(x) })
    p.on('close', (code) => {
      clearTimeout(t)
      try {
        if (code !== 0) throw new Error(`codex exited ${code}: ${se.slice(-160)}`)
        let tokens = 0
        for (const l of so.split('\n')) { try { const j = JSON.parse(l); if (j.type === 'turn.completed' && j.usage) tokens += (j.usage.input_tokens || 0) + (j.usage.output_tokens || 0) } catch { /* not an event line */ } }
        resolve({ text: fs.readFileSync(out, 'utf8').trim(), tokens })
      } catch (x) { reject(x) } finally { fs.rmSync(dir, { recursive: true, force: true }) }
    })
  })
}

/**
 * One call to one engine. Returns { engine, text, json?, ms, tokens }.
 * Pass `schema` for structured output. `fresh` skips the on-disk cache (benchmarks). `role` only labels the ledger.
 */
export async function call(engineId, { prompt, schema, role = '', timeoutMs = 150000, fresh = false }) {
  const e = engine(engineId); if (!e) throw new Error(`unknown engine ${engineId}`)
  if (schema && e.structured === false) throw new Error(`engine ${e.id} does not follow JSON schemas`)
  const t0 = Date.now(), nonce = fresh ? `\n\n[run ${crypto.randomBytes(3).toString('hex')}]` : ''
  try {
    let text = '', json, tokens = 0, cached = false
    if (e.driver === 'agy') {
      if (schema) { json = await llm.agyJson({ prompt: prompt + nonce, schema, model: e.model, timeoutMs, retries: 1 }); text = JSON.stringify(json) }
      else text = (await llm.agyText({ prompt: prompt + nonce, model: e.model, timeoutMs })).trim()
    } else {
      // a Codex call costs tens of thousands of tokens, so an identical request is answered from disk
      const key = crypto.createHash('sha256').update([e.id, prompt, JSON.stringify(schema ?? null)].join('\u0000')).digest('hex').slice(0, 32)
      const file = path.join(DATA, 'cache', `engine-${key}.json`)
      let hit = null
      if (!fresh) { try { hit = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { /* miss */ } }
      if (hit) { text = hit.text; tokens = 0; json = hit.json; cached = true }
      else {
        const r = await codex(e, prompt + nonce, schema, timeoutMs); text = r.text; tokens = r.tokens
        if (schema) json = parseLoose(text)
        if (!fresh) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify({ text, json })) }
      }
    }
    const ms = Date.now() - t0
    record({ at: t0, engine: e.id, role, ok: true, ms, tokens, cached })
    return { engine: e.id, text, json, ms, tokens, cached }
  } catch (err) {
    record({ at: t0, engine: e.id, role, ok: false, ms: Date.now() - t0, error: String(err.message || err).slice(0, 160) })
    throw err
  }
}
