import test from 'node:test'
import assert from 'node:assert/strict'
import { isPrivateIp, probeLlmsTxt, reviewPage } from '../pagereview.mjs'

const good = { title: 'Elmich thermal lunch box, 304 stainless steel', description: 'Thermal lunch boxes that keep food hot for six hours, made of 304 stainless steel with a twelve month warranty.', headings: [{ level: 1, text: 'Lunch box' }, { level: 2, text: 'Why Elmich?' }], text: 'giá 289.000đ ' + 'word '.repeat(320) + ' hotline 0901 234 567', schemaTypes: ['Organization', 'Product', 'FAQPage'], hasFaq: true, canonical: 'https://x.vn/', lang: 'vi' }

test('a complete page passes everything and scores 100', () => {
  const r = reviewPage(good, { llms: 'found' })
  assert.equal(r.score, 100); assert.ok(r.checks.every((c) => c.status === 'pass')); assert.match(r.summary, /No blocking gaps/)
})

test('an empty page fails the core checks and names what to fix first', () => {
  const r = reviewPage({})
  const by = Object.fromEntries(r.checks.map((c) => [c.id, c.status]))
  assert.equal(by.title, 'fail'); assert.equal(by['schema-org'], 'fail'); assert.equal(by.faq, 'fail'); assert.ok(r.score < 25)
  assert.match(r.summary, /Fix first: /)
  assert.deepEqual(reviewPage(undefined).checks.length, r.checks.length)
})

test('borderline values warn instead of fail and llms.txt is only reported when probed', () => {
  const r = reviewPage({ ...good, title: 'Hi', description: 'short', headings: [{ level: 1 }, { level: 1 }], text: 'a '.repeat(150) })
  const by = Object.fromEntries(r.checks.map((c) => [c.id, c.status]))
  assert.equal(by.title, 'warn'); assert.equal(by.description, 'warn'); assert.equal(by.h1, 'warn'); assert.equal(by.content, 'warn')
  assert.ok(!by.llms); assert.equal(Object.fromEntries(reviewPage(good, { llms: 'missing' }).checks.map((c) => [c.id, c.status])).llms, 'warn')
})

test('private and special addresses are recognised', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.9', '172.20.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) assert.equal(isPrivateIp(ip), true, ip)
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700::1111']) assert.equal(isPrivateIp(ip), false, ip)
})

test('llms.txt probe: refuses private hosts and odd ports, reads a public one, never throws', async () => {
  let calls = 0
  const ok = { status: 200, headers: { get: () => 'text/plain; charset=utf-8' } }
  const fetchImpl = async (u) => { calls++; return u.endsWith('/llms.txt') ? ok : { status: 404, headers: { get: () => '' } } }
  const pub = async () => [{ address: '93.184.216.34' }], priv = async () => [{ address: '10.0.0.5' }]
  assert.equal(await probeLlmsTxt('https://shop.vn/a/b', { fetchImpl, lookup: pub }), 'found')
  assert.equal(await probeLlmsTxt('https://shop.vn/', { fetchImpl: async () => ({ status: 404, headers: { get: () => '' } }), lookup: pub }), 'missing')
  const before = calls
  assert.equal(await probeLlmsTxt('http://intranet.local/', { fetchImpl, lookup: priv }), 'skipped')
  assert.equal(await probeLlmsTxt('http://127.0.0.1:8080/', { fetchImpl, lookup: pub }), 'skipped')
  assert.equal(await probeLlmsTxt('https://shop.vn:8443/', { fetchImpl, lookup: pub }), 'skipped')
  assert.equal(await probeLlmsTxt('ftp://x', { fetchImpl, lookup: pub }), 'skipped')
  assert.equal(await probeLlmsTxt('not a url', { fetchImpl, lookup: pub }), 'skipped')
  assert.equal(await probeLlmsTxt('https://shop.vn/', { fetchImpl: async () => { throw new Error('net') }, lookup: pub }), 'skipped')
  assert.equal(calls, before, 'no request for refused targets')
})
