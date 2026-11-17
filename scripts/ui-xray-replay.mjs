// Replays a saved Business X-ray and grabs frames of the streaming view, then the report.
import { chromium } from 'playwright-core'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
const p = await b.newPage({ viewport: { width: 1600, height: 900 } })
const errs = []; p.on('pageerror', (e) => errs.push(e.message))
await p.goto('http://localhost:5197/'); await p.waitForTimeout(2500)
await p.click('button:has-text("Run")'); await p.waitForTimeout(400); await p.click('text=Analyze any business'); await p.waitForTimeout(900)
await p.screenshot({ path: '/tmp/xr-0.png' })
await p.click('button:has-text("Elmich")')
for (const [i, t] of [[1, 2500], [2, 4500], [3, 5000]]) { await p.waitForTimeout(t); await p.screenshot({ path: `/tmp/xr-${i}.png` }) }
await p.waitForTimeout(4000); await p.screenshot({ path: '/tmp/xr-4.png' })
await p.click('text=Show the log').catch(() => {}); await p.waitForTimeout(600); await p.screenshot({ path: '/tmp/xr-5.png' })
console.log('report:', await p.locator('text=pieces of evidence').count(), '| errors', JSON.stringify(errs))
await b.close()
