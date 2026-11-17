// The extension panel in a normal page with a stubbed `chrome`: access card, tab chip, review card, a read-the-page chat.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'
import { chromium } from 'playwright-core'
const root = path.resolve('extension'), types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/panel.html')); if (!f.startsWith(root) || !fs.existsSync(f)) { r.writeHead(404); return r.end() } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'text/plain' }); r.end(fs.readFileSync(f)) }).listen(0)
const port = srv.address().port
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
const p = await b.newPage({ viewport: { width: 420, height: 860 } }); const errs = []; p.on('pageerror', (e) => errs.push(e.message))
await p.addInitScript(() => {
  let granted = false; const listeners = []
  const PAGE = { url: 'https://shopee.vn/', title: 'Shopee Việt Nam | Mua Sắm Online', description: 'Shopee là nền tảng thương mại điện tử', headings: [{ level: 1, text: 'Shopee' }, { level: 2, text: 'Danh mục' }], text: 'Thời Trang Nam Điện Thoại Flash Sale '.repeat(40), schemaTypes: ['Organization'], hasFaq: false, lang: 'vi', canonical: 'https://shopee.vn/' }
  window.chrome = {
    permissions: { contains: async () => granted, request: async () => { granted = true; return true }, remove: async () => { granted = false; return true }, onAdded: { addListener() {} }, onRemoved: { addListener() {} } },
    tabs: { query: async () => [{ id: 7, url: granted ? PAGE.url : undefined, title: granted ? PAGE.title : '' }], get: async () => ({ id: 7 }), create: (o) => { window.__opened = o.url }, onActivated: { addListener() {} }, onUpdated: { addListener() {} } },
    scripting: { executeScript: async () => { if (!granted) throw new Error('Cannot access contents of the page. Extension manifest must request permission to access the respective host.'); return [{ result: PAGE }] } },
    storage: { local: { get: async () => ({}), set: async () => {} }, session: { get: async () => ({}), remove: async () => {} }, onChanged: { addListener() {} } },
  }
})
await p.route('http://127.0.0.1:5198/**', async (route) => { const r = await route.fetch().catch(() => null); if (!r) return route.abort(); await route.fulfill({ response: r, headers: { ...r.headers(), 'access-control-allow-origin': '*' } }) })
await p.goto(`http://127.0.0.1:${port}/`); await p.waitForTimeout(800)
await p.screenshot({ path: '/tmp/x-0.png' })
await p.click('#starters button >> nth=1'); await p.waitForTimeout(700)           // review while access is off -> the card that explains
const needs = await p.locator('.notice').count(); await p.screenshot({ path: '/tmp/x-1.png' })
await p.click('.notice .btn'); await p.waitForTimeout(500)                          // turn access on
const on = await p.getAttribute('#switch', 'aria-checked'); const chip = await p.locator('#ctx-title').innerText()
await p.click('#plus'); await p.click('#menu >> text=Review this page for AI'); await p.waitForTimeout(4000); await p.screenshot({ path: '/tmp/x-2.png' })
const card = await p.locator('.card .gauge').count()
await p.fill('#input', 'What is this page and what should I fix first?'); await p.keyboard.press('Enter')
for (let i = 0; i < 30; i++) { if (await p.locator('.msg.nan .body >> text=/shopee|Shopee|page/i').count() > 1) break; await p.waitForTimeout(2000) }
await p.waitForTimeout(5000); await p.screenshot({ path: '/tmp/x-3.png' })
console.log({ needs, on, chip, card, errs }); await b.close(); srv.close()
process.exit(needs && on === 'true' && card && !errs.length ? 0 : 1)
