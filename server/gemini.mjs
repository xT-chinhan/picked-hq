import { chromium } from 'playwright-core'
const STOP = 'button[aria-label*="Ngừng"], button[aria-label*="Stop" i]'
const BOX = 'div[role="textbox"], rich-textarea [contenteditable="true"]'
const WALL = /đăng nhập để tiếp tục|sign in to continue|something went wrong|đã xảy ra lỗi|quá nhiều yêu cầu|too many requests/i

export async function launch({ headed = false } = {}) {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome', headless: !headed, args: ['--no-sandbox', ...(headed ? ['--window-size=1100,820'] : [])] })
  // a new context is a new anonymous visitor: Gemini limits one visitor, so the audit rotates them
  const fresh = () => browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'en-US' })
  return { ctx: await fresh(), fresh, close: () => browser.close() }
}

/** Opens a fresh anonymous Gemini chat in its own tab, asks one question, resolves with the finished answer. */
export async function ask(ctx, q, { onPartial, onPage, timeoutMs = 85000 } = {}) {
  const page = await ctx.newPage()
  const registered = onPage?.(page) // lets the browser room watch this tab; unregistered in finally
  try {
    await page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded', timeout: 30000 })
    const box = page.locator(BOX).first()
    await box.waitFor({ timeout: 20000 })
    await box.click()
    await page.keyboard.type(q, { delay: 3 })
    await page.keyboard.press('Enter')
    const t0 = Date.now()
    let last = '', stable = 0, started = false
    while (Date.now() - t0 < timeoutMs) {
      await page.waitForTimeout(700)
      const s = await page.evaluate((STOP) => ({ stop: !!document.querySelector(STOP), txt: document.querySelector('model-response message-content')?.innerText || '', page: document.body.innerText.slice(0, 600) }), STOP)
      if (!s.txt && WALL.test(s.page) && Date.now() - t0 > 8000) throw new Error('blocked: ' + s.page.replace(/\s+/g, ' ').slice(0, 80))
      if (s.txt.length > 20) started = true
      stable = started && s.txt === last ? stable + 1 : 0
      if (s.txt !== last && onPartial) onPartial(s.txt)
      last = s.txt
      if (started && !s.stop && stable >= 4) break
    }
    if (!last) throw new Error('no answer')
    const raw = await page.evaluate(() => {
      const r = document.querySelector('model-response'), mc = r.querySelector('message-content')
      const t = (e) => (e.innerText || '').trim()
      return {
        text: t(mc),
        heads: [...mc.querySelectorAll('h1,h2,h3,h4')].map(t),
        cells: [...mc.querySelectorAll('table tr td:first-child, table tr th:first-child')].map(t),
        chips: [...r.querySelectorAll('source-inline-chip')].map(t).filter(Boolean),
      }
    })
    return { ...raw, ms: Date.now() - t0 }
  } finally { registered?.detach?.(); await page.close().catch(() => {}) }
}
