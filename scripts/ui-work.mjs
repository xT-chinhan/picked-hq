// Opens the Inbox / Routines panel, creates a routine, runs it now, and waits for its result to land in the inbox.
import { chromium } from 'playwright-core'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const p = await b.newPage({ viewport: { width: 1600, height: 900 } })
const errs = []; p.on('pageerror', (e) => errs.push(e.message))
await p.goto('http://localhost:5197/?nowake'); await p.waitForTimeout(2500)
await p.keyboard.press('w'); await p.waitForTimeout(600)
await p.click('button:has-text("Routines")'); await p.waitForTimeout(400)
await p.click('button:has-text("New routine")'); await p.waitForTimeout(300)
await p.screenshot({ path: '/tmp/ws-new.png' })
await p.click('button:has-text("Create routine")'); await p.waitForTimeout(1500)
await p.locator('button[title="Run now"]').first().click()
await p.click('button:has-text("Inbox")')
for (let i = 0; i < 30; i++) { if (await p.locator('text=answers name').count()) break; await p.waitForTimeout(2000) }
await p.waitForTimeout(500); await p.screenshot({ path: '/tmp/ws-inbox.png' })
console.log('inbox result visible:', await p.locator('text=answers name').count(), '| errors', JSON.stringify(errs))
await b.close()
