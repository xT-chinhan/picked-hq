import test from 'node:test'
import assert from 'node:assert/strict'
import { parseLoose } from '../llm.mjs'

test('parses plain JSON and JSON wrapped in prose or fences', () => {
  assert.deepEqual(parseLoose('{"a":1}'), { a: 1 })
  assert.deepEqual(parseLoose('Here you go:\n```json\n{"a":[1,2]}\n```\nHope it helps'), { a: [1, 2] })
})

test('takes the first balanced object when the reply holds several', () => {
  assert.deepEqual(parseLoose('{"a":1}\n{"b":2}'), { a: 1 })
  assert.deepEqual(parseLoose('text {"s":"a } b"} tail {"x":1}'), { s: 'a } b' })
})

test('skips a broken start and throws when there is no JSON', () => {
  assert.deepEqual(parseLoose('see [note] then {"ok":true}'), { ok: true })
  assert.throws(() => parseLoose('no json here'))
})
