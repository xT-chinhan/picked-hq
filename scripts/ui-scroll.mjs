// Regression check for the clipped-modal bug: at several window sizes the last app in the list must be reachable inside the viewport.
import { chromium } from 'playwright-core'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: false, args: ['--no-sandbox', '--window-size=1920,1200', '--window-position=0,0'] })
let bad = 0
for (const [w, h] of [[1920, 1080], [1366, 700], [1280, 620]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } })
  await p.goto('http://localhost:5197/?nowake&nocam'); await p.waitForTimeout(1200)
  await p.keyboard.press('a'); await p.waitForTimeout(1200)
  const r = await p.evaluate(async () => {
    const card0 = document.querySelector('.fixed')?.firstElementChild
    const list = [...(card0?.querySelectorAll('div') ?? [])].find((d) => /auto|scroll/.test(getComputedStyle(d).overflowY) && d.scrollHeight > d.clientHeight)
    const card = card0?.getBoundingClientRect()
    if (!list) return { err: 'no scroll list' }
    list.scrollTop = list.scrollHeight; await new Promise((r) => setTimeout(r, 300))
    const last = [...list.querySelectorAll('button')].filter((x) => x.textContent.trim() === 'Connect').at(-1)?.getBoundingClientRect()
    return { cardBottom: Math.round(card.bottom), viewport: innerHeight, lastBtnBottom: Math.round(last.bottom), lastBtnTop: Math.round(last.top) }
  })
  const ok = !r.err && r.cardBottom <= r.viewport && r.lastBtnBottom <= r.viewport && r.lastBtnTop >= 0
  if (!ok) bad++
  console.log(`${w}x${h}`, ok ? 'OK ' : 'FAIL', JSON.stringify(r)); await p.close()
}
await b.close(); process.exit(bad ? 1 : 0)
