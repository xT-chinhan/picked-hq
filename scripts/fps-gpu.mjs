// Same research scene on the integrated GPU and on the NVIDIA GPU (PRIME offload).
import { chromium } from 'playwright-core'
const nv = process.argv[2] === 'nvidia'
const env = nv ? { ...process.env, __NV_PRIME_RENDER_OFFLOAD: '1', __GLX_VENDOR_LIBRARY_NAME: 'nvidia' } : process.env
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: false, env, args: ['--no-sandbox', '--window-size=1600,940', '--window-position=0,0', '--ignore-gpu-blocklist', ...(nv ? ['--use-gl=angle', '--use-angle=gl'] : [])] })
const p = await b.newPage({ viewport: { width: 1600, height: 860 } })
for (const [name, t] of [['research', 12], ['impact', 90], ['approve', 72]]) {
  await p.goto(`http://localhost:5197/?nowake&t=${t}`); await p.waitForTimeout(3500)
  const r = await p.evaluate(() => new Promise((res) => { const d = []; let last = performance.now(); const end = last + 6000; const f = (n) => { d.push(n - last); last = n; n < end ? requestAnimationFrame(f) : res(d) }; requestAnimationFrame(f) }))
  console.log(nv ? 'NVIDIA' : 'Intel ', name.padEnd(9), (1000 / (r.reduce((a, c) => a + c, 0) / r.length)).toFixed(1), 'fps  jank:', r.filter((x) => x > 50).length)
}
const g = await b.newPage(); await g.goto('chrome://gpu'); await g.waitForTimeout(2500)
console.log((await g.evaluate(() => { const r = []; const walk = (root) => { for (const el of root.querySelectorAll('*')) if (el.shadowRoot) walk(el.shadowRoot); r.push(root.textContent || '') }; walk(document); return r.join(' ').replace(/\s+/g, ' ') })).match(/GL_RENDERER[^]{0,120}/)?.[0]?.slice(0, 110))
await b.close()
