import test from 'node:test'
import assert from 'node:assert/strict'
import { extractIdentity, consistency, patches, normPhone, platformOf, discover } from '../copilot.mjs'

const HTML = `<html><head><title>Elmich | Gia dụng</title><meta property="og:site_name" content="Elmich Việt Nam"><meta name="description" content="Đồ gia dụng chuẩn Âu">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Elmich Việt Nam","telephone":"+84 1900636925","sameAs":["https://www.facebook.com/ElmichVietNam"]}</script></head>
<body><a href="https://www.facebook.com/ElmichVietNam">FB</a><a href="https://zalo.me/elmichvn">Zalo</a><a href="https://www.facebook.com/sharer/sharer.php?u=x">share</a>
<a href="/about">Về chúng tôi</a><a href="tel:1900636925">1900 636 925</a> Địa chỉ: 12 Ngô Gia Bảy, Ninh Bình  Hotline 1900 636 925  MST 0101234567</body></html>`

test('phones are compared in one shape (+84, spaces, 1900 hotlines)', () => {
  assert.equal(normPhone('+84 1900 636 925'), '1900636925')
  assert.equal(normPhone('+84 28 5413 5750'), '02854135750')
  assert.equal(normPhone('0283.810.6968'), '02838106968')
})
test('platforms are recognised from links, and share buttons are not profiles', () => {
  assert.equal(platformOf('https://www.facebook.com/ElmichVietNam'), 'facebook')
  assert.equal(platformOf('https://zalo.me/elmichvn'), 'zalo')
  assert.equal(platformOf('https://www.google.com/search?q=x'), null)
  const id = extractIdentity(HTML, 'https://elmich.vn/')
  assert.equal(id.profiles.facebook, 'https://www.facebook.com/ElmichVietNam')
  assert.equal(id.profiles.zalo, 'https://zalo.me/elmichvn')
})
test('identity: declared org, visible phone and address; a tax number is not a phone', () => {
  const id = extractIdentity(HTML, 'https://elmich.vn/')
  assert.equal(id.org.name, 'Elmich Việt Nam')
  assert.equal(id.org.telephone, '1900636925')
  assert.ok(id.visiblePhones.includes('1900636925'))
  assert.ok(!id.visiblePhones.includes('0101234567'), id.visiblePhones.join(','))
  assert.match(id.visibleAddress, /Ngô Gia Bảy/)
})
const found = () => { const identity = extractIdentity(HTML, 'https://elmich.vn/'); return { url: 'https://elmich.vn/', host: 'elmich.vn', blocked: false, identity, llms: null, sources: [{ id: 'website', kind: 'website', label: 'elmich.vn', url: 'https://elmich.vn/', status: 'read' }, { id: 'facebook', kind: 'facebook', label: 'Facebook', url: identity.profiles.facebook, status: 'link', inSameAs: true }, { id: 'zalo', kind: 'zalo', label: 'Zalo', url: identity.profiles.zalo, status: 'link', inSameAs: false }] } }
test('consistency: the matching phone passes, a profile missing from sameAs fails, no Maps warns', () => {
  const c = consistency(found()), by = Object.fromEntries(c.checks.map((x) => [x.id, x.status]))
  assert.equal(by.phone, 'pass'); assert.equal(by.sameas, 'fail'); assert.equal(by.maps, 'warn'); assert.equal(by.address, 'warn')
  assert.ok(c.score > 0 && c.score < 100)
})
test('a profile the owner unticks is no longer required in sameAs', () => {
  const f = found(), c = consistency(f, f.sources.filter((s) => s.kind !== 'zalo'))
  assert.equal(c.checks.find((x) => x.id === 'sameas').status, 'pass')
})
test('patches use only what was read: sameAs lists the confirmed profiles, llms.txt links real pages', () => {
  const f = found(), ps = patches(f), org = JSON.parse(ps.find((p) => p.id === 'org').after)
  assert.deepEqual(org.sameAs, [f.identity.profiles.facebook, f.identity.profiles.zalo])
  assert.equal(org.telephone, '1900636925')
  assert.match(ps.find((p) => p.id === 'llms').after, /\[Về chúng tôi\]\(https:\/\/elmich\.vn\/about\)/)
  assert.ok(ps.every((p) => p.hours > 0))
})
test('a site that turns the reader away is reported as blocked, with no invented patches', async () => {
  const fetchImpl = async () => ({ ok: false, status: 403, headers: { get: () => 'text/html' }, text: async () => 'denied', url: 'https://x.vn/' })
  const f = await discover('https://x.vn/', { fetchImpl })
  assert.equal(f.blocked, true); assert.equal(consistency(f).checks[0].status, 'fail'); assert.deepEqual(patches(f), [])
})
