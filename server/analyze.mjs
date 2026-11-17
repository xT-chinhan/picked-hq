// "Analyze any business": a job that takes one company (a website or a name) and, step by step, reads it with real tools:
//   Scrapling  - polite page reader (content, structured data, prices, contact, llms.txt)
//   Site audit - the 39 agent-readiness checks
//   REA        - reverse-engineers the live page in a real browser (scripts, third-party code, DOM weight, endpoints)
//   Ana        - turns that evidence into findings; every finding must cite evidence ids, and uncited ones are dropped
// One step at a time (this machine has been rebooted by parallel heavy jobs), each with its own timeout, and a hard ceiling for
// the whole job: whatever finished is reported, marked partial, never a hang.
import { execFile } from 'node:child_process'
import dns from 'node:dns/promises'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { layerScores } from './criteria.mjs'
import { isPrivateIp } from './pagereview.mjs'

const HERE = import.meta.dirname
const PY = path.join(HERE, 'py', '.venv', 'bin', 'python')
export const STEPS = [
  { id: 'scrape', tool: 'Scrapling', label: 'Read the site', ms: 45000 },
  { id: 'audit', tool: 'Site audit', label: 'Run 39 agent-readiness checks', ms: 60000 },
  { id: 'rea', tool: 'REA', label: 'Reverse-engineer the live page', ms: 60000 },
  { id: 'synth', tool: 'Ana', label: 'Write the findings', ms: 45000 },
]
const CEILING_MS = 170000

/* ───────────── target ───────────── */
/** A website or domain typed by a person becomes an https URL; anything else is a company name that still has to be resolved. */
export function normalizeTarget(input) {
  const raw = String(input ?? '').trim().slice(0, 200)
  if (!raw) return { error: 'Type a website or a company name.' }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) && !/^https?:\/\//i.test(raw) || /^(javascript|data|file|vbscript|blob):/i.test(raw)) return { error: 'Only plain http(s) addresses are accepted.' }
  const looksUrl = /^https?:\/\//i.test(raw) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(raw)
  if (!looksUrl) return { name: raw }
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    if (!/^https?:$/.test(u.protocol) || u.username || u.password) return { error: 'Only plain http(s) addresses are accepted.' }
    u.hash = ''
    return { url: u.href, host: u.hostname.replace(/^www\./, '') }
  } catch { return { error: 'That does not look like a web address.' } }
}

/** Refuses anything that is not a public web host (private ranges, loopback, link-local, metadata), resolving names first. */
export async function assertPublic(url, lookup = dns.lookup) {
  const u = new URL(url)
  if (!/^https?:$/.test(u.protocol)) throw new Error('only http and https are allowed')
  if (u.port && !['80', '443'].includes(u.port)) throw new Error('only the standard web ports are allowed')
  const host = u.hostname.replace(/^\[|\]$/g, '')
  const ips = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true })
  if (!ips.length) throw new Error('that name does not resolve')
  if (ips.some((x) => isPrivateIp(x.address))) throw new Error('that address is not a public website')
  return u
}

const strip = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
/** Does the page title mention the company? Guards against resolving a name to the wrong site. */
export const titleMatches = (title, name) => { const t = strip(title), tokens = strip(name).split(/[^a-z0-9]+/).filter((x) => x.length > 2); return tokens.length > 0 && tokens.some((x) => t.includes(x)) }

/** Resolves a company name to its official website with the LLM, then checks the homepage title names the company. */
export async function resolveName(name, { llm, fetchTitle }) {
  const out = await llm.agyJson({
    schema: { type: 'object', additionalProperties: false, required: ['website', 'name'], properties: { website: { type: 'string' }, name: { type: 'string' } } },
    prompt: `Give the official website (home page URL) of this business and its short name. If you are not sure it exists, answer with an empty website.\nBusiness: ${String(name).slice(0, 120)}\nBusinesses are usually Vietnamese; prefer the Vietnamese site.`,
  })
  const t = normalizeTarget(out.website)
  if (!t.url) return { name: out.name || name, unresolved: true }
  let title = ''; try { title = await fetchTitle(t.url) } catch { /* the check below reports it */ }
  return { name: out.name || name, url: t.url, host: t.host, title, verified: titleMatches(title, out.name || name) }
}

/* ───────────── distilling REA ───────────── */
const origin = (u) => { try { return new URL(u).origin } catch { return '' } }
/** Keeps what matters for a reader of the report: counts, third-party origins, endpoints. Never the megabyte of raw capture. */
export function distillRea({ inspect, bundle, webmcp, targets = [] }, pageUrl) {
  const home = origin(pageUrl), baseHost = (() => { try { return new URL(pageUrl).hostname.replace(/^www\./, '').split('.').slice(-2).join('.') } catch { return '' } })()
  const sameSite = (o) => { try { return new URL(o).hostname.endsWith(baseHost) } catch { return false } }
  const ins = inspect?.normalized_result ?? {}, bun = bundle?.normalized_result ?? {}
  const scripts = ins.scripts?.items ?? [], resources = ins.resources ?? []
  const third = new Map()
  for (const x of [...scripts, ...resources]) { const o = x.origin || origin(x.url); if (o && o !== home && !sameSite(o)) third.set(o, (third.get(o) ?? 0) + 1) }
  // iframes and workers the page opened (a chat widget, a tracker): REA only sees traffic after it attaches, the browser's target list shows what was loaded
  for (const t of targets) { if (!/^(iframe|worker|service_worker|shared_worker)$/.test(t.type)) continue; const o = origin(t.url); if (o && /^https?:/.test(o) && o !== home && !sameSite(o)) third.set(o, (third.get(o) ?? 0) + 1) }
  const endpoints = [...new Set((bun.observations?.endpoints ?? []).map((e) => e.value).filter((v) => typeof v === 'string' && v.startsWith('/')))].slice(0, 8)
  return {
    title: ins.target?.title ?? '', url: ins.target?.url ?? pageUrl,
    domNodes: ins.dom?.total_nodes ?? null, a11yNodes: ins.accessibility?.total_nodes ?? null,
    scripts: ins.scripts?.total ?? scripts.length, resources: resources.length,
    thirdParty: [...third.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([o, n]) => ({ origin: o, items: n })),
    chunks: bun.observations?.chunks?.nodes?.length ?? null, routes: bun.route_inventory?.routes?.length ?? null, endpoints,
    webmcpTools: Array.isArray(webmcp?.normalized_result?.tools) ? webmcp.normalized_result.tools.length : 0,
    evidence: { inspect: inspect?.evidence_id ?? null, bundle: bundle?.evidence_id ?? null, webmcp: webmcp?.evidence_id ?? null },
    observationLimits: (inspect?.limitations ?? []).slice(0, 2).map((x) => String(x).slice(0, 120)),
  }
}

/* ───────────── evidence ───────────── */
/** Every fact the report may cite, each with a short id. The model may cite only these. */
export function buildEvidence({ scrape, audit, rea }) {
  const ev = []
  const add = (id, source, label, detail, ref) => ev.push({ id, source, label, detail: String(detail).slice(0, 240), ...(ref ? { ref } : {}) })
  if (scrape) {
    const p = scrape.pages?.[0]
    if (p) {
      add('S1', 'Scrapling', 'Home page', `Title "${p.title}"; description ${p.description ? `${p.description.length} characters` : 'missing'}; ${p.words} words; ${p.h1.length} H1`)
      add('S2', 'Scrapling', 'Structured data', scrape.pages.some((x) => x.jsonld_types.length) ? `JSON-LD types found: ${[...new Set(scrape.pages.flatMap((x) => x.jsonld_types))].join(', ')}` : 'No JSON-LD found on the pages read')
      const prices = [...new Set(scrape.pages.flatMap((x) => x.prices))].slice(0, 4), phones = scrape.pages.flatMap((x) => x.phones)
      add('S3', 'Scrapling', 'Prices and contact', `${prices.length ? `Prices visible (${prices.join(', ')})` : 'No price in the text'}; ${phones.length || scrape.pages.some((x) => x.emails.length) ? 'contact details present' : 'no contact details in the text'}`)
      add('S4', 'Scrapling', 'Crawl files', `robots.txt ${scrape.robots}; sitemap ${scrape.sitemap_urls ? `${scrape.sitemap_urls} URLs` : 'not parsed'}; llms.txt ${scrape.llms_txt}`)
      add('S5', 'Scrapling', 'Pages read', `${scrape.pages.length} pages: ${scrape.pages.map((x) => new URL(x.url).pathname || '/').slice(0, 5).join(' ')}`)
    }
  }
  if (audit?.checks?.length) {
    add('A0', 'Site audit', 'Audit score', `${audit.score ?? '?'}/100 on ${audit.checks.length} checks`)
    for (const c of audit.checks.filter((x) => x.status === 'fail' || x.status === 'warn').slice(0, 14)) add(`A:${c.id}`, 'Site audit', c.title, `${c.status.toUpperCase()}: ${c.evidence ?? ''}${c.fix ? ` Fix: ${c.fix}` : ''}`)
  }
  if (rea) {
    add('R1', 'REA', 'Live page weight', `${rea.domNodes ?? '?'} DOM nodes, ${rea.a11yNodes ?? '?'} accessibility nodes, ${rea.scripts} scripts, ${rea.resources} resources`, rea.evidence.inspect)
    add('R2', 'REA', 'Third-party code', rea.thirdParty.length ? `Loads code from ${rea.thirdParty.length} other origins: ${rea.thirdParty.map((t) => new URL(t.origin).hostname).slice(0, 5).join(', ')}` : 'No third-party origins seen in the capture window', rea.evidence.inspect)
    add('R3', 'REA', 'Application internals', `${rea.chunks ?? '?'} script chunks analysed; endpoints seen: ${rea.endpoints.length ? rea.endpoints.join(', ') : 'none'}`, rea.evidence.bundle)
    if (rea.evidence.webmcp) add('R4', 'REA', 'WebMCP tools', rea.webmcpTools ? `${rea.webmcpTools} agent-callable tools declared by the page` : 'The page declares no agent-callable (WebMCP) tools', rea.evidence.webmcp)
  }
  return ev
}

const LAYER_OF = { reach: 'reach', understand: 'understand', trust: 'trust' }
/** Keeps findings that name a real layer and cite at least one real evidence id; unknown ids are removed, not trusted. */
export function validateFindings(raw, evidenceIds) {
  const ok = new Set(evidenceIds), clean = (list, need) => (Array.isArray(list) ? list : []).map((f) => ({ ...f, evidence: (Array.isArray(f.evidence) ? f.evidence : []).filter((id) => ok.has(id)) })).filter((f) => f.evidence.length && f.title && (!need || LAYER_OF[f.layer]))
  const findings = clean(raw?.findings, true).slice(0, 6).map((f) => ({ layer: f.layer, title: String(f.title).slice(0, 80), why: String(f.why ?? '').slice(0, 220), fix: String(f.fix ?? '').slice(0, 220), evidence: f.evidence }))
  const strengths = clean(raw?.strengths, false).slice(0, 3).map((f) => ({ title: String(f.title).slice(0, 80), evidence: f.evidence }))
  return { headline: String(raw?.headline ?? '').slice(0, 120), findings, strengths }
}

/** Without a model the report is still honest: the failing checks themselves, in the audit's own words. */
export function fallbackFindings(audit, evidence) {
  const have = new Set(evidence.map((e) => e.id)), layerOf = (id) => ({ reach: 'reach', understand: 'understand', trust: 'trust' })[Object.entries({ reach: ['robots', 'sitemap', 'noindex', 'content', 'redirect', 'not-found', 'bot'], understand: ['json-ld', 'schema', 'metadata', 'llms', 'document'], trust: ['citable', 'author', 'trust', 'fresh'] }).find(([, ks]) => ks.some((k) => id.includes(k)))?.[0]] ?? 'understand'
  const findings = (audit?.checks ?? []).filter((c) => (c.status === 'fail' || c.status === 'warn') && have.has(`A:${c.id}`)).sort((a, b) => (a.status === 'fail' ? 0 : 1) - (b.status === 'fail' ? 0 : 1)).slice(0, 5)
    .map((c) => ({ layer: layerOf(c.id), title: c.title, why: String(c.evidence ?? '').slice(0, 200), fix: String(c.fix ?? '').slice(0, 200), evidence: [`A:${c.id}`] }))
  return { headline: '', findings, strengths: [] }
}

const SYNTH_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['headline', 'findings', 'strengths'],
  properties: {
    headline: { type: 'string' },
    findings: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['layer', 'title', 'why', 'fix', 'evidence'], properties: { layer: { type: 'string', enum: ['reach', 'understand', 'trust'] }, title: { type: 'string' }, why: { type: 'string' }, fix: { type: 'string' }, evidence: { type: 'array', items: { type: 'string' } } } } },
    strengths: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'evidence'], properties: { title: { type: 'string' }, evidence: { type: 'array', items: { type: 'string' } } } } },
  },
}
const synthPrompt = (brand, evidence) => `Business: ${brand}\nBelow is the complete evidence collected by real tools (id, source, what, detail). Write the analysis of how well AI assistants can find, understand and quote this business.\n
Rules: use ONLY this evidence; every finding and strength must list the evidence ids it rests on (copy the ids exactly); no invented numbers; plain English, short.
- headline: one sentence, at most 14 words, naming the single biggest issue or the main strength.
- findings: at most 5, most important first. layer is reach (can AI crawlers get in), understand (can AI tell what it is and sells), trust (is there something worth quoting). why and fix: one short sentence each.
- strengths: at most 3.\n\nEVIDENCE:\n${JSON.stringify(evidence.map(({ id, source, label, detail }) => ({ id, source, label, detail })))}`

/* ───────────── real tool runners ───────────── */
function run(cmd, args, { timeoutMs, env } = {}) {
  return new Promise((resolve, reject) => {
    const p = execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, ...env } }, (err, stdout, stderr) => {
      if (err) return reject(new Error(err.killed ? `timed out after ${Math.round(timeoutMs / 1000)}s` : String(stderr || err.message).split('\n').filter(Boolean).slice(-1)[0]?.slice(0, 160) || 'failed'))
      try { resolve(JSON.parse(stdout.trim().split('\n').filter(Boolean).slice(-1)[0])) } catch { reject(new Error('the tool did not return JSON')) }
    })
    p.stdin?.end()
  })
}
export const runScrape = (url, timeoutMs) => (fs.existsSync(PY) ? run(PY, [path.join(HERE, 'py', 'scrape.py'), url], { timeoutMs }) : Promise.reject(new Error('Scrapling is not installed (run scripts/setup-python.sh)')))
export const runAudit = (url, timeoutMs) => run(process.execPath, ['--no-network-family-autoselection', path.join(HERE, 'audit-site.mjs'), url], { timeoutMs })

const guardCache = new Map()
async function hostIsPublic(host, lookup) {
  const key = host.toLowerCase(); if (guardCache.has(key)) return guardCache.get(key)
  let ok = false
  try { ok = net.isIP(host) ? !isPrivateIp(host) : (await lookup(host, { all: true })).every((x) => !isPrivateIp(x.address)) } catch { ok = false }
  guardCache.set(key, ok); return ok
}
async function freePort() { return new Promise((res, rej) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)) }); s.on('error', rej) }) }

/**
 * Opens the page in a throwaway headless Chrome that exposes a loopback DevTools port (what REA attaches to) and refuses to
 * load anything from a private address, then runs `fn({ endpoint, targetId })`. The browser is always closed.
 */
export async function withBrowser(url, fn, { lookup = dns.lookup, executablePath = process.env.CHROME_BIN || '/usr/bin/google-chrome' } = {}) {
  const port = await freePort()
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'] })
  try {
    const ctx = await browser.newContext({ userAgent: undefined, viewport: { width: 1280, height: 800 } })
    await ctx.route('**/*', async (route) => {
      try { const u = new URL(route.request().url()); if (!/^(https?|data|blob):$/.test(u.protocol) || (u.protocol.startsWith('http') && !(await hostIsPublic(u.hostname.replace(/^\[|\]$/g, ''), lookup)))) return route.abort('blockedbyclient') } catch { return route.abort() }
      return route.continue()
    })
    const page = await ctx.newPage()
    await page.goto(url, { waitUntil: 'load', timeout: 30000 }).catch(() => {})
    await page.waitForTimeout(1500)
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    const target = list.find((t) => t.type === 'page' && t.url && !t.url.startsWith('about:') && !t.url.startsWith('devtools'))
    if (!target) throw new Error('the page did not open')
    return await fn({ endpoint: `http://127.0.0.1:${port}`, targetId: target.id, finalUrl: page.url(), targets: list })
  } finally { await browser.close().catch(() => {}) }
}

async function ensureRea(mcp, catalogEntry) {
  const cur = mcp.list().find((s) => s.name === 'rea')
  if (cur?.status === 'ready') return
  if (!catalogEntry) throw new Error('REA is not installed on this machine')
  if (!cur) mcp.add({ name: 'rea', command: catalogEntry.command, args: catalogEntry.args, env: catalogEntry.env ?? {} })
  await mcp.connect('rea', { timeoutMs: 45000 })
}
const parse = (r) => { try { return JSON.parse(r.text) } catch { return null } }

/** The REA step: inspect the live page, analyse its bundle, list WebMCP tools. Raw output is distilled before it leaves this function. */
export async function runRea(url, { mcp, catalogEntry, lookup }) {
  await ensureRea(mcp, catalogEntry)
  return withBrowser(url, async ({ endpoint, targetId, finalUrl, targets }) => {
    const base = { cdp_endpoint: endpoint, target_id: targetId, observation_ms: 1200 }
    const off = { include_accessibility_text: false, include_console_text: false, include_json_body_shapes: false, include_websocket_shapes: false, include_storage_keys: false, include_storage_fingerprints: false, include_script_sources: false }
    const warnings = []
    const tool = async (name, args, timeoutMs) => {
      try { return parse(await mcp.call('rea', name, args, { timeoutMs })) } catch (e) { warnings.push(`${name}: ${String(e.message || e).slice(0, 140)}`); return null }
    }
    const inspect = await tool('inspect_web_page', { ...base, ...off }, 40000)
    // the bundle analysis needs the script sources (its whole point); its result is small, unlike the page inspection's
    const bundle = await tool('analyze_web_bundle', { ...base, fetch_source_maps: false }, 40000)
    const webmcp = await tool('discover_webmcp_tools', { ...base, observation_ms: 600 }, 20000)
    if (!inspect) throw new Error('REA returned nothing readable')
    return { ...distillRea({ inspect, bundle, webmcp, targets }, finalUrl || url), warnings }
  }, { lookup })
}

/* ───────────── the job ───────────── */
/**
 * deps: { scrape(url,ms), audit(url,ms), rea(url), synth(brand, evidence), now?, assert? } - all injectable, so the order,
 * the timeouts and the partial result can be tested without a network.
 */
export function createAnalyzer(deps) {
  const now = deps.now ?? Date.now, assert = deps.assert ?? assertPublic
  const withTimeout = (p, ms, label) => { let t; return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms) })]).finally(() => clearTimeout(t)) }
  return async function analyze({ id, url, emit, signal, skip = [] }) {
    const t0 = now(), data = {}, status = {}
    emit({ type: 'an.start', id, url, host: new URL(url).hostname.replace(/^www\./, ''), steps: STEPS })
    try { await assert(url) } catch (e) { emit({ type: 'an.error', error: String(e.message || e) }); return null }
    for (const s of STEPS) {
      if (signal?.aborted) break
      if (now() - t0 > CEILING_MS) { status[s.id] = 'skipped'; emit({ type: 'an.step', step: s.id, status: 'skipped', note: 'time ceiling reached' }); continue }
      if (skip.includes(s.id)) { status[s.id] = 'skipped'; emit({ type: 'an.step', step: s.id, status: 'skipped', note: 'not available here' }); continue }
      if (s.id === 'synth' && !Object.keys(data).length) { status.synth = 'skipped'; emit({ type: 'an.step', step: 'synth', status: 'skipped', note: 'nothing to analyse' }); continue }
      const s0 = now(); emit({ type: 'an.step', step: s.id, status: 'running' })
      try {
        let out
        if (s.id === 'scrape') out = await withTimeout(deps.scrape(url, s.ms), s.ms + 2000, s.tool)
        else if (s.id === 'audit') out = await withTimeout(deps.audit(url, s.ms), s.ms + 2000, s.tool)
        else if (s.id === 'rea') out = await withTimeout(deps.rea(url), s.ms, s.tool)
        else { const evidence = buildEvidence(data); out = await withTimeout(deps.synth(data.brand ?? new URL(url).hostname.replace(/^www\./, ''), evidence), s.ms, s.tool) }
        if (s.id !== 'synth') data[s.id] = out
        if (s.id === 'scrape') data.brand = out.pages?.[0]?.site_name || out.pages?.[0]?.title?.split(/[|\-–—:]/)[0]?.trim() || new URL(url).hostname.replace(/^www\./, '')
        status[s.id] = 'done'; emit({ type: 'an.step', step: s.id, status: 'done', ms: now() - s0, data: s.id === 'synth' ? undefined : brief(s.id, out) })
        if (s.id === 'synth') data.synth = out
      } catch (e) { status[s.id] = 'failed'; emit({ type: 'an.step', step: s.id, status: 'failed', ms: now() - s0, error: String(e.message || e).slice(0, 160) }) }
    }
    const evidence = buildEvidence(data)
    const report = {
      id, url, brand: data.brand ?? new URL(url).hostname.replace(/^www\./, ''), finishedAt: now(), ms: now() - t0, status, partial: Object.values(status).some((v) => v !== 'done'),
      siteScore: data.audit?.score ?? null, blocked: !!data.audit?.blocked, layers: data.audit?.checks?.length ? layerScores(data.audit).map(({ id, name, score, counted, passed }) => ({ id, name, score, counted, passed })) : [],
      evidence, ...(data.synth ? { ...validateFindings(data.synth, evidence.map((e) => e.id)), by: 'Ana' } : { ...fallbackFindings(data.audit, evidence), by: 'audit rules' }),
      tools: { scrape: data.scrape ? { pages: data.scrape.pages?.length ?? 0, robots: data.scrape.robots, llms: data.scrape.llms_txt } : null, rea: data.rea ? { domNodes: data.rea.domNodes, scripts: data.rea.scripts, thirdParty: data.rea.thirdParty.length, evidence: data.rea.evidence } : null },
    }
    if (data.synth && !report.findings.length) Object.assign(report, fallbackFindings(data.audit, evidence), { by: 'audit rules' })
    emit({ type: 'an.done', report })
    return report
  }
}
function brief(step, out) {
  if (step === 'scrape') return { pages: out.pages?.length ?? 0, title: out.pages?.[0]?.title ?? '', robots: out.robots, llms: out.llms_txt, jsonld: [...new Set((out.pages ?? []).flatMap((p) => p.jsonld_types))].slice(0, 6), words: (out.pages ?? []).reduce((n, p) => n + p.words, 0) }
  if (step === 'audit') return { score: out.score, blocked: out.blocked, pass: out.checks.filter((c) => c.status === 'pass').length, warn: out.checks.filter((c) => c.status === 'warn').length, fail: out.checks.filter((c) => c.status === 'fail').length, issues: out.checks.filter((c) => c.status === 'fail').concat(out.checks.filter((c) => c.status === 'warn')).slice(0, 5).map((c) => ({ s: c.status, t: c.title, d: String(c.evidence ?? '').slice(0, 110) })) }
  return { domNodes: out.domNodes, scripts: out.scripts, thirdParty: out.thirdParty.length, endpoints: out.endpoints.length, evidence: out.evidence.inspect }
}

export { SYNTH_SCHEMA, synthPrompt }
