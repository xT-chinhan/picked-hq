// Drives the new Audit popover: open, run Quick for Sunhouse, reload mid-run (must rejoin), approve with the top-bar button.
import { chromium } from 'playwright-core'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const p = await b.newPage({ viewport: { width: 1600, height: 900 } })
const errs = []; p.on('pageerror', (e) => errs.push(e.message))
await p.goto('http://localhost:5197/?nowake'); await p.waitForTimeout(1500)
await p.click('text=Audit a brand'); await p.waitForTimeout(700)
await p.screenshot({ path: '/tmp/au-pop.png' })
await p.click('button:has-text("Sunhouse")'); await p.click('button:has-text("Run for Sunhouse")'); await p.waitForTimeout(6000)
console.log('pill after start:', await p.locator('header').innerText().then((t) => t.replace(/\s+/g, ' ').slice(0, 160)))
await p.reload(); await p.waitForTimeout(4000)
console.log('pill after reload:', await p.locator('header').innerText().then((t) => t.replace(/\s+/g, ' ').slice(0, 160)))
for (let i = 0; i < 60; i++) { if (await p.locator('button:has-text("Approve")').first().isVisible().catch(() => false) && /Approve/.test(await p.locator('header').innerText())) break; await p.waitForTimeout(2000) }
await p.screenshot({ path: '/tmp/au-wait.png' })
await p.locator('header button.bg-emerald-600').click(); await p.waitForTimeout(8000)
console.log('after approve:', await p.locator('header').innerText().then((t) => t.replace(/\s+/g, ' ').slice(0, 160)))
console.log('errors', JSON.stringify(errs))
await b.close()
