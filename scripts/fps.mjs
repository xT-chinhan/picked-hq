// Real frame rate of the demo on this machine: headed Chrome, GPU on, several scenes of the loop. usage: node scripts/fps.mjs [headless]
import { chromium } from 'playwright-core'
const headless = process.argv[2] === 'headless'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless, args: ['--no-sandbox', '--window-size=1600,940', '--window-position=0,0', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] })
const p = await b.newPage({ viewport: { width: 1600, height: 860 } })
const scenes = [['research', 12], ['analysis', 28], ['content', 38], ['risk', 66], ['approve', 72], ['impact', 90]]
const out = []
for (const [name, t] of scenes) {
  await p.goto(`http://localhost:5197/?nowake&t=${t}`); await p.waitForTimeout(3500)
  const r = await p.evaluate(() => new Promise((res) => { const d = []; let last = performance.now(); const end = last + 6000; const f = (n) => { d.push(n - last); last = n; n < end ? requestAnimationFrame(f) : res(d) }; requestAnimationFrame(f) }))
  const avg = 1000 / (r.reduce((a, c) => a + c, 0) / r.length), sorted = [...r].sort((a, c) => a - c), p95 = sorted[Math.floor(sorted.length * 0.95)]
  out.push({ name, fps: +avg.toFixed(1), p95ms: +p95.toFixed(1), jank: r.filter((x) => x > 50).length })
}
console.table(out)
const gpu = await (async () => { const g = await b.newPage(); await g.goto('chrome://gpu'); await g.waitForTimeout(1500); return g.evaluate(() => document.body.innerText.split('\n').filter((l) => /Canvas|Compositing|Rasterization|GL_RENDERER|Skia Graphite|Vulkan/.test(l)).slice(0, 8)) })().catch(() => [])
console.log(gpu.join('\n'))
await b.close()
