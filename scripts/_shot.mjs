import { chromium } from 'playwright-core'
const [t, name] = [process.argv[2] || 14, process.argv[3] || 'scene']
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: false, args: ['--no-sandbox', '--window-size=1600,940', '--window-position=0,0'] })
const p = await b.newPage({ viewport: { width: 1600, height: 860 } })
const errs = []; p.on('pageerror', (e) => errs.push(e.message))
await p.goto(`http://localhost:5197/?nowake&t=${t}`); await p.waitForTimeout(9000)
await p.screenshot({ path: `/tmp/${name}.png` }); console.log('errors', JSON.stringify(errs.slice(0, 3)))
await b.close()
