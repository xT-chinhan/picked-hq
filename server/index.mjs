import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { runPipeline, lanIp } from './pipeline.mjs'
import { handleApprovalRequest } from './approve.mjs'
import { handleSystemOne } from './systemone.mjs'
import { edgeConfig, startEdge } from './edge.mjs'
import { BRANDS, CATEGORY, findBrand } from './directory.mjs'
import { createRoutines } from './routines.mjs'

const PORT = +process.env.PICKED_PORT || 5198
const DATA = process.env.PICKED_DATA_DIR || path.join(import.meta.dirname, 'data')
const DIR = path.join(DATA, 'runs')
const SHOPS = path.join(import.meta.dirname, '..', 'public', 'shops')
fs.mkdirSync(DIR, { recursive: true })
const EDGE = edgeConfig()
// requests that arrive through the hosted UI: only the edge function holds the secret, and visitors are rate limited per IP
const hits = new Map()
const limited = (ip, key, max, windowMs) => {
  const k = key + '|' + ip, now = Date.now(), list = (hits.get(k) || []).filter((t) => now - t < windowMs)
  list.push(now); hits.set(k, list)
  if (hits.size > 2000) for (const [key, v] of hits) if (now - v[v.length - 1] > 600000) hits.delete(key)
  return list.length > max
}
const live = new Map(), pending = new Map() // run id -> run state; approval id -> resolver
const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }
const body = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => { if (b.length < 65536) b += c }); req.on('end', () => { try { r(JSON.parse(b || '{}')) } catch { r({}) } }) })
const listCache = new Map() // file -> [mtimeMs, summary]; run files are large, so only changed ones are re-read
const saved = () => fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => {
  try {
    const file = path.join(DIR, f), mt = fs.statSync(file).mtimeMs, hit = listCache.get(f)
    if (hit && hit[0] === mt) return hit[1]
    const r = JSON.parse(fs.readFileSync(file)), item = { id: r.id, brand: r.brand, category: r.category, startedAt: r.startedAt, total: r.summary?.total, mentioned: r.summary?.mentioned, answered: r.summary?.answered, ms: r.ms }
    listCache.set(f, [mt, item]); return item
  } catch { return null }
}).filter(Boolean).sort((a, b) => b.startedAt - a.startedAt)
const running = () => [...live.values()].find((r) => r.status === 'running')
const brief = (r) => r && { id: r.id, brand: r.brand, mode: r.mode, startedAt: r.startedAt, events: r.events.length }
/** Ends a run for good: releases a pending owner decision and tells every listener. */
function stopRun(run, why = 'stopped') {
  if (run.status !== 'running') return
  run.status = 'stopped'; run.ctrl.abort(); routines.finished(run.id, 'stopped')
  for (const r of pending.values()) r({ status: 'rejected', decisions: {} })
  const ev = { t: Date.now() - run.startedAt, type: 'run.error', error: why }; run.events.push(ev)
  for (const c of run.clients) { c.write(`data: ${JSON.stringify(ev)}\n\n`); c.end() }
}
const routines = createRoutines({
  file: path.join(DATA, 'routines.json'),
  isBusy: () => !!running(),
  startRun: ({ brand, mode }) => {
    const known = findBrand(brand), reuse = mode === 'quick' ? saved().find((r) => r.total >= 40 && r.category === CATEGORY)?.id ?? '' : ''
    if (mode === 'quick' && !reuse) return null
    return start({ brand: known?.name ?? brand, category: CATEGORY, website: known?.website ?? '', total: 40, tabs: 5, reuse, measureOnly: true }, mode)
  },
  result: (id) => saved().find((r) => r.id === id) ?? null,
  previous: (brand, beforeId) => saved().filter((r) => r.brand === brand && r.id !== beforeId && r.total >= 40).sort((a, b) => b.startedAt - a.startedAt)[0] ?? null,
})
const MIME = { '.html': 'text/html; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.json': 'application/json' }

function start(o, mode) {
  const id = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + '-' + Math.random().toString(36).slice(2, 5)
  const run = { id, brand: o.brand, mode, events: [], clients: new Set(), status: 'running', ctrl: new AbortController(), startedAt: Date.now() }
  live.set(id, run)
  const emit = (e) => { const ev = { t: Date.now() - run.startedAt, ...e }; run.events.push(ev); for (const c of run.clients) c.write(`data: ${JSON.stringify(ev)}\n\n`) }
  runPipeline({ ...o, signal: run.ctrl.signal }, emit, { runId: id, port: PORT, awaitDecision: (aid) => new Promise((res) => pending.set(aid, res)) })
    .then(({ summary }) => { if (run.status !== 'running') return; run.status = 'done'; setTimeout(() => routines.finished(id, 'done'), 50); fs.writeFileSync(path.join(DIR, id + '.json'), JSON.stringify({ id, brand: o.brand, category: o.category, website: o.website, startedAt: run.startedAt, ms: Date.now() - run.startedAt, summary, events: run.events.filter((e) => e.type !== 'q.partial') })) })
    .catch((e) => { if (run.status !== 'running') return; run.status = 'error'; routines.finished(id, 'failed'); emit({ type: 'run.error', error: String(e.message || e) }) })
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
      if (p === '/api/one/ask' && limited(ip, 'ask', 4, 600000)) return json(res, 429, { error: 'Too many questions, try again later.' })
      if (/^\/api\/(one\/(chat|prompt)|translate\/refine)/.test(p) && limited(ip, 'llm', 12, 60000)) return json(res, 429, { error: 'Too many requests, slow down.' })
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
      if (!f.startsWith(SHOPS) || !fs.existsSync(f) || !fs.statSync(f).isFile()) return json(res, 404, { error: 'not found' })
      res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); return res.end(fs.readFileSync(f))
    }
    if (p === '/api/status') return json(res, 200, { ok: true, edge: !!EDGE, running: brief(running()), saved: saved().length })
    if (p === '/api/brands') return json(res, 200, { category: CATEGORY, brands: BRANDS.map((x) => ({ ...x, runs: saved().filter((r) => r.brand === x.name).length })), quick: saved().find((r) => r.total >= 40)?.id ?? null })
    if (req.method === 'POST' && p === '/api/audit') {
      const b = await body(req), cur = running()
      if (cur) {
        if (!(b.replace && local)) return json(res, 409, { error: 'an audit is already running', running: brief(cur) })
        stopRun(cur, 'replaced by a new audit')
      }
      // "quick" re-asks nothing: it reuses the newest full set of saved Gemini answers; "fresh" opens real Gemini tabs
      const mode = b.mode === 'fresh' ? 'fresh' : 'quick'
      const known = findBrand(b.brand), brand = String(b.brand || '').trim().slice(0, 60) || 'Elmich'
      const category = String(b.category || '').trim().slice(0, 80) || CATEGORY
      const reuse = mode === 'quick' ? saved().find((r) => r.total >= 40 && r.category === category)?.id ?? '' : ''
      if (mode === 'quick' && !reuse) return json(res, 422, { error: 'no saved answers for this category yet; run a fresh audit first' })
      const run = start({ brand: known?.name ?? brand, category, website: String(b.website || '').trim() || known?.website || '', total: Math.min(40, +b.total || 40), tabs: Math.min(6, +b.tabs || 5), headed: !!b.headed && local, reuse, autoApprove: !!b.autoApprove && local }, mode)
      return json(res, 200, { id: run.id, mode, brand: run.brand, reused: reuse || null })
    }
    if ((m = p.match(/^\/api\/audit\/([\w-]+)\/events$/))) {
      const run = live.get(m[1]); if (!run) return json(res, 404, { error: 'not found' })
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
      for (const ev of run.events) res.write(`data: ${JSON.stringify(ev)}\n\n`)
      if (run.status !== 'running') return res.end()
      run.clients.add(res); req.on('close', () => run.clients.delete(res)); return
    }
    if ((m = p.match(/^\/api\/audit\/([\w-]+)\/stop$/)) && req.method === 'POST') { const r = live.get(m[1]); if (r) stopRun(r); return json(res, 200, { ok: true }) }
    if (p === '/api/inbox') {
      // everything that is waiting for a person: an owner decision on the running audit, and routine results nobody has looked at yet
      const cur = running(), ap = cur && [...cur.events].reverse().find((e) => e.type === 'approval.requested' || e.type === 'approval.done')
      const needs = ap?.type === 'approval.requested' ? [{ kind: 'approval', runId: cur.id, brand: cur.brand, docs: ap.approval.docs.length, keys: ap.approval.docs.map((d) => d.key), approvalId: ap.approval.id, at: cur.startedAt + ap.t }] : []
      return json(res, 200, { needs, results: routines.unseen().slice(0, 20), running: brief(cur) ?? null })
    }
    if (p === '/api/routines' && req.method === 'GET') return json(res, 200, { routines: routines.list(), brands: BRANDS.map((b) => b.name) })
    if (p.startsWith('/api/routines') && req.method !== 'GET') {
      if (viaTunnel) return json(res, 403, { error: 'local only' })
      try {
        if (p === '/api/routines' && req.method === 'POST') return json(res, 200, routines.create(await body(req)))
        if (p === '/api/routines/seen' && req.method === 'POST') { routines.markSeen((await body(req)).runId); return json(res, 200, { ok: true }) }
        const mm = p.match(/^\/api\/routines\/([\w-]+)(\/run)?$/)
        if (mm && mm[2] && req.method === 'POST') { const rid = routines.fire(mm[1], 'manual'); return rid ? json(res, 200, { runId: rid }) : json(res, 409, { error: 'another audit is running', running: brief(running()) }) }
        if (mm && req.method === 'PATCH') return json(res, 200, routines.update(mm[1], await body(req)))
        if (mm && req.method === 'DELETE') return json(res, routines.remove(mm[1]) ? 200 : 404, { ok: true })
      } catch (e) { return json(res, 400, { error: String(e.message || e) }) }
    }
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
  setInterval(() => { try { routines.tick() } catch (e) { console.log('routines:', e.message) } }, 30000)
  if (EDGE) startEdge(PORT, EDGE)
  else console.log('edge: not configured (no ~/.config/picked/edge.env), the hosted UI will show the maintenance notice')
})
