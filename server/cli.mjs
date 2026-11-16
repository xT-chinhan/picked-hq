import { runAudit } from './audit.mjs'
const [brand = 'Lock&Lock', category = 'hộp cơm giữ nhiệt', total = '8', tabs = '4'] = process.argv.slice(2)
const t0 = Date.now()
const { summary, results } = await runAudit({ brand, category, total: +total, tabs: +tabs }, (e) => {
  if (e.type === 'q.start') console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(3)}s] tab${e.slot} → q${e.qi + 1}: ${e.q.slice(0, 60)}`)
  if (e.type === 'q.done') console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(3)}s] ✓ q${e.qi + 1} ${(e.ms / 1000).toFixed(0)}s mentioned=${e.mentioned} rank=${e.rank} brands=[${e.brands.join(', ')}] sources=${e.domains.length}`)
  if (e.type === 'q.error') console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(3)}s] ✗ q${e.qi + 1} ${e.error}`)
})
console.log('\nSUMMARY', JSON.stringify(summary, null, 1))
