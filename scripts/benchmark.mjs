// Runs the same real site audit on every brand's website and stores the result next to the Gemini mention counts.
// Politeness: robots.txt is honoured by the auditor, 4 pages and 24 requests per site, 300 ms between requests, a named user agent.
import fs from 'node:fs'
import { auditSites } from '../server/vendor/site-audit.mjs'
import { BRANDS } from '../server/directory.mjs'

const run = JSON.parse(fs.readFileSync('public/runs/20261116070613-2h9.json', 'utf8'))
const { parseAnswer, summarize } = await import('../server/parse.mjs')
const answers = run.events.filter((e) => e.type === 'q.done')
const extra = [
  { name: 'Thermos', website: 'https://thermos.com.vn' }, { name: 'Tiger', website: 'https://www.tiger-corporation.com/vi/vnm/' }, { name: 'Inochi', website: 'https://inochi.vn' },
  { name: 'Hakawa', website: 'https://hakawa.vn' }, { name: 'Pigeon', website: 'https://pigeon.com.vn' }, { name: 'Stanley', website: 'https://www.stanley1913.com' },
  { name: 'Skater', website: 'https://skater.co.jp' }, { name: 'Hario', website: 'https://hario.com' }, { name: 'Kangaroo', website: 'https://kangaroo.vn' },
]
const prev = fs.existsSync('public/data/benchmark.json') ? JSON.parse(fs.readFileSync('public/data/benchmark.json', 'utf8')) : {}
const out = { published: prev.published, generatedAt: new Date().toISOString(), runId: run.id, category: run.category, brands: [] }
for (const b of [...BRANDS, ...extra]) {
  const results = answers.map((e) => ({ qi: e.qi, q: e.q, text: e.text, ...parseAnswer({ text: e.text, heads: [], cells: [], chips: e.domains }, b.name) }))
  const s = summarize(results, b.name, results.length)
  let audit = null, err = ''
  try { audit = await auditSites({ website: b.website, userAgent: 'PickedBot/1.0 (+https://pickedhq.pages.dev)', budget: { pages: 4, requests: 24, delayMs: 300 } }) } catch (e) { err = String(e.message || e).slice(0, 120) }
  const site = audit?.sites?.[0]
  const row = { name: b.name, website: b.website, mentioned: s.mentioned, total: s.total, top3: s.top3, avgRank: s.avgRank, error: err,
    audit: site && { score: audit.score, blocked: !!site.blockedAudit, checks: (site.checks ?? []).map((c) => ({ id: c.id, group: c.group, title: c.title, status: c.status, evidence: c.evidence, fix: c.fix })) } }
  out.brands.push(row)
  console.log(b.name.padEnd(10), `${s.mentioned}/${s.total}`.padStart(6), row.audit ? `site ${row.audit.score}` : `no audit: ${err}`, row.audit?.blocked ? '(blocked)' : '')
}
fs.mkdirSync('public/data', { recursive: true })
fs.writeFileSync('public/data/benchmark.json', JSON.stringify(out))
