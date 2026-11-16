// Readability audit: for each scene, how many words are on screen, how many are too small to read from a room, and which cards hold them.
import { chromium } from 'playwright-core'
const only = process.argv[2]
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: false, args: ['--no-sandbox', '--window-size=1600,940', '--window-position=0,0'] })
const p = await b.newPage({ viewport: { width: 1600, height: 860 } })
const scenes = [['mining', 6], ['research', 14], ['analysis', 28], ['content', 38], ['citations', 46], ['sync', 53], ['qa', 60], ['risk', 66], ['approve', 72], ['publish', 78], ['track', 83], ['impact', 90]].filter(([n]) => !only || n === only)
for (const [n, t] of scenes) {
  await p.goto(`http://localhost:5197/?nowake&t=${t}`); await p.waitForTimeout(7500)
  const r = await p.evaluate(() => {
    const z = new DOMMatrix(getComputedStyle(document.querySelector('.react-flow__viewport')).transform).a
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight }
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let words = 0, small = 0; const by = {}
    while (w.nextNode()) { const nd = w.currentNode, t = nd.textContent.trim(), el = nd.parentElement; if (!t || !el || !vis(el) || el.closest('header')) continue
      const fs = parseFloat(getComputedStyle(el).fontSize) * (el.closest('.react-flow__viewport') ? z : 1); const c = t.split(/\s+/).length; words += c
      if (fs < 13) { small += c; const node = el.closest('.react-flow__node'); const k = node ? node.getAttribute('data-id') : 'overlay'; by[k] = (by[k] || 0) + c } }
    return { zoom: +z.toFixed(2), words, small, pct: Math.round((small / Math.max(words, 1)) * 100), top: Object.entries(by).sort((a, c) => c[1] - a[1]).slice(0, 5).map(([k, v]) => `${k}:${v}`).join(' ') }
  })
  console.log(n.padEnd(9), JSON.stringify(r))
}
await b.close()
