// Measures every engine on the same grounded fact-check task (the job of the QA and Risk agents): time, tokens and accuracy.
// usage: node scripts/engine-bench.mjs [engineId ...]   (default: all)   Sequential on purpose; one call at a time.
import fs from 'node:fs'
import { ENGINES, call } from '../server/engines.mjs'

const facts = ['f1: Elmich thermal lunch boxes are made of 304 stainless steel.', 'f2: The 3-compartment model keeps food hot for up to 6 hours.', 'f3: Elmich offers a 12-month warranty.', 'f4: Same-day delivery is available only in Ho Chi Minh City.']
const claims = [
  ['c1', 'The lunch box is made of 304 stainless steel.', true], ['c2', 'It keeps food hot for 12 hours.', false], ['c3', 'Elmich gives a one-year warranty.', true],
  ['c4', 'Same-day delivery is available nationwide.', false], ['c5', 'It is the best lunch box in Vietnam.', false], ['c6', 'The model has three compartments.', true],
]
const schema = { type: 'object', additionalProperties: false, required: ['verdicts'], properties: { verdicts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'supported'], properties: { id: { type: 'string' }, supported: { type: 'boolean' } } } } } }
const prompt = `Facts:\n${facts.join('\n')}\n\nFor each claim say whether the facts fully support it (true) or not (false). A claim that goes beyond the facts, exaggerates or is not mentioned is false.\n${claims.map(([id, t]) => `${id}: ${t}`).join('\n')}`

const ids = process.argv.slice(2).length ? process.argv.slice(2) : ENGINES.map((e) => e.id)
const rows = []
for (const id of ids) {
  const e = ENGINES.find((x) => x.id === id)
  try {
    const r = await call(id, { prompt, schema, role: 'bench', fresh: true, timeoutMs: 170000 })
    const got = Object.fromEntries((r.json?.verdicts ?? []).map((v) => [v.id, v.supported]))
    const right = claims.filter(([cid, , want]) => got[cid] === want).length
    rows.push({ id, model: e.model, ms: r.ms, tokens: r.tokens || null, right, of: claims.length })
    console.log(`${id.padEnd(15)} ${String((r.ms / 1000).toFixed(1)).padStart(6)} s  ${right}/${claims.length}  ${r.tokens ? r.tokens + ' tok' : ''}`)
  } catch (err) {
    rows.push({ id, model: e.model, error: String(err.message).slice(0, 100) })
    console.log(`${id.padEnd(15)} FAILED ${String(err.message).slice(0, 90)}`)
  }
}
fs.writeFileSync(process.env.BENCH_OUT || '/tmp/engine-bench.json', JSON.stringify(rows, null, 1))
