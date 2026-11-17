// Owner mode: the project is public, but the controls that act on this machine (sign-in profiles, the agent browser, schedules, stopping a run,
// connected apps) are opened to one person through a password. The password is kept only as a salted scrypt hash; a login gives a random
// token in an HttpOnly cookie that lasts eight hours and is kept in memory (a restart logs the owner out).
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const FILE = path.join(os.homedir(), '.config', 'picked', 'owner.json')
const TTL = 8 * 3600 * 1000
const tokens = new Map()
const derive = (password, salt) => crypto.scryptSync(String(password), salt, 32, { N: 16384 }).toString('hex')

/** Writes the hash for a new password (used by scripts/set-owner-password.mjs). */
export function setPassword(password, file = FILE) {
  if (String(password).length < 8) throw new Error('use at least 8 characters')
  const salt = crypto.randomBytes(16).toString('hex')
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  fs.writeFileSync(file, JSON.stringify({ salt, hash: derive(password, salt) }), { mode: 0o600 })
}
export const configured = (file = FILE) => fs.existsSync(file)

export function check(password, file = FILE) {
  try {
    const { salt, hash } = JSON.parse(fs.readFileSync(file, 'utf8')), a = Buffer.from(derive(password, salt), 'hex'), b = Buffer.from(hash, 'hex')
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  } catch { return false }
}
export function issue(now = Date.now()) {
  for (const [t, exp] of tokens) if (exp < now) tokens.delete(t)
  const t = crypto.randomBytes(32).toString('base64url'); tokens.set(t, now + TTL); return t
}
export const valid = (t, now = Date.now()) => !!t && (tokens.get(t) ?? 0) > now
export const revoke = (t) => tokens.delete(t)
export const tokenFrom = (cookie) => /(?:^|;\s*)picked_owner=([\w-]+)(?:;|$)/.exec(String(cookie || ''))?.[1] ?? ''
export const cookie = (t, maxAge = TTL / 1000) => `picked_owner=${t}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`
