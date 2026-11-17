// The browser room: every page the agents drive (Gemini tabs, pages NaN opens) is registered here so the UI can watch it live
// and, on request, take control. Screenshots are only taken while somebody is watching a tab.
import { launch } from './gemini.mjs'
import { signInPage } from './profiles.mjs'

const W = 1280, H = 860
/** "elmich.vn/a" becomes https://elmich.vn/a; any other scheme is left for the caller to refuse. */
export const toUrl = (raw) => new URL(/^[a-z][a-z0-9+.-]*:/i.test(String(raw).trim()) ? String(raw).trim() : `https://${String(raw).trim()}`)
const FRAME_MS = 650

export function createBrowserHub({ launchImpl = launch, now = Date.now } = {}) {
  const tabs = new Map() // id -> { id, kind, page, q, url, title, status, help, openedAt }
  const watchers = new Set() // { res, tab }
  let shared = null, seq = 0, timer = null, lastList = ''

  const view = (t) => ({ id: t.id, kind: t.kind, q: t.q ?? '', url: t.url, title: t.title, status: t.status, help: t.help, openedAt: t.openedAt })
  const list = () => [...tabs.values()].map(view)
  const push = (res, ev) => { try { res.write(`data: ${JSON.stringify(ev)}\n\n`) } catch { /* the client went away */ } }

  async function tick() {
    const l = JSON.stringify(list())
    if (l !== lastList) { lastList = l; for (const w of watchers) push(w.res, { type: 'tabs', tabs: list() }) }
    const wanted = new Set([...watchers].map((w) => w.tab).filter(Boolean))
    for (const id of wanted) {
      const t = tabs.get(id); if (!t) continue
      try {
        const jpeg = await t.page.screenshot({ type: 'jpeg', quality: 55, timeout: 2500 })
        t.url = t.page.url(); t.title = await t.page.title().catch(() => t.title)
        const ev = { type: 'frame', id, at: now(), w: W, h: H, img: jpeg.toString('base64') }
        for (const w of watchers) if (w.tab === id) push(w.res, ev)
      } catch { /* the page is navigating or closing; the next tick tries again */ }
    }
  }
  function ensureTimer() {
    if (timer || !watchers.size) return
    timer = setInterval(() => { tick().catch(() => {}); if (!watchers.size) { clearInterval(timer); timer = null } }, FRAME_MS)
  }

  /** Registers a page that another module already drives (a Gemini tab). Returns a function that unregisters it. */
  function attach(id, page, meta = {}) {
    const t = { id, kind: meta.kind ?? 'gemini', page, q: meta.q, url: page.url(), title: '', status: 'working', help: null, openedAt: now() }
    tabs.set(id, t)
    return { set: (patch) => Object.assign(t, patch), detach: () => tabs.delete(id) }
  }

  /** Opens a page for the agents to browse (own headless Chrome, shared by all web tabs). Only http(s) URLs. */
  async function openWeb(url) {
    const u = toUrl(url)
    if (!/^https?:$/.test(u.protocol)) throw new Error('only http and https pages can be opened')
    if (!shared) shared = await launchImpl({ headed: false })
    const page = await shared.ctx.newPage()
    const id = `w${++seq}`
    const h = attach(id, page, { kind: 'web' })
    try { await page.goto(u.href, { waitUntil: 'domcontentloaded', timeout: 25000 }); await page.waitForTimeout(1200); h.set({ url: page.url(), title: await page.title(), status: 'ready' }) }
    catch (e) { h.set({ status: 'failed' }); throw new Error(`could not open the page: ${String(e.message).split('\n')[0].slice(0, 120)}`) }
    return id
  }

  /** Opens a page inside a sign-in profile (a business's own login). The owner signs in here by taking control. */
  async function openSession(slug, url) {
    const u = toUrl(url)
    if (!/^https?:$/.test(u.protocol)) throw new Error('only http and https pages can be opened')
    const page = await signInPage(slug, u.href)
    const id = `s${++seq}`
    const h = attach(id, page, { kind: 'session', q: slug })
    h.set({ url: page.url(), title: await page.title().catch(() => ''), status: 'ready' })
    return id
  }

  async function closeTab(id) {
    const t = tabs.get(id); if (!t) return false
    tabs.delete(id)
    if (t.kind === 'web' || t.kind === 'session') await t.page.close().catch(() => {}) // a session closes its page only; the profile stays signed in
    for (const w of watchers) if (w.tab === id) push(w.res, { type: 'tabs', tabs: list() })
    return true
  }

  /** The page text and structure an agent can review, extracted inside the page. */
  async function read(id) {
    const t = tabs.get(id); if (!t) throw new Error('tab not found')
    return t.page.evaluate(() => {
      const txt = (el) => (el.innerText || '').replace(/\s+/g, ' ').trim()
      const types = new Set(), jsonld = []
      const walk = (o) => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { for (const t of [].concat(o['@type'] ?? [])) types.add(String(t)); Object.values(o).forEach(walk) } }
      for (const s of document.querySelectorAll('script[type="application/ld+json"]')) { try { const j = JSON.parse(s.textContent); jsonld.push(j); walk(j) } catch { /* invalid block */ } }
      const heads = [...document.querySelectorAll('h1,h2,h3')].slice(0, 30).map((h) => ({ level: +h.tagName[1], text: txt(h).slice(0, 140) }))
      const q = heads.filter((h) => h.text.endsWith('?')).length
      return {
        url: location.href, title: document.title, description: document.querySelector('meta[name="description"]')?.content ?? '', headings: heads,
        text: txt(document.body).slice(0, 8000), schemaTypes: [...types], hasFaq: types.has('FAQPage') || q >= 3,
        canonical: document.querySelector('link[rel="canonical"]')?.href ?? '', lang: document.documentElement.lang || '',
      }
    })
  }

  /** Human input while the UI holds control of a tab. Coordinates are in the 1280x860 page viewport. */
  async function input(id, action) {
    const t = tabs.get(id); if (!t) throw new Error('tab not found')
    const p = t.page
    switch (action.type) {
      case 'click': await p.mouse.click(clamp(action.x, W), clamp(action.y, H)); break
      case 'scroll': await p.mouse.wheel(0, Math.max(-2000, Math.min(2000, Number(action.dy) || 0))); break
      case 'type': await p.keyboard.type(String(action.text ?? '').slice(0, 500), { delay: 8 }); break
      case 'key': if (/^[A-Za-z0-9+ ]{1,24}$/.test(String(action.key))) await p.keyboard.press(String(action.key)); break
      case 'back': await p.goBack({ timeout: 8000 }).catch(() => {}); break
      case 'reload': await p.reload({ timeout: 15000 }).catch(() => {}); break
      case 'goto': { const u = toUrl(action.url); if (!/^https?:$/.test(u.protocol)) throw new Error('only http and https'); await p.goto(u.href, { waitUntil: 'domcontentloaded', timeout: 25000 }); break }
      default: throw new Error('unknown action')
    }
    t.url = p.url()
    return { ok: true }
  }
  const clamp = (v, max) => Math.max(0, Math.min(max - 1, Math.round(Number(v) || 0)))

  /** Server-sent stream: the tab list always, and frames of one tab. Returns an unsubscribe function. */
  function watch(res, tab = '') {
    const w = { res, tab }
    watchers.add(w); push(res, { type: 'tabs', tabs: list() }); ensureTimer()
    return () => watchers.delete(w)
  }
  const setHelp = (id, help) => { const t = tabs.get(id); if (t) { t.help = help; t.status = help ? 'needs-help' : 'working' } }
  async function stop() { watchers.clear(); clearInterval(timer); timer = null; for (const [id, t] of tabs) if (t.kind === 'web') await t.page.close().catch(() => {}); tabs.clear(); await shared?.close().catch(() => {}); shared = null }
  return { attach, openWeb, openSession, closeTab, read, input, watch, list, setHelp, stop, tick }
}

export const hub = createBrowserHub()
