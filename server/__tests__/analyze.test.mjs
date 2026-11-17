import test from 'node:test'
import assert from 'node:assert/strict'
import { STEPS, assertPublic, buildEvidence, createAnalyzer, distillRea, fallbackFindings, normalizeTarget, titleMatches, validateFindings } from '../analyze.mjs'

const pub = async () => [{ address: '93.184.216.34' }]

test('normalizeTarget: domains and URLs become https URLs, names are left for resolving, junk is refused', () => {
  assert.equal(normalizeTarget('elmich.vn').url, 'https://elmich.vn/'); assert.equal(normalizeTarget('https://www.locknlock.vn/vi').host, 'locknlock.vn')
  assert.deepEqual(normalizeTarget('Highlands Coffee'), { name: 'Highlands Coffee' })
  for (const bad of ['', '   ', 'ftp://x.vn', 'https://user:pw@x.vn', 'javascript:alert(1)']) assert.ok(normalizeTarget(bad).error || normalizeTarget(bad).name, bad)
  assert.ok(normalizeTarget('ftp://x.vn').error); assert.ok(normalizeTarget('https://user:pw@x.vn').error)
})

test('assertPublic: private, loopback and metadata hosts, odd ports and other schemes are refused', async () => {
  await assertPublic('https://shop.vn/', pub)
  for (const u of ['http://127.0.0.1/', 'http://localhost:5198/', 'http://169.254.169.254/latest', 'http://[::1]/', 'https://shop.vn:8443/', 'file:///etc/passwd'])
    await assert.rejects(() => assertPublic(u, async (h) => (h === 'localhost' ? [{ address: '127.0.0.1' }] : pub())), u)
  await assert.rejects(() => assertPublic('https://nope.invalid/', async () => []), /resolve/)
  await assert.rejects(() => assertPublic('https://sneaky.vn/', async () => [{ address: '93.184.216.34' }, { address: '10.0.0.5' }]), /public/)
})

test('titleMatches ignores accents and case and needs a real token', () => {
  assert.equal(titleMatches('Elmich | Gia dụng chuẩn Âu', 'Elmich'), true); assert.equal(titleMatches('Phở Thìn Bờ Hồ', 'pho thin'), true)
  assert.equal(titleMatches('Domain for sale', 'Elmich'), false); assert.equal(titleMatches('anything', ''), false); assert.equal(titleMatches('Do it', 'Do'), false)
})

const reaInspect = (extra = {}) => ({ evidence_id: 'ev_inspect', limitations: ['a', 'b', 'c'], normalized_result: { target: { title: 'T', url: 'https://shop.vn/' }, dom: { total_nodes: 7000, nodes: new Array(3).fill({}) }, accessibility: { total_nodes: 2000 }, scripts: { total: 3, items: [{ origin: 'https://shop.vn', url: 'https://shop.vn/a.js' }, { origin: 'https://cdn.tracker.io', url: 'https://cdn.tracker.io/x.js' }] }, resources: [{ origin: 'https://www.shop.vn', url: 'https://www.shop.vn/b.css' }, { origin: 'https://fonts.gstatic.com', url: 'https://fonts.gstatic.com/f.woff2' }], ...extra } })
test('distillRea keeps counts, third-party origins and endpoints, and never the raw capture', () => {
  const d = distillRea({ inspect: reaInspect(), bundle: { evidence_id: 'ev_b', normalized_result: { observations: { chunks: { nodes: [1, 2] }, endpoints: [{ value: '/cart.js' }, { value: '/cart.js' }, { value: 'utm_source' }] }, route_inventory: { routes: [] } } }, webmcp: { evidence_id: 'ev_w', normalized_result: { tools: [{}] } }, targets: [{ type: 'iframe', url: 'https://chat.vendor.com/w.html' }, { type: 'page', url: 'https://other.com/' }, { type: 'iframe', url: 'https://shop.vn/inner' }] }, 'https://shop.vn/')
  assert.equal(d.domNodes, 7000); assert.equal(d.a11yNodes, 2000); assert.deepEqual(d.endpoints, ['/cart.js']); assert.equal(d.chunks, 2); assert.equal(d.webmcpTools, 1)
  assert.deepEqual(d.thirdParty.map((t) => t.origin).sort(), ['https://cdn.tracker.io', 'https://chat.vendor.com', 'https://fonts.gstatic.com'])
  assert.deepEqual(d.evidence, { inspect: 'ev_inspect', bundle: 'ev_b', webmcp: 'ev_w' }); assert.ok(JSON.stringify(d).length < 2500)
  assert.equal(distillRea({}, 'https://shop.vn/').scripts, 0)
})

const scrape = { robots: 'read', sitemap_urls: 12, llms_txt: 'missing', pages: [{ url: 'https://shop.vn/', title: 'Shop | Home', description: 'x'.repeat(80), words: 900, h1: ['Shop'], jsonld_types: ['Organization'], prices: ['100.000đ'], phones: ['0901234567'], emails: [] }] }
const audit = { score: 62, blocked: false, checks: [{ id: 'llms-txt', title: 'llms.txt', status: 'fail', evidence: 'No llms.txt', fix: 'Publish one' }, { id: 'robots-valid', title: 'robots.txt', status: 'pass' }, { id: 'trust-pages', title: 'Trust pages', status: 'warn', evidence: 'No contact page', fix: 'Add one' }] }
test('buildEvidence gives every fact an id; only failing checks become evidence, REA keeps its real evidence id', () => {
  const ev = buildEvidence({ scrape, audit, rea: distillRea({ inspect: reaInspect(), bundle: null, webmcp: null }, 'https://shop.vn/') })
  const ids = ev.map((e) => e.id); assert.equal(new Set(ids).size, ids.length)
  for (const id of ['S1', 'S2', 'S3', 'S4', 'S5', 'A0', 'A:llms-txt', 'A:trust-pages', 'R1', 'R2', 'R3']) assert.ok(ids.includes(id), id)
  assert.ok(!ids.includes('A:robots-valid')); assert.equal(ev.find((e) => e.id === 'R1').ref, 'ev_inspect'); assert.deepEqual(buildEvidence({}), [])
})

test('validateFindings drops findings without real evidence, unknown layers and duplicates the cap', () => {
  const ids = ['S1', 'A:llms-txt']
  const out = validateFindings({ headline: 'h', findings: [{ layer: 'understand', title: 'ok', why: 'w', fix: 'f', evidence: ['A:llms-txt', 'MADE-UP'] }, { layer: 'trust', title: 'invented', why: 'w', fix: 'f', evidence: ['NOPE'] }, { layer: 'seo', title: 'bad layer', why: 'w', fix: 'f', evidence: ['S1'] }, { layer: 'reach', title: '', why: 'w', fix: 'f', evidence: ['S1'] }], strengths: [{ title: 's', evidence: ['S1'] }, { title: 'no source', evidence: [] }] }, ids)
  assert.deepEqual(out.findings.map((f) => f.title), ['ok']); assert.deepEqual(out.findings[0].evidence, ['A:llms-txt']); assert.equal(out.strengths.length, 1)
  assert.equal(validateFindings(null, ids).findings.length, 0)
})

test('fallbackFindings reports the failing checks in the audit own words, worst first', () => {
  const ev = buildEvidence({ audit }); const f = fallbackFindings(audit, ev).findings
  assert.deepEqual(f.map((x) => x.evidence[0]), ['A:llms-txt', 'A:trust-pages']); assert.equal(f[0].fix, 'Publish one'); assert.equal(f[0].layer, 'understand')
})

const collect = () => { const events = []; return { events, emit: (e) => events.push(e) } }
const okDeps = (over = {}) => ({ scrape: async () => scrape, audit: async () => audit, rea: async () => distillRea({ inspect: reaInspect(), bundle: null, webmcp: null }, 'https://shop.vn/'), synth: async () => ({ headline: 'Missing llms.txt', findings: [{ layer: 'understand', title: 'No llms.txt', why: 'w', fix: 'f', evidence: ['A:llms-txt'] }], strengths: [] }), assert: async () => {}, ...over })

test('a full run goes through the four steps in order and produces a complete report', async () => {
  const { events, emit } = collect()
  const r = await createAnalyzer(okDeps())({ id: 'a1', url: 'https://shop.vn/', emit })
  assert.deepEqual(events.filter((e) => e.type === 'an.step' && e.status === 'running').map((e) => e.step), STEPS.map((s) => s.id))
  assert.equal(events[0].type, 'an.start'); assert.equal(events.at(-1).type, 'an.done')
  assert.equal(r.partial, false); assert.equal(r.siteScore, 62); assert.equal(r.brand, 'Shop'); assert.equal(r.by, 'Ana'); assert.equal(r.findings.length, 1); assert.equal(r.layers.length, 3)
})

test('steps never overlap: each starts only after the previous one finished', async () => {
  const { events, emit } = collect(); let busy = 0, max = 0
  const slow = (f) => async (...a) => { busy++; max = Math.max(max, busy); await new Promise((r) => setTimeout(r, 15)); busy--; return f(...a) }
  await createAnalyzer(okDeps({ scrape: slow(async () => scrape), audit: slow(async () => audit), rea: slow(async () => distillRea({ inspect: reaInspect() }, 'https://shop.vn/')) }))({ id: 'a2', url: 'https://shop.vn/', emit })
  assert.equal(max, 1)
})

test('a failing step is reported and the rest still run: the report is partial, with a fallback when the model is down', async () => {
  const { events, emit } = collect()
  const r = await createAnalyzer(okDeps({ rea: async () => { throw new Error('browser would not start') }, synth: async () => { throw new Error('llm down') } }))({ id: 'a3', url: 'https://shop.vn/', emit })
  assert.equal(r.partial, true); assert.equal(r.status.rea, 'failed'); assert.equal(r.status.synth, 'failed'); assert.equal(r.status.audit, 'done')
  assert.equal(r.by, 'audit rules'); assert.ok(r.findings.length > 0); assert.equal(r.tools.rea, null)
  assert.equal(events.find((e) => e.step === 'rea' && e.status === 'failed').error, 'browser would not start')
})

test('skipped steps and a model that cites only invented evidence both fall back to audit findings', async () => {
  const { events, emit } = collect()
  const r = await createAnalyzer(okDeps({ synth: async () => ({ headline: 'x', findings: [{ layer: 'reach', title: 't', why: 'w', fix: 'f', evidence: ['INVENTED'] }], strengths: [] }) }))({ id: 'a4', url: 'https://shop.vn/', emit, skip: ['rea'] })
  assert.equal(r.status.rea, 'skipped'); assert.equal(r.by, 'audit rules'); assert.ok(r.findings.every((f) => f.evidence.every((id) => r.evidence.some((e) => e.id === id))))
})

test('a refused address ends the job before any tool runs', async () => {
  const { events, emit } = collect(); let called = 0
  const r = await createAnalyzer(okDeps({ assert: async () => { throw new Error('that address is not a public website') }, scrape: async () => { called++; return scrape } }))({ id: 'a5', url: 'http://10.0.0.1/', emit })
  assert.equal(r, null); assert.equal(called, 0); assert.equal(events.at(-1).type, 'an.error')
})

test('past the time ceiling the remaining steps are skipped instead of waited for', async () => {
  const { events, emit } = collect(); let t = 0
  const r = await createAnalyzer(okDeps({ now: () => t, scrape: async () => { t += 200000; return scrape } }))({ id: 'a6', url: 'https://shop.vn/', emit })
  assert.equal(r.status.scrape, 'done'); assert.equal(r.status.audit, 'skipped'); assert.equal(r.status.rea, 'skipped'); assert.equal(r.partial, true)
})

test('when the reader fails the model is still told the site name, never "undefined"', async () => {
  let brand = null; const { emit } = collect()
  await createAnalyzer(okDeps({ scrape: async () => { throw new Error('blocked') }, synth: async (b) => { brand = b; return { headline: '', findings: [], strengths: [] } } }))({ id: 'a7', url: 'https://www.shop.vn/', emit })
  assert.equal(brand, 'shop.vn')
})
