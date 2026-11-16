// Asks Gemini a second category's 40 buyer questions in real anonymous tabs (research only, no publishing) and saves the run for replay and the benchmark.
// usage: node scripts/category-run.mjs "nồi chiên không dầu" Sunhouse
import fs from 'node:fs'
import { runAudit } from '../server/audit.mjs'
const [category = 'nồi chiên không dầu', brand = 'Sunhouse'] = process.argv.slice(2)
const id = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + '-cat', t0 = Date.now(), events = []
const emit = (e) => { if (e.type === 'q.partial') return; events.push({ t: Date.now() - t0, ...e }); if (e.type === 'q.done') process.stdout.write('.'); if (e.type === 'q.error') process.stdout.write('x') }
const { summary } = await runAudit({ brand, category, total: 40, tabs: 5 }, emit)
const run = { id, brand, category, startedAt: t0, ms: Date.now() - t0, summary, events }
for (const d of ['server/data/runs', 'public/runs']) fs.writeFileSync(`${d}/${id}.json`, JSON.stringify(run))
console.log(`\n${id}: ${summary.answered}/40 answered in ${Math.round(run.ms / 1000)} s; top named:`, summary.competitors.slice(0, 8).map((c) => `${c.name} ${c.count}`).join(', '))
