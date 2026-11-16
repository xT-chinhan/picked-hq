// The criteria Picked measures, and what the measurements say. Pure functions over data the audit already collected:
// the 39 real site checks (robots, structured data, llms.txt…) and the 40 real Gemini answers (who is named, which sources are cited).
// Shared by the server and the browser, so the sheets work offline from the saved benchmark.

/** Four layers, from "can AI get in" to "was the shop chosen". `checks` are site-audit check ids; weight 1 unless set. */
export const LAYERS = [
  { id: 'reach', name: 'Reachable', question: 'Can AI crawlers get in?', kind: 'SEO + GEO basics',
    checks: ['robots-valid', 'robots-ai-search', 'robots-ai-user', 'bot-reachability', 'noindex', 'content-public', 'content-no-js', 'sitemap', 'redirect-hygiene', 'not-found'] },
  { id: 'understand', name: 'Understandable', question: 'Can AI tell what the shop is and sells?', kind: 'GEO',
    checks: ['json-ld-organization', 'json-ld-sameas', 'schema-breadth', 'metadata', 'document-structure', 'llms-txt', 'llms-full-txt'] },
  { id: 'trust', name: 'Quotable and trusted', question: 'Is there something worth citing?', kind: 'GEO + E-E-A-T',
    checks: ['citable-passages', 'authorship', 'trust-pages', 'content-freshness'] },
]
const SCORE = { pass: 1, warn: 0.5, fail: 0 }

/** Layer scores 0..100 for one audit (checks that were not run or are informational do not count either way). */
export function layerScores(audit) {
  const byId = new Map((audit?.checks ?? []).map((c) => [c.id, c]))
  return LAYERS.map((l) => {
    const rows = l.checks.map((id) => byId.get(id)).filter((c) => c && c.status in SCORE)
    const pts = rows.reduce((s, c) => s + SCORE[c.status], 0)
    return { id: l.id, name: l.name, score: rows.length ? Math.round((pts / rows.length) * 100) : null, counted: rows.length, passed: rows.filter((c) => c.status === 'pass').length, failed: rows.filter((c) => c.status === 'fail').map((c) => ({ id: c.id, title: c.title, evidence: c.evidence, fix: c.fix })), warned: rows.filter((c) => c.status === 'warn').map((c) => ({ id: c.id, title: c.title, evidence: c.evidence, fix: c.fix })) }
  })
}

/** Outcome layer from the Gemini answers: how often, how high, and how it depends on the answer citing sources. */
export function outcome(answers, brand) {
  const named = (e) => e.brands.includes(brand)
  const rank = (e) => e.brands.indexOf(brand) + 1
  const hit = answers.filter(named), withSrc = answers.filter((e) => e.domains.length), noSrc = answers.filter((e) => !e.domains.length)
  const rate = (sel) => (sel.length ? sel.filter(named).length / sel.length : null)
  return {
    total: answers.length, mentioned: hit.length, top3: hit.filter((e) => rank(e) <= 3).length, first: hit.filter((e) => rank(e) === 1).length,
    avgRank: hit.length ? +(hit.reduce((s, e) => s + rank(e), 0) / hit.length).toFixed(1) : null,
    withSources: { answers: withSrc.length, named: withSrc.filter(named).length, rate: rate(withSrc) },
    withoutSources: { answers: noSrc.length, named: noSrc.filter(named).length, rate: rate(noSrc) },
  }
}

/** Does being named depend on the answer retrieving third-party pages? Returns the gap in percentage points (null when a group is empty). */
export const sourceLift = (o) => (o.withSources.rate == null || o.withoutSources.rate == null ? null : Math.round((o.withSources.rate - o.withoutSources.rate) * 100))

/** Spearman rank correlation of two equal-length numeric lists (ties get the average rank). Returns null below 4 points. */
export function spearman(a, b) {
  if (a.length !== b.length || a.length < 4) return null
  const ranks = (v) => v.map((x) => { const lt = v.filter((y) => y < x).length, eq = v.filter((y) => y === x).length; return lt + (eq + 1) / 2 })
  const ra = ranks(a), rb = ranks(b), n = a.length
  const ma = ra.reduce((s, x) => s + x, 0) / n, mb = rb.reduce((s, x) => s + x, 0) / n
  const cov = ra.reduce((s, x, i) => s + (x - ma) * (rb[i] - mb), 0), va = ra.reduce((s, x) => s + (x - ma) ** 2, 0), vb = rb.reduce((s, x) => s + (x - mb) ** 2, 0)
  return va && vb ? +(cov / Math.sqrt(va * vb)).toFixed(2) : null
}

/**
 * The benchmark across brands: layer scores next to the mention count, how strongly each layer lines up with being named,
 * and the verdict the data supports. Honest about size: with a handful of brands this is a pattern, not a statistical proof.
 */
export function analyzeBenchmark(brands) {
  const rows = brands.filter((b) => b.audit && !b.audit.blocked).map((b) => ({ name: b.name, mentioned: b.mentioned, total: b.total, site: b.audit.score, layers: layerScores(b.audit) }))
  const mentions = rows.map((r) => r.mentioned)
  const corr = (pick) => { const xs = rows.map(pick); return xs.some((x) => x == null) ? null : spearman(xs, mentions) }
  const bySite = corr((r) => r.site), byLayer = Object.fromEntries(LAYERS.map((l, i) => [l.id, corr((r) => r.layers[i].score)]))
  const spread = Object.fromEntries(LAYERS.map((l, i) => { const v = rows.map((r) => r.layers[i].score).filter((x) => x != null); return [l.id, v.length ? Math.max(...v) - Math.min(...v) : null] }))
  const best = rows.length ? [...rows].sort((a, b) => b.site - a.site)[0] : null
  const strongest = rows.length ? [...rows].sort((a, b) => b.mentioned - a.mentioned)[0] : null
  return { rows, n: rows.length, correlation: { site: bySite, ...byLayer }, spread, bestSite: best?.name ?? null, mostNamed: strongest?.name ?? null,
    siteAloneExplains: bySite != null && bySite >= 0.8,
    note: rows.length < 8 ? `Only ${rows.length} brands: read this as a pattern to test, not as proof.` : '' }
}

const choose = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r }
/**
 * Two-sided Fisher exact p-value for two groups: `a` of `an` succeeded in the first, `b` of `bn` in the second.
 * Answers "is this gap bigger than chance?" without assuming anything about the data.
 */
export function fisherExact(a, an, b, bn) {
  const n = an + bn, k = a + b, p = (x) => (choose(an, x) * choose(bn, k - x)) / choose(n, k)
  const p0 = p(a); let sum = 0
  for (let x = Math.max(0, k - bn); x <= Math.min(an, k); x++) { const px = p(x); if (px <= p0 + 1e-12) sum += px }
  return Math.min(1, sum)
}
/** "p = 0.002", "p < 0.001" */
export const fmtP = (p) => (p < 0.001 ? 'p < 0.001' : `p = ${p.toFixed(p < 0.01 ? 3 : 2)}`)
