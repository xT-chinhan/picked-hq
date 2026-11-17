import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { runPipeline, lanIp } from './pipeline.mjs'
import { handleApprovalRequest } from './approve.mjs'
import { handleSystemOne } from './systemone.mjs'
import { edgeConfig, startEdge } from './edge.mjs'
import { BRANDS, CATEGORY, findBrand } from './directory.mjs'
import { createRoutines } from './routines.mjs'
import { roster, lockSouls } from './agents.mjs'
import { ledger } from './engines.mjs'
import { probeLlmsTxt, reviewPage } from './pagereview.mjs'
import { hub } from './browserhub.mjs'
import { measured } from './measured.mjs'
import { analyzeBenchmark } from './criteria.mjs'
import * as profiles from './profiles.mjs'
import { platformOf, discover as copilotDiscover, consistency as copilotCheck, patches as copilotPatches } from './copilot.mjs'
import { createMcpHub, handleMcpRequest, isAllowed } from './mcp.mjs'
import { entry, publicCatalog } from './mcp-catalog.mjs'
import { runToolLoop } from './toolloop.mjs'
import { agentLlm, scopesFor, setScopes } from './agents.mjs'
import { SYNTH_SCHEMA, assertPublic, createAnalyzer, normalizeTarget, resolveName, runAudit, runRea, runScrape, synthPrompt } from './analyze.mjs'

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
const body = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => { if (b.length < 200000) b += c }); req.on('end', () => { try { r(JSON.parse(b || '{}')) } catch { r({}) } }) })
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
  sse(run.clients, ev); for (const c of run.clients) c.end(); run.clients.clear()
}
const mcp = createMcpHub({ file: path.join(DATA, 'mcp.json') })
const nanLlm = agentLlm('nan')
const anaLlm = agentLlm('ana')
const ANALYSES = path.join(DATA, 'analyses'); fs.mkdirSync(ANALYSES, { recursive: true })
const analyses = new Map() // id -> { events, clients, status }
/** Writes one server-sent event; a closed client is removed from its set instead of being written to. */
// a browser that leaves mid-stream must never take the server down with it
process.on('uncaughtException', (e) => { if (['ERR_STREAM_WRITE_AFTER_END', 'EPIPE', 'ECONNRESET', 'ERR_STREAM_DESTROYED'].includes(e?.code)) { console.warn('ignored a closed connection:', e.code); return } console.error(e); process.exit(1) })
const sse = (clients, ev) => { for (const c of clients) { if (c.writableEnded || c.destroyed) { clients.delete(c); continue } try { c.write(`data: ${JSON.stringify(ev)}\n\n`) } catch { clients.delete(c) } } }
const copilotSeen = new Map() // url -> { f, at }: what discovery read, so a check uses the server's own reading, not the browser's
setInterval(() => { for (const [k, v] of copilotSeen) if (Date.now() - v.at > 1800000) copilotSeen.delete(k) }, 600000).unref()
/** The evidence behind "what gets a store recommended": our benchmark, this site's latest X-ray, and the sources Gemini cites for the category. */
let benchCache = null
function copilotCriteria(host) {
  if (!benchCache) { try { const b = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'public', 'data', 'benchmark.json'), 'utf8')); const a = analyzeBenchmark(b.brands); const rows = a.rows; const pick = (n) => rows.find((r) => r.name === n); benchCache = { r: a.correlation.site, n: a.n, category: b.category, examples: [pick('Hakawa'), pick('Lock&Lock')].filter(Boolean).map((r) => ({ name: r.name, site: r.site, mentioned: r.mentioned, total: r.total })) } } catch { benchCache = { r: null, n: 0, examples: [] } } }
  let xray = null
  try { for (const f of fs.readdirSync(ANALYSES).sort().reverse()) { const r = JSON.parse(fs.readFileSync(path.join(ANALYSES, f), 'utf8')); if (new URL(r.url).hostname.replace(/^www\./, '') === host) { xray = { score: r.siteScore, id: r.id }; break } } } catch { /* none yet */ }
  let sources = []
  try { const run = saved().filter((r) => r.total >= 40).sort((a, b) => b.startedAt - a.startedAt)[0]; if (run) { const full = JSON.parse(fs.readFileSync(path.join(DIR, run.id + '.json'), 'utf8')); sources = (full.summary?.sources ?? []).slice(0, 6) } } catch { /* no saved run */ }
  return { bench: benchCache, xray, sources, quickCategory: CATEGORY }
}
const pageReviews = [] // pages the extension reviewed in the visitor's own Chrome, newest first
const analyzer = createAnalyzer({
  scrape: (url, ms) => runScrape(url, ms), audit: (url, ms) => runAudit(url, ms),
  rea: (url) => runRea(url, { mcp, catalogEntry: entry('rea') }),
  synth: (brand, evidence) => anaLlm.agyJson({ schema: SYNTH_SCHEMA, prompt: synthPrompt(brand, evidence), timeoutMs: 45000 }),
})
const fetchTitle = async (url) => { const r = await fetch(url, { headers: { 'user-agent': 'PickedBot/1.0 (+https://pickedhq.pages.dev)' }, signal: AbortSignal.timeout(10000), redirect: 'follow' }); return ((await r.text()).match(/<title[^>]*>([^<]*)/i)?.[1] ?? '').trim() }
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
  const emit = (e) => { const ev = { t: Date.now() - run.startedAt, ...e }; run.events.push(ev); sse(run.clients, ev) }
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
      if (p === '/api/bots/draft' && limited(ip, 'bots', 3, 600000)) return json(res, 429, { error: 'Too many new agents, try again later.' })
      if (/^\/api\/(one\/(chat|prompt)|translate\/refine)/.test(p) && limited(ip, 'llm', 12, 60000)) return json(res, 429, { error: 'Too many requests, slow down.' })
      if ((p === '/api/analyze' || p === '/api/analyze/resolve') && limited(ip, 'analyze', p === '/api/analyze' ? 3 : 8, 600000)) return json(res, 429, { error: 'Too many analyses, try again later.' })
      if (req.method === 'POST' && limited(ip, 'post', 30, 60000)) return json(res, 429, { error: 'Too many requests, slow down.' })
      if (req.method === 'POST' && p === '/api/audit' && limited(ip, 'audit', 4, 600000)) return json(res, 429, { error: 'Too many audits, try again later.' })
    }
    if (p === '/api/health') return json(res, 200, { ok: true, edge: !!EDGE })
    // phones on the LAN may only reach the approval page and published shop pages
    if (!local && !viaTunnel && !/^\/(approve\/|api\/approve\/|shop\/)/.test(p)) return json(res, 403, { error: 'local only' })
    if (await handleApprovalRequest(req, res, { onDecision: (a) => pending.get(a.id)?.(a) })) return
    if (await handleSystemOne(req, res, { apps: () => mcp.list().filter((x) => x.status === 'ready').map((x) => x.name) })) return
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
    if (p === '/api/mcp/catalog' && req.method === 'GET') return json(res, 200, { catalog: publicCatalog(), servers: mcp.list(), scopes: Object.fromEntries(['nan'].map((a) => [a, scopesFor(a)])) })
    if (p === '/api/mcp/install' && req.method === 'POST') {
      if (!local) return json(res, 403, { error: 'local only' })
      try {
        const b = await body(req), e = entry(String(b.id || ''))
        if (!e) return json(res, 404, { error: 'unknown app' })
        const env = {}; for (const r of e.requires) { const v = String(b.env?.[r.key] ?? '').trim(); if (!v) return json(res, 400, { error: `${r.label} is required` }); env[r.key] = v }
        if (e.prepare === 'workspace') fs.mkdirSync(path.join(DATA, 'workspace'), { recursive: true })
        if (mcp.list().some((x) => x.name === e.id)) await mcp.remove(e.id)
        mcp.add({ name: e.id, command: e.command, args: e.args, env: { ...(e.env ?? {}), ...env } })
        try { await mcp.connect(e.id, { timeoutMs: 90000 }) } catch (x) { await mcp.remove(e.id); throw x }
        return json(res, 200, { server: mcp.list().find((x) => x.name === e.id), tools: await mcp.tools(e.id) })
      } catch (e) { return json(res, 502, { error: String(e.message || e).slice(0, 200) }) }
    }
    if (p === '/api/mcp/scopes' && req.method === 'PUT') {
      if (!local) return json(res, 403, { error: 'local only' })
      try { const b = await body(req); return json(res, 200, { agent: b.agent, scopes: setScopes(String(b.agent), b.scopes) }) } catch (e) { return json(res, 400, { error: String(e.message || e) }) }
    }
    if (p === '/api/one/agent' && req.method === 'POST') {
      // NaN uses the connected apps it was granted, one allowed tool at a time
      if (!local) return json(res, 403, { error: 'Apps can only be used from the machine running Picked.' })
      const text = String((await body(req)).text || '').slice(0, 1000)
      const scope = scopesFor('nan'), tools = []
      for (const sv of mcp.list().filter((x) => x.status === 'ready')) for (const t of await mcp.tools(sv.name)) if (isAllowed(scope, sv.name, t.name)) tools.push({ server: sv.name, ...t })
      if (!tools.length) return json(res, 200, { answer: 'No app is connected and allowed for NaN yet. Open Apps (A), connect one and switch on "NaN may use".', steps: [], tools: 0 })
      const r = await runToolLoop({ request: text, tools, llm: nanLlm, call: (server, tool, args) => mcp.call(server, tool, args, { scope, timeoutMs: 60000 }) })
      return json(res, 200, { ...r, tools: tools.length })
    }
    if (await handleMcpRequest(req, res, { hub: mcp, local })) return
    if (p === '/api/analyze/resolve' && req.method === 'POST') {
      const t = normalizeTarget((await body(req)).input)
      if (t.error) return json(res, 400, { error: t.error })
      if (t.url) { try { await assertPublic(t.url) } catch (e) { return json(res, 400, { error: `Cannot analyse that address: ${String(e.message || e)}.` }) } return json(res, 200, { url: t.url, host: t.host, verified: true, direct: true }) }
      try { return json(res, 200, await resolveName(t.name, { llm: nanLlm, fetchTitle })) } catch (e) { return json(res, 502, { error: 'Could not look that company up: ' + String(e.message || e).slice(0, 120) }) }
    }
    if (p === '/api/analyze' && req.method === 'POST') {
      const t = normalizeTarget((await body(req)).input)
      if (!t.url) return json(res, 400, { error: t.error || 'Give a website address (use resolve for a company name).' })
      try { await assertPublic(t.url) } catch (e) { return json(res, 400, { error: `Cannot analyse that address: ${String(e.message || e)}.` }) }
      const busy = [...analyses.entries()].find(([, a]) => a.status === 'running')
      if (busy) return json(res, 409, { error: 'Another analysis is still running.', running: { id: busy[0], url: busy[1].url } })
      const id = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + '-an' + Math.random().toString(36).slice(2, 5)
      const a = { events: [], clients: new Set(), status: 'running', url: t.url }; analyses.set(id, a)
      const emit = (e) => { a.events.push(e); sse(a.clients, e) }
      analyzer({ id, url: t.url, emit, skip: [] })
        .then((report) => { a.status = report ? 'done' : 'error'; if (report) fs.writeFileSync(path.join(ANALYSES, id + '.json'), JSON.stringify(report)) })
        .catch((e) => { a.status = 'error'; emit({ type: 'an.error', error: String(e.message || e) }) })
        .finally(() => { for (const c of a.clients) c.end() })
      return json(res, 200, { id })
    }
    if ((m = p.match(/^\/api\/analyze\/([\w-]+)\/events$/)) && req.method === 'GET') {
      const a = analyses.get(m[1]); if (!a) return json(res, 404, { error: 'not found' })
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
      for (const ev of a.events) res.write(`data: ${JSON.stringify(ev)}\n\n`)
      if (a.status !== 'running') return res.end()
      a.clients.add(res); req.on('close', () => a.clients.delete(res)); return
    }
    if (p === '/api/analyses' && req.method === 'GET') {
      const list = fs.readdirSync(ANALYSES).filter((f) => f.endsWith('.json')).map((f) => { try { const r = JSON.parse(fs.readFileSync(path.join(ANALYSES, f))); return { id: r.id, brand: r.brand, url: r.url, siteScore: r.siteScore, finishedAt: r.finishedAt, partial: r.partial } } catch { return null } }).filter(Boolean).sort((x, y) => y.finishedAt - x.finishedAt)
      return json(res, 200, { analyses: list })
    }
    if ((m = p.match(/^\/api\/analyses\/([\w-]+)$/)) && req.method === 'GET') {
      const f = path.join(ANALYSES, m[1] + '.json'); if (!fs.existsSync(f)) return json(res, 404, { error: 'not found' })
      res.writeHead(200, { 'content-type': 'application/json' }); return res.end(fs.readFileSync(f))
    }
    // GEO Copilot: find the business online, the owner confirms the places, then every place is checked against the others
    if (p === '/api/copilot/discover' && req.method === 'POST') {
      const t = normalizeTarget((await body(req)).input)
      let url = t.url, name = ''
      if (!url && t.name) { try { const r = await resolveName(t.name, { llm: nanLlm, fetchTitle }); if (r.unresolved) return json(res, 404, { error: `No website found for “${t.name}”.`, name: t.name }); url = r.url; name = r.name } catch (e) { return json(res, 502, { error: 'Could not look that business up: ' + String(e.message || e).slice(0, 120) }) } }
      if (!url) return json(res, 400, { error: t.error || 'Give a website or a business name.' })
      try { await assertPublic(url) } catch (e) { return json(res, 400, { error: `Cannot read that address: ${String(e.message || e)}` }) }
      try { const f = await copilotDiscover(url); copilotSeen.set(f.url, { f, at: Date.now() }); return json(res, 200, { ...f, name, identity: { ...f.identity, org: f.identity.org && { ...f.identity.org, raw: undefined } } }) }
      catch (e) { return json(res, 502, { error: 'Could not read the site: ' + String(e.message || e).split('\n')[0].slice(0, 140) }) }
    }
    if (p === '/api/copilot/check' && req.method === 'POST') {
      const b = await body(req), hit = copilotSeen.get(String(b.url || ''))
      if (!hit) return json(res, 404, { error: 'Run the discovery again: this site was not read in the last 30 minutes.' })
      const allowed = new Map(hit.f.sources.map((s) => [s.url, s]))
      // only places found on the site, or added by the owner as an http(s) link, are kept; facts read in a signed-in session come from the owner's browser
      const kept = (Array.isArray(b.sources) ? b.sources : []).slice(0, 20).flatMap((s) => { const base = allowed.get(s?.url); if (base) return [{ ...base, facts: s.facts ? { title: String(s.facts.title || '').slice(0, 160) } : undefined }]; try { const u = new URL(String(s?.url)); if (!/^https?:$/.test(u.protocol)) return []; return [{ id: `owner-${u.hostname}`, kind: platformOf(u.href) ?? 'link', label: String(s.label || u.hostname).slice(0, 40), url: u.href, status: 'owner', inSameAs: false }] } catch { return [] } })
      const sources = [hit.f.sources[0], ...kept.filter((s) => s.kind !== 'website')]
      return json(res, 200, { ...copilotCheck(hit.f, sources), patches: copilotPatches(hit.f, sources), criteria: copilotCriteria(hit.f.host) })
    }
    // sign-in profiles: this machine only, never through the tunnel; reading a page needs the owner's approval in the chat
    if (p === '/api/sessions' && req.method === 'GET') { if (!local) return json(res, 403, { error: 'local only' }); return json(res, 200, { profiles: profiles.list() }) }
    if ((m = p.match(/^\/api\/sessions\/([\w-]+)\/(open|read)$/)) && req.method === 'POST') {
      if (!local) return json(res, 403, { error: 'local only' })
      const b = await body(req)
      if (m[2] === 'open') { const id = await hub.openSession(m[1], String(b.url || '')); return json(res, 200, { id }) }
      if (b.approved !== true) return json(res, 400, { error: 'the owner must approve the read first' })
      try { return json(res, 200, await profiles.read(m[1], String(b.url || ''), { more: Math.min(4, Number(b.more) || 3) })) } catch (e) { return json(res, 502, { error: String(e.message || e).split('\n')[0].slice(0, 160) }) }
    }
    if ((m = p.match(/^\/api\/sessions\/([\w-]+)$/)) && req.method === 'DELETE') { if (!local) return json(res, 403, { error: 'local only' }); await profiles.signOut(m[1]); return json(res, 200, { ok: true }) }
    if (p === '/api/browser/tabs' && req.method === 'GET') return json(res, 200, { tabs: hub.list().filter((t) => local || t.kind === 'gemini') })
    if (p === '/api/browser/stream' && req.method === 'GET') {
      const tab = u.searchParams.get('tab') || ''
      // the public address may watch the Gemini tabs of an audit, but never a page NaN opened, and never type into anything
      if (viaTunnel && tab && hub.list().find((t) => t.id === tab)?.kind !== 'gemini') return json(res, 403, { error: 'local only' })
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
      const off = hub.watch(res, tab); req.on('close', off); return
    }
    if (p.startsWith('/api/browser/') && req.method !== 'GET') {
      if (!local) return json(res, 403, { error: 'local only' })
      try {
        let mm
        if (p === '/api/browser/open' && req.method === 'POST') { const b = await body(req); return json(res, 200, { id: await hub.openWeb(String(b.url || '')) }) }
        if ((mm = p.match(/^\/api\/browser\/([\w-]+)\/input$/)) && req.method === 'POST') return json(res, 200, await hub.input(mm[1], await body(req)))
        if ((mm = p.match(/^\/api\/browser\/([\w-]+)\/review$/)) && req.method === 'POST') { const page = await hub.read(mm[1]); return json(res, 200, { page: { url: page.url, title: page.title, schemaTypes: page.schemaTypes, hasFaq: page.hasFaq }, ...reviewPage(page, { llms: await probeLlmsTxt(page.url) }) }) }
        if ((mm = p.match(/^\/api\/browser\/([\w-]+)$/)) && req.method === 'DELETE') return json(res, (await hub.closeTab(mm[1])) ? 200 : 404, { ok: true })
      } catch (e) { return json(res, 400, { error: String(e.message || e) }) }
    }
    if (p === '/api/page/review' && req.method === 'POST') {
      const page = (await body(req)).page
      if (!page || typeof page !== 'object') return json(res, 400, { error: 'page is required' })
      const review = reviewPage(page, { llms: await probeLlmsTxt(page.url) })
      // a review the extension made in the visitor's own Chrome is kept for the chat that is waiting for it (this machine only)
      if (local) { let host = ''; try { host = new URL(String(page.url)).hostname.replace(/^www\./, '') } catch { /* no url */ } pageReviews.unshift({ ts: Date.now(), host, url: String(page.url || ''), title: String(page.title || ''), review }); pageReviews.length = Math.min(pageReviews.length, 20) }
      return json(res, 200, review)
    }
    if (p === '/api/page/reviews' && req.method === 'GET') {
      if (!local) return json(res, 403, { error: 'local only' })
      const since = Number(new URL(req.url, 'http://x').searchParams.get('since')) || 0
      return json(res, 200, { reviews: pageReviews.filter((r) => r.ts > since) })
    }
    if (p === '/api/agents' && req.method === 'GET') return json(res, 200, { agents: roster() })
    if (p === '/api/agents/lock' && req.method === 'POST') { if (viaTunnel) return json(res, 403, { error: 'local only' }); lockSouls(); return json(res, 200, { agents: roster() }) }
    if (p === '/api/engines' && req.method === 'GET') return json(res, 200, ledger())
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
    if (p === '/api/measured' && req.method === 'GET') return json(res, 200, measured({ analysesDir: ANALYSES, runDirs: [path.join(DATA, 'runs'), path.join(import.meta.dirname, '..', 'public', 'runs')] }))
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
  for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => Promise.allSettled([mcp.stopAll(), hub.stop()]).finally(() => process.exit(0)))
  setInterval(() => { try { routines.tick() } catch (e) { console.log('routines:', e.message) } }, 30000)
  if (EDGE) startEdge(PORT, EDGE)
  else console.log('edge: not configured (no ~/.config/picked/edge.env), the hosted UI will show the maintenance notice')
})
