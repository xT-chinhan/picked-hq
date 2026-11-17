// With every /api call failing (backend off, network down) the saved analyses must still open and replay.
import { chromium } from 'playwright-core'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: false, args: ['--no-sandbox', '--window-size=1600,1000', '--window-position=0,0'] })
const p = await b.newPage({ viewport: { width: 1600, height: 900 } })
const errs = []; p.on('pageerror', (e) => errs.push(e.message))
await p.route('**/api/**', (r) => r.abort())
await p.goto('http://localhost:5197/'); await p.waitForTimeout(2500)
await p.click('button:has-text("Run")'); await p.waitForTimeout(400); await p.click('text=Analyze any business'); await p.waitForTimeout(1200)
await p.click('button:has-text("highlandscoffee")'); await p.waitForTimeout(6500)
const shown = await p.locator('text=pieces of evidence').count()
console.log('report shown offline:', shown, '| errors', JSON.stringify(errs)); await p.screenshot({ path: '/tmp/an-off.png' }); await b.close(); process.exit(shown ? 0 : 1)
