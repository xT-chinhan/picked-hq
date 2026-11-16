import { chromium } from 'playwright-core'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const p = await b.newPage({ viewport: { width: 1600, height: 900 } })
const errs = []; p.on('pageerror', (e) => errs.push(e.message))
await p.goto('http://localhost:5197/?nowake'); await p.waitForTimeout(1800)
await p.keyboard.press('a'); await p.waitForTimeout(1500)
await p.screenshot({ path: '/tmp/apps.png' })
console.log('errors', JSON.stringify(errs))
await b.close()
