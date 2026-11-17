// The messenger home: agent rows, a direct chat in the agent's voice, the Run menu and the browser column. No page errors allowed.
import { chromium } from 'playwright-core'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
const p = await b.newPage({ viewport: { width: 1600, height: 900 } }); const errs = []; p.on('pageerror', (e) => errs.push(e.message))
await p.goto('http://localhost:5197/'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(1500)
const rows = await p.locator('aside button').count()
await p.locator('form button:has-text("Run")').click(); await p.waitForTimeout(500); const menu = await p.locator('text=Real jobs').count()
await p.keyboard.press('Escape'); await p.click('aside >> text=Sy'); await p.waitForTimeout(300)
await p.fill('input[placeholder^="Message"]', 'What do you check on a website?'); await p.keyboard.press('Enter')
for (let i = 0; i < 20; i++) { if (await p.locator('section >> text=readable').count()) break; await p.waitForTimeout(2000) }
const reply = await p.locator('section >> text=/readable|facts|pages/').count()
await p.locator('button:has-text("Browser")').first().click(); await p.waitForTimeout(900); const browser = await p.locator('input[placeholder^="Open a page"]').count()
console.log({ rows, menu, reply: reply > 0, browser: browser > 0, errs }); await b.close(); process.exit(rows >= 13 && menu && reply && !errs.length ? 0 : 1)
