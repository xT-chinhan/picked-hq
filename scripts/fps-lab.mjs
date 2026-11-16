// Controlled comparison: each variant is measured several times, interleaved, on the same scene. usage: node scripts/fps-lab.mjs [t] [passes]
import { chromium } from 'playwright-core'
const T = process.argv[2] || 12, PASSES = +process.argv[3] || 3
const AMB = '.ambient i{display:none!important}.ambient{background:radial-gradient(closest-side at 8% 4%,#6366f11c,transparent 62%),radial-gradient(closest-side at 100% 100%,#0ea5e916,transparent 62%),radial-gradient(closest-side at 50% 100%,#f9731612,transparent 62%)}'
const variants = [
  ['baseline', '', ''], ['ambient 1 layer', '', AMB], ['no ambient', '', '.ambient{display:none!important}'], ['no shadows', '', '*{box-shadow:none!important}'],
  ['no swarm', '&noswarm', ''], ['no sim', '&nosim', ''], ['ambient1 + no shadow', '', AMB + '*{box-shadow:none!important}'],
]
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: false, args: ['--no-sandbox', '--window-size=1600,940', '--window-position=0,0'] })
const p = await b.newPage({ viewport: { width: 1600, height: 860 } })
const res = new Map(variants.map((v) => [v[0], []]))
for (let pass = 0; pass < PASSES; pass++) for (const [name, q, css] of variants) {
  await p.goto(`http://localhost:5197/?nowake&t=${T}${q}`); if (css) await p.addStyleTag({ content: css }); await p.waitForTimeout(2500)
  const r = await p.evaluate(() => new Promise((s) => { const d = []; let last = performance.now(); const end = last + 4000; const f = (n) => { d.push(n - last); last = n; n < end ? requestAnimationFrame(f) : s(d) }; requestAnimationFrame(f) }))
  res.get(name).push(1000 / (r.reduce((a, c) => a + c, 0) / r.length))
}
for (const [n, v] of res) console.log(n.padEnd(22), (v.reduce((a, c) => a + c, 0) / v.length).toFixed(1).padStart(5), 'fps   runs:', v.map((x) => x.toFixed(0)).join(' '))
await b.close()
