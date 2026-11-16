// Screens for the new scenes: council (live replay), story sheets, dock menu.
import { chromium } from 'playwright-core'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: false, args: ['--no-sandbox', '--window-size=1600,940', '--window-position=0,0'] })
const p = await b.newPage({ viewport: { width: 1600, height: 860 } })
const errs = []; p.on('pageerror', (e) => errs.push(e.message))
await p.goto('http://localhost:5197/?nowake&t=66'); await p.waitForTimeout(4500)
await p.screenshot({ path: '/tmp/s-council.png' })
await p.keyboard.press('v'); await p.waitForTimeout(2200); await p.screenshot({ path: '/tmp/s-story1.png' })
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(2200); await p.screenshot({ path: '/tmp/s-story2.png' })
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(1800); await p.screenshot({ path: '/tmp/s-story3.png' })
await p.keyboard.press('Escape'); await p.waitForTimeout(500)
await p.click('button[title="More"]'); await p.waitForTimeout(600); await p.screenshot({ path: '/tmp/s-dock.png', clip: { x: 700, y: 780, width: 900, height: 80 } })
console.log('errors', JSON.stringify(errs))
await b.close()
