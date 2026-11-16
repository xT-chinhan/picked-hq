import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { LAYERS, analyzeBenchmark, fisherExact, fmtP, layerScores, outcome, sourceLift, spearman } from '../criteria.mjs'

const chk = (id, status) => ({ id, status, title: id, evidence: `${id} evidence`, fix: `fix ${id}` })

test('layer score counts pass as 1, warn as half, fail as 0 and ignores info and not_checked', () => {
  const audit = { checks: [chk('robots-valid', 'pass'), chk('robots-ai-search', 'warn'), chk('robots-ai-user', 'fail'), chk('sitemap', 'info'), chk('noindex', 'not_checked')] }
  const reach = layerScores(audit)[0]
  assert.equal(reach.score, 50); assert.equal(reach.counted, 3); assert.equal(reach.passed, 1)
  assert.deepEqual(reach.failed.map((f) => f.id), ['robots-ai-user']); assert.equal(reach.failed[0].fix, 'fix robots-ai-user'); assert.equal(reach.warned.length, 1)
})

test('a layer with nothing measurable scores null, and a missing audit does not crash', () => {
  assert.ok(layerScores({ checks: [] }).every((l) => l.score === null))
  assert.equal(layerScores(undefined).length, LAYERS.length)
})

test('every check id belongs to one layer only', () => {
  const all = LAYERS.flatMap((l) => l.checks); assert.equal(new Set(all).size, all.length)
})

const ans = (brands, domains = []) => ({ brands, domains })
test('outcome counts mentions, top three, first place, average rank and the split by cited sources', () => {
  const a = [ans(['X', 'A'], ['s']), ans(['A', 'X', 'B'], ['s']), ans(['A', 'B', 'C', 'X']), ans(['A']), ans(['B', 'X'], [])]
  const o = outcome(a, 'X')
  assert.equal(o.mentioned, 4); assert.equal(o.top3, 3); assert.equal(o.first, 1); assert.equal(o.avgRank, 2.3) // ranks 1, 2, 4, 2 -> 2.25
  assert.deepEqual([o.withSources.answers, o.withSources.named], [2, 2]); assert.deepEqual([o.withoutSources.answers, o.withoutSources.named], [3, 2])
  assert.equal(sourceLift(o), 33)
  assert.equal(outcome([], 'X').avgRank, null); assert.equal(sourceLift(outcome([ans(['X'], ['s'])], 'X')), null)
})

test('spearman: perfect, inverse, ties and too few points', () => {
  assert.equal(spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1); assert.equal(spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1)
  assert.equal(spearman([1, 1, 1, 1], [1, 2, 3, 4]), null); assert.equal(spearman([1, 2, 3], [1, 2, 3]), null)
})

test('Fisher exact matches known values and stays within 0..1', () => {
  assert.ok(Math.abs(fisherExact(33, 40, 19, 40) - 0.002) < 0.0006)
  assert.ok(Math.abs(fisherExact(12, 20, 7, 20) - 0.2) < 0.02)
  assert.equal(fisherExact(5, 10, 5, 10), 1); assert.ok(fisherExact(0, 10, 10, 10) < 0.001)
  assert.equal(fmtP(0.0004), 'p < 0.001'); assert.equal(fmtP(0.002), 'p = 0.002'); assert.equal(fmtP(0.2), 'p = 0.20')
})

test('benchmark verdict: blocked sites are left out and a small sample is labelled as a pattern', () => {
  const mk = (name, mentioned, status, blocked = false) => ({ name, mentioned, total: 40, audit: { score: 50, blocked, checks: [chk('robots-valid', status)] } })
  const r = analyzeBenchmark([mk('A', 30, 'pass'), mk('B', 20, 'pass'), mk('C', 10, 'warn'), mk('D', 5, 'fail'), mk('E', 1, 'pass', true), { name: 'F', mentioned: 9, total: 40 }])
  assert.equal(r.n, 4); assert.equal(r.mostNamed, 'A'); assert.match(r.note, /Only 4 brands/)
})

test('the saved benchmark is consistent: every audited brand has 39 checks and the pitch brand is present', () => {
  const b = JSON.parse(fs.readFileSync('public/data/benchmark.json', 'utf8'))
  const audited = b.brands.filter((x) => x.audit); assert.ok(audited.length >= 4)
  for (const x of audited) { assert.equal(x.audit.checks.length, 39, x.name); assert.ok(x.mentioned <= x.total) }
  assert.ok(b.brands.some((x) => x.name === 'Elmich')); assert.ok(b.published?.audit?.checks.length === 39)
})
