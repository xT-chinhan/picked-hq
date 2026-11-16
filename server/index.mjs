import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { runPipeline, lanIp } from './pipeline.mjs'
import { handleApprovalRequest } from './approve.mjs'
import { handleSystemOne } from './systemone.mjs'
import { edgeConfig, startEdge } from './edge.mjs'

const PORT = +process.env.PICKED_PORT || 5198
const DIR = path.join(import.meta.dirname, 'data', 'runs')
const SHOPS = path.join(import.meta.dirname, '..', 'public', 'shops')
fs.mkdirSync(DIR, { recursive: true })
const EDGE = edgeConfig()
// requests that arrive through the hosted UI: only the edge function holds the secret, and visitors are rate limited per IP
const hits = new Map()
const limited = (ip, key, max, windowMs) => {
  const k = key + '|' + ip, now = Date.now(), list = (hits.get(k) || []).filter((t) => now - t < windowMs)
  list.push(now); hits.set(k, list)
  return list.length > max
}
const live = new Map(), pending = new Map() // run id -> run state; approval id -> resolver
const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }
const body = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { r(JSON.parse(b || '{}')) } catch { r({}) } }) })
const saved = () => fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => { try { const r = JSON.parse(fs.readFileSync(path.join(DIR, f))); return { id: r.id, brand: r.brand, category: r.category, startedAt: r.startedAt, total: r.summary?.total, mentioned: r.summary?.mentioned, answered: r.summary?.answered, ms: r.ms } } catch { return null } }).filter(Boolean).sort((a, b) => b.startedAt - a.startedAt)
const MIME = { '.html': 'text/html; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.json': 'application/json' }

function start(o) {
  const id = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + '-' + Math.random().toString(36).slice(2, 5)
  const run = { id, events: [], clients: new Set(), status: 'running', ctrl: new AbortController(), startedAt: Date.now() }
  live.set(id, run)
  const emit = (e) => { const ev = { t: Date.now() - run.startedAt, ...e }; run.events.push(ev); for (const c of run.clients) c.write(`data: ${JSON.stringify(ev)}\n\n`) }
  runPipeline({ ...o, signal: run.ctrl.signal }, emit, { runId: id, port: PORT, awaitDecision: (aid) => new Promise((res) => pending.set(aid, res)) })
    .then(({ summary }) => { run.status = 'done'; fs.writeFileSync(path.join(DIR, id + '.json'), JSON.stringify({ id, brand: o.brand, category: o.category, website: o.website, startedAt: run.startedAt, ms: Date.now() - run.startedAt, summary, events: run.events.filter((e) => e.type !== 'q.partial') })) })
    .catch((e) => { run.status = 'error'; emit({ type: 'run.error', error: String(e.message || e) }) })
    .finally(() => { for (const c of run.clients) c.end() })
  return run
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'), p = u.pathname
  const viaTunnel = !!(req.headers['cf-ray'] || req.headers['cf-connecting-ip'])
  const local = !viaTunnel && /^(::1|127\.|::ffff:127\.)/.test(req.socket.remoteAddress || '')
  res.setHeader('x-picked', '1')
  try {
    if (viaTunnel) {
      if (!EDGE || req.headers['x-picked-edge'] !== EDGE.secret) return json(res, 403, { error: 'forbidden' })
      const ip = String(req.headers['x-picked-ip'] || 'unknown')
      if (req.method === 'POST' && p.startsWith('/api/audit/') && p.endsWith('/stop')) return json(res, 403, { error: 'local only' })
      if (req.method === 'POST' && limited(ip, 'post', 30, 60000)) return json(res, 429, { error: 'Too many requests, slow down.' })
      if (req.method === 'POST' && p === '/api/audit' && limited(ip, 'audit', 4, 600000)) return json(res, 429, { error: 'Too many audits, try again later.' })
    }
    if (p === '/api/health') return json(res, 200, { ok: true, edge: !!EDGE })
    // phones on the LAN may only reach the approval page and published shop pages
    if (!local && !viaTunnel && !/^\/(approve\/|api\/approve\/|shop\/)/.test(p)) return json(res, 403, { error: 'local only' })
    if (await handleApprovalRequest(req, res, { onDecision: (a) => pending.get(a.id)?.(a) })) return
    if (await handleSystemOne(req, res)) return
    let m
    if ((m = p.match(/^\/shop\/([\w-]+)\/?([\w.-]*)$/))) {
      const f = path.join(SHOPS, m[1], m[2] || 'index.html')
      if (!f.startsWith(SHOPS) || !fs.existsSync(f)) return json(res, 404, { error: 'not found' })
      res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); return res.end(fs.readFileSync(f))
    }
    if (req.method === 'POST' && p === '/api/audit') {
      const b = await body(req)
      if ([...live.values()].some((r) => r.status === 'running')) return json(res, 409, { error: 'an audit is already running' })
      const run = start({ brand: b.brand || 'Elmich', category: b.category || 'hộp cơm giữ nhiệt', website: b.website || '', total: Math.min(40, +b.total || 40), tabs: Math.min(6, +b.tabs || 4), headed: !!b.headed, reuse: b.reuse || '', autoApprove: !!b.autoApprove })
      return json(res, 200, { id: run.id })
    }
    if ((m = p.match(/^\/api\/audit\/([\w-]+)\/events$/))) {
      const run = live.get(m[1]); if (!run) return json(res, 404, { error: 'not found' })
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
}).listen(PORT, '0.0.0.0', () => {
  console.log(`audit server on http://127.0.0.1:${PORT} (LAN ${lanIp()}: approval and shop pages only)`)
  if (EDGE) startEdge(PORT, EDGE)
  else console.log('edge: not configured (no ~/.config/picked/edge.env), the hosted UI will show the maintenance notice')
})
