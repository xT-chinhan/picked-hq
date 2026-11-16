import test from 'node:test'
import assert from 'node:assert/strict'
import { BRANDS, CATEGORY, findBrand } from '../directory.mjs'

test('finds a known brand regardless of case, spacing and ampersand', () => {
  assert.equal(findBrand('lock & lock')?.name, 'Lock&Lock')
  assert.equal(findBrand(' ELMICH ')?.website, 'https://elmich.vn')
  assert.equal(findBrand('Sun house')?.name, 'Sunhouse')
})

test('returns null for unknown or empty names', () => {
  assert.equal(findBrand('Acme'), null)
  assert.equal(findBrand(''), null)
  assert.equal(findBrand(undefined), null)
})

test('every directory brand has a name, an https website and the shared category exists', () => {
  assert.ok(CATEGORY.length > 3)
  for (const b of BRANDS) { assert.ok(b.name && b.note); assert.match(b.website, /^https:\/\//) }
})
