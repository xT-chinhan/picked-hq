import { chromium } from 'playwright-core'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: false, args: ['--no-sandbox', '--window-size=1600,940', '--window-position=0,0'] })
const p = await b.newPage({ viewport: { width: 1600, height: 860 } })
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
await p.goto('http://localhost:5197/'); await p.waitForTimeout(3600)
await p.screenshot({ path: '/tmp/office1.png' })
await p.click('text=Call everyone'); await p.waitForTimeout(1500); await p.screenshot({ path: '/tmp/office2.png' })
console.log('errors', JSON.stringify(errs.slice(0, 3)))
await b.close()
