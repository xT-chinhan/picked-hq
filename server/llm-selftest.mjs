import { llm, MODELS, proxyStatus } from './llm.mjs'
const schema = { type: 'object', properties: { brands: { type: 'array', items: { type: 'string' } }, rank: { type: ['integer', 'null'] } }, required: ['brands', 'rank'] }
const prompt = 'Extract the brand names in order, and the 1-based rank of "Elmich" (null if absent). Text: Nên chọn Zojirushi, rồi Elmich, sau đó Lock&Lock.'
console.log('proxy:', await proxyStatus())
for (let i = 1; i <= 2; i++) { const t0 = Date.now(); const r = await llm.agyJson({ prompt, schema, model: MODELS.fast }); console.log(`call ${i}: ${Date.now() - t0}ms`, JSON.stringify(r)) }
const t1 = Date.now(); const par = await Promise.all([1, 2, 3].map((n) => llm.agyJson({ prompt: prompt + ' #' + n, schema })))
console.log(`3 parallel: ${Date.now() - t1}ms`, par.map((r) => r.rank).join(','))
