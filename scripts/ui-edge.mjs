// Opens the hosted UI and checks the backend notice; pass `online` or `offline` for the expected state.
import { chromium } from 'playwright-core'
const want = process.argv[2] || 'online'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const p = await b.newPage({ viewport: { width: 1600, height: 900 } })
await p.goto('https://pickedhq.pages.dev/?nowake'); await p.waitForTimeout(5000)
const notice = await p.locator('text=NaN-Team đang tạm khóa').count()
await p.keyboard.press('/'); await p.waitForTimeout(300); await p.keyboard.type('đối thủ nào mạnh nhất?'); await p.keyboard.press('Enter'); await p.waitForTimeout(want === 'online' ? 25000 : 6000)
console.log('notice visible:', notice, '| chat replies:', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('.rounded-bl-md')].map((e) => e.innerText.slice(0, 160)))))
await p.screenshot({ path: `/tmp/edge-${want}.png` })
await b.close()
