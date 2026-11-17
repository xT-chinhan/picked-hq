// A stand-in for Chrome's extension APIs so the REAL panel code can run inside a normal page (for the recording).
// The page it reads is a saved snapshot of shopee.vn; the deep read replays the X-ray saved earlier for that site.
(() => {
  const L = (f) => ({ addListener: f || (() => {}) })
  const snap = fetch('/ext/shopee.json').then((r) => r.json())
  const tab = { id: 7, url: 'https://shopee.vn/', title: 'Shopee Việt Nam | Mua Sắm Online', status: 'complete' }
  window.chrome = {
    permissions: { contains: async () => true, request: async () => true, remove: async () => true, onAdded: L(), onRemoved: L() },
    tabs: { query: async () => [tab], get: async () => tab, create: () => {}, onActivated: L(), onUpdated: L() },
    scripting: { executeScript: async () => [{ result: await snap }] },
    storage: { local: { get: async () => ({ base: location.origin }), set: async () => {} }, session: { get: async () => ({}), set: async () => {}, remove: async () => {} }, onChanged: L() },
  }
  const real = window.fetch.bind(window)
  window.fetch = (input, init) => { const u = String(typeof input === 'string' ? input : input.url || input); return /\/api\/analyze$/.test(u) && init?.method === 'POST' ? Promise.resolve(Response.json({ id: 'seed' })) : real(input, init) }
  window.EventSource = class {
    constructor(url) {
      if (!/\/api\/analyze\/seed\/events/.test(url)) return
      this.readyState = 1
      ;(async () => {
        const idx = await real('/analyses/index.json').then((r) => r.json()), a = idx.find((x) => /shopee\.vn/.test(x.url)) || idx[0], r = await real(`/analyses/${a.id}.json`).then((x) => x.json())
        const warn = r.evidence.filter((e) => /^A:/.test(e.id) && /^WARN/.test(e.detail)).length, fail = r.evidence.filter((e) => /^A:/.test(e.id) && /^FAIL/.test(e.detail)).length
        const words = Number(/;\s*(\d+) words/.exec(r.evidence.find((e) => e.id === 'S1')?.detail || '')?.[1] ?? 0)
        const steps = [['scrape', { pages: r.tools?.scrape?.pages ?? 1, words, llms: r.tools?.scrape?.llms ?? 'missing' }], ['audit', { score: r.siteScore, pass: Math.max(0, 39 - warn - fail), warn, fail }], ['rea', { domNodes: r.tools?.rea?.domNodes ?? 0, scripts: r.tools?.rea?.scripts ?? 0, thirdParty: r.tools?.rea?.thirdParty ?? 0 }], ['synth', undefined]]
        const emit = (ev) => this.onmessage && this.onmessage({ data: JSON.stringify(ev) })
        for (const [step, data] of steps) { emit({ type: 'an.step', step, status: 'running' }); await new Promise((x) => setTimeout(x, 650)); emit({ type: 'an.step', step, status: 'done', data }) }
        emit({ type: 'an.done', report: r })
      })()
    }
    close() { this.readyState = 2 }
  }
})()
