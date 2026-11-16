import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { runAudit } from './audit.mjs'

const PORT = +process.env.PORT || 5198
const DIR = path.join(import.meta.dirname, 'data', 'runs')
fs.mkdirSync(DIR, { recursive: true })
const live = new Map() // id -> { id, meta, events, clients, status, ctrl }
const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }
const body = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { r(JSON.parse(b || '{}')) } catch { r({}) } }) })
const saved = () => fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => { try { const r = JSON.parse(fs.readFileSync(path.join(DIR, f))); return { id: r.id, brand: r.brand, category: r.category, startedAt: r.startedAt, total: r.summary?.total, mentioned: r.summary?.mentioned, answered: r.summary?.answered, ms: r.ms } } catch { return null } }).filter(Boolean).sort((a, b) => b.startedAt - a.startedAt)

function start({ brand, category, total, tabs, headed }) {
  const id = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + '-' + Math.random().toString(36).slice(2, 5)
  const run = { id, meta: { brand, category }, events: [], clients: new Set(), status: 'running', ctrl: new AbortController(), startedAt: Date.now() }
  live.set(id, run)
  const emit = (e) => {
    const ev = { t: Date.now() - run.startedAt, ...e }
    run.events.push(ev)
    for (const c of run.clients) c.write(`data: ${JSON.stringify(ev)}\n\n`)
  }
  runAudit({ brand, category, total, tabs, headed, signal: run.ctrl.signal }, emit)
    .then(({ summary }) => { run.status = 'done'; fs.writeFileSync(path.join(DIR, id + '.json'), JSON.stringify({ id, brand, category, startedAt: run.startedAt, ms: Date.now() - run.startedAt, summary, events: run.events })) })
    .catch((e) => { run.status = 'error'; emit({ type: 'run.error', error: String(e.message || e) }) })
    .finally(() => { for (const c of run.clients) c.end() })
  return run
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'), p = u.pathname
  try {
    if (req.method === 'POST' && p === '/api/audit') {
      const b = await body(req)
      if ([...live.values()].some((r) => r.status === 'running')) return json(res, 409, { error: 'an audit is already running' })
      const run = start({ brand: b.brand || 'Lock&Lock', category: b.category || 'hộp cơm giữ nhiệt', total: Math.min(40, +b.total || 40), tabs: Math.min(6, +b.tabs || 4), headed: !!b.headed })
      return json(res, 200, { id: run.id })
    }
    let m
    if ((m = p.match(/^\/api\/audit\/([\w-]+)\/events$/))) {
      const run = live.get(m[1])
      if (!run) return json(res, 404, { error: 'not found' })
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
      for (const ev of run.events) res.write(`data: ${JSON.stringify(ev)}\n\n`)
      if (run.status !== 'running') return res.end()
      run.clients.add(res); req.on('close', () => run.clients.delete(res)); return
    }
    if ((m = p.match(/^\/api\/audit\/([\w-]+)\/stop$/)) && req.method === 'POST') { live.get(m[1])?.ctrl.abort(); return json(res, 200, { ok: true }) }
    if (p === '/api/runs') return json(res, 200, saved())
    if ((m = p.match(/^\/api\/runs\/([\w-]+)$/))) {
      const f = path.join(DIR, m[1] + '.json')
      if (!fs.existsSync(f)) return json(res, 404, { error: 'not found' })
      res.writeHead(200, { 'content-type': 'application/json' }); return res.end(fs.readFileSync(f))
    }
    json(res, 404, { error: 'not found' })
  } catch (e) { json(res, 500, { error: String(e.message || e) }) }
}).listen(PORT, '127.0.0.1', () => console.log(`audit server on http://127.0.0.1:${PORT}`))
