// The stage flow: Office -> Run -> Analyze any business -> type a site -> watch the four steps -> read the report.
import { chromium } from 'playwright-core'
const site = process.argv[2] || 'elmich.vn'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: false, args: ['--no-sandbox', '--window-size=1920,1100', '--window-position=0,0'] })
const p = await b.newPage({ viewport: { width: 1600, height: 900 } })
const errs = []; p.on('pageerror', (e) => errs.push(e.message))
await p.goto('http://localhost:5197/'); await p.waitForTimeout(2500)
await p.click('button:has-text("Run")'); await p.waitForTimeout(400); await p.click('text=Analyze any business'); await p.waitForTimeout(900)
await p.screenshot({ path: '/tmp/an-0.png' })
await p.fill('input[placeholder^="A website"]', site); await p.keyboard.press('Enter')
await p.waitForTimeout(25000); await p.screenshot({ path: '/tmp/an-1.png' })
for (let i = 0; i < 40; i++) { if (await p.locator('text=pieces of evidence').count()) break; await p.waitForTimeout(3000) }
await p.waitForTimeout(2500); await p.screenshot({ path: '/tmp/an-2.png' })
console.log('report shown:', await p.locator('text=pieces of evidence').count(), '| errors', JSON.stringify(errs))
await b.close()
