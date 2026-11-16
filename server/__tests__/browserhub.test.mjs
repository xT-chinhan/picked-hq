import test from 'node:test'
import assert from 'node:assert/strict'
import { createBrowserHub, toUrl } from '../browserhub.mjs'

// a fake Playwright page: records calls and returns a fixed jpeg
const fakePage = (over = {}) => {
  const calls = []
  const page = {
    calls, _url: 'https://gemini.google.com/app',
    url() { return this._url }, title: async () => 'Gemini', screenshot: async () => Buffer.from('jpegbytes'),
    mouse: { click: async (x, y) => calls.push(['click', x, y]), wheel: async (x, y) => calls.push(['wheel', x, y]) },
    keyboard: { type: async (t) => calls.push(['type', t]), press: async (k) => calls.push(['press', k]) },
    goto: async function (u) { this._url = u; calls.push(['goto', u]) }, goBack: async () => calls.push(['back']), reload: async () => calls.push(['reload']),
    waitForTimeout: async () => {}, close: async () => calls.push(['close']), evaluate: async () => ({ url: 'x', title: 't' }), ...over,
  }
  return page
}
const fakeRes = () => { const out = []; return { out, write: (s) => out.push(JSON.parse(s.replace(/^data: /, '').trim())) } }

test('attached tabs are listed and removed on detach', () => {
  const hub = createBrowserHub(); const h = hub.attach('g1', fakePage(), { kind: 'gemini', q: 'Hộp cơm?' })
  assert.deepEqual(hub.list().map((t) => [t.id, t.kind, t.q, t.status]), [['g1', 'gemini', 'Hộp cơm?', 'working']])
  h.set({ status: 'done' }); assert.equal(hub.list()[0].status, 'done')
  h.detach(); assert.deepEqual(hub.list(), [])
})

test('a watcher gets the tab list at once and frames only for the tab it asked for', async () => {
  const hub = createBrowserHub(); hub.attach('g1', fakePage()); hub.attach('g2', fakePage())
  const res = fakeRes(); const off = hub.watch(res, 'g2')
  assert.equal(res.out[0].type, 'tabs')
  await hub.tick()
  const frames = res.out.filter((e) => e.type === 'frame')
  assert.equal(frames.length, 1); assert.equal(frames[0].id, 'g2'); assert.equal(Buffer.from(frames[0].img, 'base64').toString(), 'jpegbytes')
  off(); await hub.stop()
})

test('no screenshots are taken when nobody watches', async () => {
  let shots = 0; const hub = createBrowserHub(); hub.attach('g1', fakePage({ screenshot: async () => { shots++; return Buffer.alloc(1) } }))
  await hub.tick(); assert.equal(shots, 0)
})

test('input is clamped to the viewport, typed text is limited and unknown actions are refused', async () => {
  const hub = createBrowserHub(); const page = fakePage(); hub.attach('w1', page, { kind: 'web' })
  await hub.input('w1', { type: 'click', x: 5000, y: -4 }); await hub.input('w1', { type: 'scroll', dy: 99999 }); await hub.input('w1', { type: 'type', text: 'x'.repeat(900) }); await hub.input('w1', { type: 'key', key: 'Enter' }); await hub.input('w1', { type: 'key', key: 'rm -rf /;' })
  assert.deepEqual(page.calls[0], ['click', 1279, 0]); assert.deepEqual(page.calls[1], ['wheel', 0, 2000]); assert.equal(page.calls[2][1].length, 500); assert.deepEqual(page.calls[3], ['press', 'Enter']); assert.equal(page.calls.length, 4)
  await assert.rejects(() => hub.input('w1', { type: 'goto', url: 'file:///etc/passwd' }), /only http/)
  await assert.rejects(() => hub.input('w1', { type: 'explode' }), /unknown action/); await assert.rejects(() => hub.input('nope', { type: 'back' }), /tab not found/)
})

test('openWeb opens an http page in the shared browser, registers it and closeTab closes it', async () => {
  const page = fakePage({ title: async () => 'Elmich' }); let launches = 0
  const hub = createBrowserHub({ launchImpl: async () => { launches++; return { ctx: { newPage: async () => page }, close: async () => {} } } })
  const id = await hub.openWeb('https://elmich.vn/'); assert.equal(id, 'w1'); assert.equal(hub.list()[0].title, 'Elmich'); assert.equal(hub.list()[0].status, 'ready')
  await hub.openWeb('https://elmich.vn/a'); assert.equal(launches, 1)
  await assert.rejects(() => hub.openWeb('ftp://x.vn'), /only http/); await assert.rejects(() => hub.openWeb('javascript:alert(1)'), /only http/)
  assert.equal(await hub.closeTab('w1'), true); assert.equal(await hub.closeTab('w1'), false); await hub.stop()
})

test('a page that fails to load is reported and marked failed', async () => {
  const hub = createBrowserHub({ launchImpl: async () => ({ ctx: { newPage: async () => fakePage({ goto: async () => { throw new Error('net::ERR_NAME_NOT_RESOLVED\nmore') } }) }, close: async () => {} }) })
  await assert.rejects(() => hub.openWeb('https://nope.invalid/'), /could not open the page: net::ERR_NAME_NOT_RESOLVED/)
  assert.equal(hub.list()[0].status, 'failed'); await hub.stop()
})

test('addresses without a scheme get https and other schemes are kept so they can be refused', () => {
  assert.equal(toUrl('elmich.vn').href, 'https://elmich.vn/'); assert.equal(toUrl(' http://a.vn/x ').href, 'http://a.vn/x'); assert.equal(toUrl('ftp://a.vn').protocol, 'ftp:')
  assert.throws(() => toUrl('not a url at all'))
})
