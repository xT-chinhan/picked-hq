import { chromium } from 'playwright-core'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const p = await b.newPage({ viewport: { width: 1600, height: 900 } })
const errs = []; p.on('pageerror', (e) => errs.push(e.message))
await p.goto('http://localhost:5197/?nowake'); await p.waitForTimeout(1500)
const say = async (t) => { await p.keyboard.press('/'); await p.waitForTimeout(300); await p.keyboard.type(t); await p.keyboard.press('Enter') }
await say('audit Elmich')
const t0 = Date.now()
let shot = 0
while (Date.now() - t0 < 300000) {
  await p.waitForTimeout(3000)
  const txt = await p.evaluate(() => document.body.innerText)
  if (/Waiting for the owner/.test(txt)) {
    await p.keyboard.press('Escape'); await p.keyboard.press('/'); await p.waitForTimeout(300); await p.keyboard.type('duyệt hết'); await p.keyboard.press('Enter')
    await p.waitForTimeout(700); await p.screenshot({ path: '/tmp/pl-stamp.png' }); console.log('approved at', (Date.now() - t0) / 1000); break
  }
  if (++shot % 10 === 0) console.log(Math.round((Date.now() - t0) / 1000), 's', (txt.match(/Replay · \d+\/\d+|Live · \d+\/\d+/) || [''])[0])
}
await p.waitForTimeout(12000); await p.screenshot({ path: '/tmp/pl-end.png' })
console.log('msgs:', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('.rounded-bl-md')].map((e) => e.innerText))))
console.log('errors', JSON.stringify(errs))
await b.close()
