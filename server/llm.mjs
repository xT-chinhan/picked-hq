import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

/* The system's LLM layer. Models come from the user's own agy/agyxt (Gemini 4, Gemini 3.8 Flash, GPT-OSS) through the agy CLI,
   with an on-disk cache keyed by content, a concurrency limit, and the agyxt proxy (account failover) when it is running. */
const CACHE = path.join(import.meta.dirname, 'data', 'cache')
fs.mkdirSync(CACHE, { recursive: true })
const PROXY_PORT = +process.env.AGYXT_PORT || 8899
export const MODELS = { fast: 'gemini-3.8-flash-low', write: 'gemini-4-argon-medium', writeAlt: 'gemini-4-hydrogen-low', oss: 'gpt-oss-120b-medium' }

const sha = (...parts) => crypto.createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 32)
const portOpen = (port) => new Promise((resolve) => { const s = net.connect(port, '127.0.0.1'); s.once('connect', () => { s.destroy(); resolve(true) }); s.once('error', () => resolve(false)); s.setTimeout(400, () => { s.destroy(); resolve(false) }) })

class Gate { // small semaphore
  constructor(n) { this.n = n; this.q = [] }
  async run(fn) { if (this.n <= 0) await new Promise((r) => this.q.push(r)); this.n--; try { return await fn() } finally { this.n++; this.q.shift()?.() } }
}
const gates = { agy: new Gate(+process.env.AGY_PARALLEL || 3), codex: new Gate(2) }

function run(cmd, args, { env = {}, timeoutMs = 150000 } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { env: { ...process.env, BROWSER: '/bin/false', ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = '', err = ''
    const t = setTimeout(() => { p.kill('SIGKILL'); reject(new Error(`${cmd} timed out after ${timeoutMs / 1000}s`)) }, timeoutMs)
    p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (err += d))
    p.on('close', (code) => { clearTimeout(t); code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${(err || out).slice(-400)}`)) })
    p.on('error', (e) => { clearTimeout(t); reject(e) })
  })
}

async function agyEnv() { return (await portOpen(PROXY_PORT)) ? { CLOUD_CODE_URL: `http://127.0.0.1:${PROXY_PORT}` } : {} }

/* Each agyxt account sees its own model list: some have Claude 5.5, others only 4.6. A 5.5 request that the account in use does not know is retried once as
   the 4.6 model of the same family, and the choice is remembered for ten minutes so the next calls do not repeat the miss. */
export const olderClaude = (model) => { const m = /^claude-(sonnet|opus)-5-5(?:-(?:low|medium|high|max))?$/.exec(String(model)); return m ? `claude-${m[1]}-4-6-thinking` : null }
const unknownModel = (e) => /not recognized as a known model/i.test(String(e?.message))
const fallbackUntil = new Map()
async function agyRun(args, env, timeoutMs) { return gates.agy.run(async () => run('agy', args, { env, timeoutMs })) }
async function agyCall(prompt, model, schemaPath, timeoutMs) {
  const mk = (m) => ['-p', prompt, '--model', m, '--output-format', 'json', ...(schemaPath ? ['--json-schema', schemaPath] : [])]
  const alt = olderClaude(model), env = await agyEnv()
  let raw
  if (alt && (fallbackUntil.get(model) ?? 0) > Date.now()) raw = await agyRun(mk(alt), env, timeoutMs)
  else {
    try { raw = await agyRun(mk(model), env, timeoutMs) }
    catch (e) { if (!alt || !unknownModel(e)) throw e; fallbackUntil.set(model, Date.now() + 600000); raw = await agyRun(mk(alt), env, timeoutMs) }
  }
  const d = JSON.parse(raw)
  if (d.status && d.status !== 'SUCCESS') throw new Error(`agy status ${d.status}`)
  return String(d.response ?? '')
}

/** Parses a model reply as JSON: the whole text first, else the first balanced {...} or [...] (string aware), so extra prose around it is ignored. */
export function parseLoose(text) {
  try { return JSON.parse(text) } catch { /* fall through to scanning */ }
  for (let i = 0; i < text.length; i++) {
    const open = text[i]; if (open !== '{' && open !== '[') continue
    const close = open === '{' ? '}' : ']'
    let depth = 0, inStr = false, esc = false
    for (let j = i; j < text.length; j++) {
      const c = text[j]
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue }
      if (c === '"') inStr = true; else if (c === open) depth++; else if (c === close && --depth === 0) { try { return JSON.parse(text.slice(i, j + 1)) } catch { break } }
    }
  }
  throw new Error('no JSON found in the reply')
}

/** Structured output: the reply is parsed JSON matching `schema`. Cached by (model, prompt, schema). */
export async function agyJson({ prompt, schema, model = MODELS.fast, timeoutMs = 150000, retries = 1 }) {
  const key = sha(model, prompt, JSON.stringify(schema)), file = path.join(CACHE, key + '.json')
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'))
  const sp = path.join(os.tmpdir(), `picked-schema-${key}.json`)
  fs.writeFileSync(sp, JSON.stringify(schema))
  let lastErr
  try {
    for (let i = 0; i <= retries; i++) {
      try {
        const text = await agyCall(i ? prompt + '\n\nReturn ONLY valid JSON that matches the schema.' : prompt, model, sp, timeoutMs)
        const obj = parseLoose(text)
        fs.writeFileSync(file, JSON.stringify(obj))
        return obj
      } catch (e) { lastErr = e }
    }
  } finally { fs.rmSync(sp, { force: true }) }
  throw lastErr
}

/** Free text. Cached the same way. */
export async function agyText({ prompt, model = MODELS.write, timeoutMs = 150000 }) {
  const key = sha('text', model, prompt), file = path.join(CACHE, key + '.txt')
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8')
  const text = await agyCall(prompt, model, null, timeoutMs)
  fs.writeFileSync(file, text)
  return text
}

/** Optional: Codex with live web search, used to fill gaps when a brand has no usable website. Read-only sandbox. */
export async function codexExec({ prompt, model = 'gpt-6.1-sol', timeoutMs = 170000 }) {
  const out = path.join(os.tmpdir(), `picked-codex-${sha(prompt, Date.now())}.txt`)
  try {
    await gates.codex.run(() => run('codex', ['exec', '--skip-git-repo-check', '--ephemeral', '-s', 'read-only', '-m', model, '-c', 'model_reasoning_effort=low', '-o', out, prompt], { timeoutMs }))
    return fs.readFileSync(out, 'utf8').trim()
  } finally { fs.rmSync(out, { force: true }) }
}

export const llm = { agyJson, agyText, codexExec }
export async function proxyStatus() { return (await portOpen(PROXY_PORT)) ? 'running' : 'off' }
