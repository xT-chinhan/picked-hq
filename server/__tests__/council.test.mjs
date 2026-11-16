import test from 'node:test'
import assert from 'node:assert/strict'
import { gather, mergeVerdicts, tally } from '../council.mjs'

const ans = (engine, list) => ({ engine, json: { verdicts: list.map(([id, supported, why = '']) => ({ id, supported, why })) } })

test('majority decides and a tie is not supported', () => {
  const { verdicts, votes } = mergeVerdicts([ans('a', [['s1', true], ['s2', true], ['s3', false]]), ans('b', [['s1', true], ['s2', false], ['s3', false, 'no source']]), ans('c', [['s1', true], ['s2', false, 'too strong'], ['s3', true]])])
  const by = Object.fromEntries(verdicts.map((v) => [v.id, v]))
  assert.equal(by.s1.supported, true); assert.equal(by.s2.supported, false); assert.equal(by.s3.supported, false)
  assert.equal(by.s2.why, 'too strong'); assert.equal(votes.s2.length, 3)
  const tie = mergeVerdicts([ans('a', [['x', true]]), ans('b', [['x', false, 'nope']])])
  assert.equal(tie.verdicts[0].supported, false); assert.equal(tie.verdicts[0].why, 'nope')
})

test('ignores malformed verdicts and works with a single engine', () => {
  const { verdicts } = mergeVerdicts([{ engine: 'a', json: { verdicts: [{ id: 's1', supported: 'yes' }, { supported: true }, { id: 's2', supported: true, why: 'matches f1' }] } }, { engine: 'b', json: null }])
  assert.deepEqual(verdicts, [{ id: 's2', supported: true, why: 'matches f1' }])
})

test('tally reports unanimity and the split sentences', () => {
  const { votes } = mergeVerdicts([ans('a', [['s1', true], ['s2', true]]), ans('b', [['s1', true], ['s2', false]]), ans('c', [['s1', true], ['s2', false]])])
  assert.deepEqual(tally(votes), { sentences: 2, unanimous: 1, split: ['s2'] })
})

const later = (ms, v, fail = false) => new Promise((res, rej) => setTimeout(() => (fail ? rej(new Error('x')) : res(v)), ms))

test('gather returns once a majority answered and the grace period passed, without waiting for a slow engine', async () => {
  const t0 = Date.now()
  const got = await gather(['a', 'b', 'c'], (id) => later(id === 'c' ? 2000 : 10, id), { graceMs: 50 })
  assert.deepEqual(got.sort(), ['a', 'b']); assert.ok(Date.now() - t0 < 800)
})

test('gather waits for everyone when there is no majority yet, skips failures and handles nobody', async () => {
  const got = await gather(['a', 'b', 'c'], (id) => later(id === 'a' ? 10 : id === 'b' ? 80 : 120, id, id === 'b'), { graceMs: 20 })
  assert.deepEqual(got.sort(), ['a', 'c'])
  assert.deepEqual(await gather([], () => 1), [])
  assert.deepEqual(await gather(['a'], () => later(5, 'x', true)), [])
})
