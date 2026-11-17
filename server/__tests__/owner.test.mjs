import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as owner from '../owner.mjs'

const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'own-')), 'owner.json')

test('the password is stored only as a salted hash and checked in constant time', () => {
  assert.throws(() => owner.setPassword('short', file))
  owner.setPassword('correct horse battery', file)
  const raw = fs.readFileSync(file, 'utf8'); assert.ok(!raw.includes('correct horse')); assert.equal((fs.statSync(file).mode & 0o777), 0o600)
  assert.equal(owner.check('correct horse battery', file), true); assert.equal(owner.check('wrong', file), false); assert.equal(owner.check('', path.join(os.tmpdir(), 'nope.json')), false)
})
test('a login token is random, valid for eight hours, then expires, and can be revoked', () => {
  const t0 = 1_000_000, a = owner.issue(t0), b = owner.issue(t0)
  assert.notEqual(a, b); assert.ok(owner.valid(a, t0 + 1000)); assert.ok(!owner.valid(a, t0 + 8 * 3600 * 1000 + 1)); owner.revoke(b); assert.ok(!owner.valid(b, t0 + 1))
  assert.ok(!owner.valid('', t0) && !owner.valid('forged', t0))
})
test('the cookie is read only in its own form and is HttpOnly, Secure and SameSite=Strict', () => {
  assert.equal(owner.tokenFrom('a=1; picked_owner=abc_-9; b=2'), 'abc_-9'); assert.equal(owner.tokenFrom('picked_owner=bad token'), ''); assert.equal(owner.tokenFrom(undefined), '')
  assert.match(owner.cookie('x'), /HttpOnly; Secure; SameSite=Strict/)
})
