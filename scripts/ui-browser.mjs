// NaN opens a real page in the agent browser, reviews it, and the Browser panel shows the live frame.
import { chromium } from 'playwright-core'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const p = await b.newPage({ viewport: { width: 1600, height: 900 } })
const errs = []; p.on('pageerror', (e) => errs.push(e.message))
await p.goto('http://localhost:5197/?nowake'); await p.waitForTimeout(1500)
await p.keyboard.press('/'); await p.waitForTimeout(300)
const box = p.locator('input[placeholder^="Ask or command"]'); await box.waitFor(); await box.fill('kiểm tra trang elmich.vn'); await box.press('Enter')
for (let i = 0; i < 40; i++) { if (await p.locator('text=/elmich.vn: \\d+\\/100/').count()) break; await p.waitForTimeout(1500) }
await p.waitForTimeout(1500)
console.log('reply:', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('.rounded-bl-md')].map((e) => e.innerText.slice(0, 200)))))
await p.screenshot({ path: '/tmp/browser-panel.png' })
console.log('errors', JSON.stringify(errs))
await b.close()
