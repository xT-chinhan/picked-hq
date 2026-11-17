// Sign-in profiles: one browser profile per business, kept on this machine (server/data is git-ignored).
// The owner signs in themselves inside the Browser panel; Picked never sees or stores the password, only the browser's own session.
// The agent reads a page in that session only after the owner approves the step. Signing out deletes the profile.
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { extractDeep } from '../extension/lib/extract.js'

const DATA = process.env.PICKED_DATA_DIR || path.join(import.meta.dirname, 'data')
export const PROFILES = path.join(DATA, 'profiles')
const CHROME = process.env.CHROME_BIN || '/usr/bin/google-chrome'
const open = new Map() // slug -> context (one live context per profile)

export const slugOf = (name) => String(name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'default'
const dirOf = (slug) => path.join(PROFILES, slugOf(slug))

/** Every profile on disk, with when it was last used. */
export function list() {
  if (!fs.existsSync(PROFILES)) return []
  return fs.readdirSync(PROFILES).filter((s) => fs.statSync(path.join(PROFILES, s)).isDirectory()).map((slug) => ({ slug, open: open.has(slug), usedAt: fs.statSync(path.join(PROFILES, slug)).mtimeMs }))
}

async function context(slug) {
  if (open.has(slug)) return open.get(slug)
  fs.mkdirSync(PROFILES, { recursive: true, mode: 0o700 })
  const ctx = await chromium.launchPersistentContext(dirOf(slug), { executablePath: CHROME, headless: true, args: ['--no-sandbox'], viewport: { width: 1280, height: 860 }, locale: 'vi-VN' })
  ctx.on('close', () => open.delete(slug))
  open.set(slug, ctx)
  return ctx
}

/** A page inside the profile, for the Browser panel to show and the owner to sign in on. */
export async function signInPage(slug, url) {
  const ctx = await context(slug)
  const page = await ctx.newPage()
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
  return page
}

const sameSite = (a, b) => { try { const h = (x) => new URL(x).hostname.replace(/^www\./, '').split('.').slice(-2).join('.'); return h(a) === h(b) } catch { return false } }

/** Reads a page in the profile, read-only: the page and up to `more` linked pages on the same site. Only runs after the owner approves. */
export async function read(slug, url, { more = 3 } = {}) {
  const ctx = await context(slug)
  const page = await ctx.newPage()
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(1500)
    const first = await page.evaluate(`(${extractDeep.toString()})()`)
    const seen = [first]
    const links = (first.links?.sample || []).map((l) => new URL(l.path, url).href).filter((u) => sameSite(u, url) && u !== url)
    for (const u of [...new Set(links)].slice(0, more)) {
      try { await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 20000 }); await page.waitForTimeout(800); seen.push(await page.evaluate(`(${extractDeep.toString()})()`)) } catch { /* a page that will not load is skipped and said so */ }
    }
    return { pages: seen, signedIn: !/login|đăng nhập|sign in|log in/i.test(first.title + ' ' + (first.text || '').slice(0, 400)) }
  } finally { await page.close().catch(() => {}) }
}

/** Signs out: closes the profile and deletes everything saved for it. */
export async function signOut(slug) {
  const ctx = open.get(slugOf(slug))
  if (ctx) { open.delete(slugOf(slug)); await ctx.close().catch(() => {}) }
  fs.rmSync(dirOf(slug), { recursive: true, force: true })
  return true
}

export async function closeAll() { for (const [, ctx] of open) await ctx.close().catch(() => {}); open.clear() }
