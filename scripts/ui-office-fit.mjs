// The office must fit every laptop size with no scrollbar, and nothing may be smaller than 13 px.
import { chromium } from 'playwright-core'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
let bad = 0
for (const [w, h] of [[1920, 1080], [1536, 864], [1366, 700], [1280, 620]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } })
  const errs = []; p.on('pageerror', (e) => errs.push(e.message))
  await p.goto('http://localhost:5197/'); await p.waitForTimeout(2200)
  await p.mouse.move(5, 5)
  const r = await p.evaluate(() => {
    const root = document.querySelector('.os-root'); const small = []
    for (const el of root.querySelectorAll('*')) { if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue; const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 12.9 && el.tagName !== 'STRONG') small.push(`${el.className || el.tagName}:${fs}`) }
    const out = []; const rb = root.getBoundingClientRect()
    for (const el of root.querySelectorAll('.os-agent,.os-stream-card,.os-timeline,.os-footer form')) { const q = el.getBoundingClientRect(); if (q.bottom > rb.bottom + 1 || q.right > rb.right + 1 || q.top < rb.top - 1) out.push(el.className) }
    return { scroll: root.scrollHeight > root.clientHeight + 1, small: [...new Set(small)], out }
  })
  await p.screenshot({ path: `/tmp/of-${w}x${h}.png` })
  console.log(`${w}x${h}`, JSON.stringify(r), errs.length ? errs : ''); if (r.scroll || r.small.length || r.out.length || errs.length) bad++
  await p.close()
}
await b.close(); process.exit(bad ? 1 : 0)
