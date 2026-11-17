import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runAudit } from './audit.mjs'
import { buildQuestions, toEnglish } from './questions.mjs'
import { aliasesOf, norm, parseAnswer, summarize } from './parse.mjs'
import { auditSites } from './vendor/site-audit.mjs'
import { extractFacts, fetchSiteText } from './facts.mjs'
import { generateContent } from './content.mjs'
import { renderShopPage, slugify } from './shop.mjs'
import { checkContent } from './risk.mjs'
import { createApproval, decideApproval, qrDataUrl } from './approve.mjs'
import { edgeConfig } from './edge.mjs'
import { agentLlm } from './agents.mjs'
import { tally } from './council.mjs'

const ROOT = path.join(import.meta.dirname, '..')
const RUNS = [path.join(import.meta.dirname, 'data', 'runs'), path.join(ROOT, 'public', 'runs')]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export const lanIp = () => { for (const l of Object.values(os.networkInterfaces())) for (const i of l || []) if (i.family === 'IPv4' && !i.internal) return i.address; return '127.0.0.1' }

/** Saved research answers (a previous real Gemini run) replayed quickly, re-scored for this brand. */
async function reuseResearch(id, brand, total, emit) {
  const file = RUNS.map((d) => path.join(d, id + '.json')).find((f) => fs.existsSync(f))
  if (!file) throw new Error(`saved run ${id} not found`)
  const saved = JSON.parse(fs.readFileSync(file, 'utf8')), qs = saved.events.find((e) => e.type === 'run.start').questions.slice(0, total).map(toEnglish) // saved runs were asked in Vietnamese; show the English twin
  emit({ type: 'run.start', brand, category: saved.category, total: qs.length, tabs: 5, questions: qs, reused: id })
  const results = new Array(qs.length).fill(null), done = saved.events.filter((e) => e.type === 'q.done' && e.qi < qs.length)
  for (const e of done) {
    emit({ type: 'q.start', qi: e.qi, slot: e.qi % 5, q: toEnglish(e.q) })
    await sleep(140)
    results[e.qi] = { qi: e.qi, q: toEnglish(e.q), text: e.text, ms: e.ms, ...parseAnswer({ text: e.text, heads: [], cells: [], chips: e.domains }, brand) }
    emit({ type: 'q.done', ...results[e.qi] })
    emit({ type: 'run.progress', summary: summarize(results, brand, qs.length) })
  }
  const summary = summarize(results, brand, qs.length)
  emit({ type: 'research.done', summary, ms: 0 })
  return { summary, results }
}

/** Sources worth pitching: not the brand itself and not a competitor's own site. */
function pitchSources(sources, brand, competitors) {
  const bad = [brand, ...competitors.map((c) => c.name)].flatMap((b) => aliasesOf(b))
  return sources.filter((s) => !bad.some((a) => norm(s.domain).includes(a)))
}

const docText = {
  faq: (c) => c.faqs.map((f) => `Q: ${f.q}\nA: ${f.a}`).join('\n\n'),
  overview: (c) => `${c.overview.title}\n\n${c.overview.paragraphs.map((p) => p.text).join('\n\n')}`,
  pitch: (c) => `To: ${c.pitch.to}\nSubject: ${c.pitch.subject}\n\n${c.pitch.body.map((p) => p.text).join('\n\n')}`,
}
const TITLES = { faq: 'FAQ page', overview: 'About page', pitch: 'Review pitch email' }

/**
 * One run, end to end. `ctx.awaitDecision(id)` resolves when the owner decides (phone or canvas).
 * Every step emits events; `phase` events tell the canvas which department is working.
 */
export async function runPipeline(opts, emit, ctx) {
  const { brand, category, website, total = 40, tabs = 4, headed = false, reuse, autoApprove = false, measureOnly = false, signal } = opts
  const t0 = Date.now(), slug = slugify(brand)
  const publicBase = (process.env.PUBLIC_BASE || 'https://pickedhq.pages.dev').replace(/\/$/, '') + `/shops/${slug}/`
  const phase = async (name, work, minMs = 3200) => {
    emit({ type: 'phase', phase: name })
    const s = Date.now(); const r = await work?.()
    const rest = minMs - (Date.now() - s); if (rest > 0) await sleep(rest)
    return r
  }
  const safe = async (stage, fn) => { try { return await fn() } catch (e) { emit({ type: 'stage.error', stage, error: String(e.message || e).slice(0, 160) }); return null } }

  // website checks run in the background while Gemini answers (they do not depend on each other)
  const siteTask = website ? (async () => {
    const audit = await safe('site-audit', async () => {
      const r = await auditSites({ website, userAgent: 'PickedBot/1.0 (+https://pickedhq.pages.dev)', budget: { pages: 4, requests: 24, delayMs: 300 } })
      const s = r.sites[0]
      const out = { score: r.score, blocked: !!s?.blockedAudit, summary: s?.summary, pages: s?.pages ?? [], checks: (s?.checks ?? []).map((c) => ({ id: c.id, group: c.group, title: c.title, status: c.status, evidence: c.evidence, fix: c.fix })) }
      emit({ type: 'site.done', audit: out }); return out
    })
    const facts = await safe('facts', async () => {
      const site = await fetchSiteText(website, { maxPages: 5 })
      if (site.blocked || !site.pages.length) { emit({ type: 'facts.done', facts: null, note: site.blocked ? 'website blocks automated reading' : 'no readable pages' }); return null }
      const f = await extractFacts({ brand, website, site }, agentLlm('sy'))
      emit({ type: 'facts.done', facts: f, pages: site.pages.map((p) => ({ url: p.url, title: p.title })) }); return f
    })
    return { audit, facts }
  })() : Promise.resolve({ audit: null, facts: null })

  // 1–2 questions and research
  await phase('mining', async () => {})
  const questions = buildQuestions(category, total)
  emit({ type: 'questions', questions, brand, category, website })
  emit({ type: 'phase', phase: 'research' })
  const { summary, results } = reuse ? await reuseResearch(reuse, brand, total, emit) : await runAudit({ brand, category, total, tabs, headed, signal }, emit)

  // 3 analysis
  const missed = results.filter((r) => r && !r.error && !r.mentioned).map((r) => r.q)
  const sources = pitchSources(summary.sources, brand, summary.competitors)
  await phase('analysis', async () => emit({ type: 'analysis.done', missed, sources }), 5000)

  // scheduled re-checks only measure: nothing is drafted, asked for approval or published
  if (measureOnly) { await siteTask.catch(() => {}); emit({ type: 'run.done', summary, ms: Date.now() - t0, note: 'measured only' }); return { summary } }

  // 4 source of truth
  const { audit, facts } = await siteTask
  await phase('sync', async () => {}, facts || audit ? 6000 : 1500)
  if (!facts) { emit({ type: 'run.done', summary, ms: Date.now() - t0, note: 'no website facts, content step skipped' }); return { summary } }

  // 5 content
  const content = await phase('content', async () => {
    const c = await safe('content', () => generateContent({ brand, category, facts, missed, sources }, agentLlm('mira')))
    if (c) {
      let preview = {}
      try { const f = renderShopPage({ brand, slug, website, category, facts, content: c, baseUrl: publicBase, publishedAt: new Date().toISOString() }); preview = { llms: f['llms.txt'].slice(0, 1100) } } catch {}
      emit({ type: 'content.done', content: c, preview })
    }
    return c
  }, 3000)
  if (!content) { emit({ type: 'run.done', summary, ms: Date.now() - t0, note: 'content step failed' }); return { summary } }
  await phase('citations', async () => {}, 5000)

  // 6 risk gate
  emit({ type: 'phase', phase: 'qa' })
  let council = null
  const risk = await safe('risk', () => checkContent({ content, facts }, agentLlm('quinn', { onVotes: (votes, answers, asked) => { council = { votes, answers, asked } } })))
  if (council) emit({ type: 'risk.council', engines: council.answers, asked: council.asked, ...tally(council.votes), votes: council.votes })
  if (risk) emit({ type: 'risk.done', risk })
  await phase('risk', async () => {}, 6000)

  // 7 owner approval
  const docs = ['faq', 'overview', 'pitch'].map((key) => {
    const conf = risk ? risk.confidence[key] : 0
    const flags = [...(risk?.flags ?? []).filter((f) => f.doc === key).map((f) => `${f.type}: ${f.match}`), ...(risk?.pii ?? []).filter((f) => f.doc === key).map((f) => `pii ${f.type}`),
      ...(risk?.items ?? []).some((i) => i.doc === key && !i.supported) ? [`${risk.items.filter((i) => i.doc === key && !i.supported).length} sentence(s) not backed by a source`] : []]
    return { key, title: TITLES[key], summary: docText[key](content).slice(0, 1800), confidence: Math.round((conf <= 1 ? conf * 100 : conf)), flags }
  })
  emit({ type: 'phase', phase: 'approve' })
  const edge = edgeConfig()
  // with the edge on, the QR points at the hosted address so a phone anywhere can approve; otherwise the LAN address
  const baseUrl = edge ? edge.url : `http://${lanIp()}:${ctx.port}`
  const approval = createApproval({ runId: ctx.runId, brand, docs, baseUrl })
  emit({ type: 'approval.requested', approval: { id: approval.id, url: approval.url, qr: await qrDataUrl(approval.url), docs } })
  const pending = ctx.awaitDecision(approval.id)
  const decided = autoApprove ? decideApproval(approval.id, Object.fromEntries(docs.map((d) => [d.key, 'approve']))) : await pending
  emit({ type: 'approval.done', status: decided.status, decisions: decided.decisions })

  // 8 publish only what the owner approved
  const ok = (k) => decided.decisions?.[k] === 'approve'
  await phase('publish', async () => {
    if (!ok('faq') && !ok('overview')) { emit({ type: 'publish.done', skipped: true }); return }
    const approved = { ...content, faqs: ok('faq') ? content.faqs : [], overview: ok('overview') ? content.overview : { title: `${brand}`, paragraphs: content.overview.paragraphs.slice(0, 0) } }
    try {
      const files = renderShopPage({ brand, slug, website, category, facts, content: approved, baseUrl: publicBase, publishedAt: new Date().toISOString() })
      const dir = path.join(ROOT, 'public', 'shops', slug); fs.mkdirSync(dir, { recursive: true })
      for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body)
      emit({ type: 'publish.done', slug, files: Object.keys(files), localUrl: `http://localhost:5199/shops/${slug}/`, publicUrl: publicBase, qr: await qrDataUrl(publicBase) })
    } catch (e) { emit({ type: 'stage.error', stage: 'publish', error: String(e.message || e).slice(0, 160) }) }
  }, 5000)

  // 9 track and 10 impact
  const history = []
  for (const d of RUNS) if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) if (f.endsWith('.json') && f !== 'index.json') { try { const r = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')); if (r.summary) history.push({ id: r.id, brand: r.brand, startedAt: r.startedAt, mentioned: r.summary.mentioned, total: r.summary.total }) } catch {} }
  await phase('track', async () => emit({ type: 'track.done', baseline: summary, history: history.filter((h) => h.brand?.toLowerCase() === brand.toLowerCase()) }), 4500)
  await phase('impact', async () => {}, 6000)
  emit({ type: 'run.done', summary, ms: Date.now() - t0 })
  return { summary }
}
