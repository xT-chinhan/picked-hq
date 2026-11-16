// Where does the main thread spend its time in a scene? usage: node scripts/trace.mjs [t] [extraQuery]
import { chromium } from 'playwright-core'
const t = process.argv[2] || 12, q = process.argv[3] || ''
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: false, args: ['--no-sandbox', '--window-size=1600,940', '--window-position=0,0', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: 1600, height: 860 } })
await p.goto(`http://localhost:5197/?nowake&t=${t}${q}`); await p.waitForTimeout(3500)
const cdp = await p.context().newCDPSession(p)
const events = []
cdp.on('Tracing.dataCollected', (e) => events.push(...e.value))
await cdp.send('Tracing.start', { categories: 'devtools.timeline,v8.execute,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' })
await p.waitForTimeout(5000)
const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r))
await cdp.send('Tracing.end'); await done
const main = new Map()
for (const e of events) if (e.ph === 'X' && e.dur) { main.set(e.name, (main.get(e.name) || 0) + e.dur) }
const top = [...main.entries()].filter(([n]) => /^(FunctionCall|EvaluateScript|UpdateLayoutTree|Layout|PrePaint|Paint|Layerize|Commit|CompositeLayers|UpdateLayer|HitTest|ParseHTML|RunTask|TimerFire|FireAnimationFrame|MinorGC|MajorGC|V8\.GC.*|RunMicrotasks|XHRReadyStateChange)$/.test(n)).sort((a, c) => c[1] - a[1])
console.log('ms over ~5 s (main thread events):'); for (const [n, d] of top.slice(0, 12)) console.log(' ', n.padEnd(18), String(Math.round(d / 1000)).padStart(6))
const fn = new Map(); for (const e of events) if (e.ph === 'X' && e.name === 'FunctionCall' && e.args?.data?.functionName) { const k = `${e.args.data.functionName} ${String(e.args.data.url || '').split('/').pop().split('?')[0]}:${e.args.data.lineNumber}`; fn.set(k, (fn.get(k) || 0) + e.dur) }
console.log('top script entries:'); for (const [n, d] of [...fn.entries()].sort((a, c) => c[1] - a[1]).slice(0, 8)) console.log(' ', n.slice(0, 70).padEnd(72), Math.round(d / 1000))
await b.close()
