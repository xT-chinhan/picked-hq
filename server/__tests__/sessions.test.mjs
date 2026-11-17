import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'picked-prof-'))
process.env.PICKED_DATA_DIR = dir
const profiles = await import('../profiles.mjs')

test('profile names are safe folder names', () => {
  assert.equal(profiles.slugOf('Facebook'), 'facebook')
  assert.equal(profiles.slugOf('../../etc/passwd'), 'etc-passwd')
  assert.equal(profiles.slugOf('Lock&Lock Việt'), 'lock-lock-viet')
})
test('profiles live under the data folder, and signing out deletes everything saved for one', async () => {
  fs.mkdirSync(path.join(profiles.PROFILES, 'facebook'), { recursive: true }); fs.writeFileSync(path.join(profiles.PROFILES, 'facebook', 'Cookies'), 'x')
  assert.ok(profiles.PROFILES.startsWith(dir))
  assert.deepEqual(profiles.list().map((p) => p.slug), ['facebook'])
  await profiles.signOut('facebook')
  assert.equal(fs.existsSync(path.join(profiles.PROFILES, 'facebook')), false)
  assert.deepEqual(profiles.list(), [])
})
