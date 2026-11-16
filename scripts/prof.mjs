// CPU profile of a scene on the dev server (readable function names). usage: node scripts/prof.mjs [t] [extraQuery]
import { chromium } from 'playwright-core'
const t = process.argv[2] || 12, q = process.argv[3] || ''
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: false, args: ['--no-sandbox', '--window-size=1600,940', '--window-position=0,0'] })
const p = await b.newPage({ viewport: { width: 1600, height: 860 } })
await p.goto(`http://localhost:5199/?nowake&t=${t}${q}`); await p.waitForTimeout(6000)
const cdp = await p.context().newCDPSession(p)
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start')
await p.waitForTimeout(5000)
const { profile } = await cdp.send('Profiler.stop')
const self = new Map(), byId = new Map(profile.nodes.map((n) => [n.id, n]))
const dt = profile.timeDeltas; profile.samples.forEach((id, i) => { const n = byId.get(id); const f = n.callFrame; const k = `${f.functionName || '(anon)'} ${f.url.split('/').slice(-2).join('/').split('?')[0]}:${f.lineNumber}`; self.set(k, (self.get(k) || 0) + (dt[i] || 0)) })
const total = [...self.values()].reduce((a, c) => a + c, 0)
console.log('total sampled ms:', Math.round(total / 1000))
for (const [k, v] of [...self.entries()].sort((a, c) => c[1] - a[1]).slice(0, 22)) console.log(String(Math.round(v / 1000)).padStart(5), k.slice(0, 100))
await b.close()
