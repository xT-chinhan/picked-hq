// usage: node server/cli.mjs <brand> <website> [category] [total] [reuseRunId]   (autoApprove on; for rehearsals)
import { runPipeline } from './pipeline.mjs'
const [brand = 'Elmich', website = 'https://elmich.vn', category = 'hộp cơm giữ nhiệt', total = '40', reuse = ''] = process.argv.slice(2)
const t0 = Date.now(), at = () => `[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s]`
let nq = 0
const show = {
  phase: (e) => `phase → ${e.phase}`,
  'site.done': (e) => `site audit: score ${e.audit.score}, blocked=${e.audit.blocked}, ${e.audit.checks.length} checks`,
  'facts.done': (e) => `facts: ${e.facts ? e.facts.facts.length + ' facts' : 'none (' + e.note + ')'}`,
  'research.done': (e) => `research: ${e.summary.mentioned}/${e.summary.total} mention ${e.summary.brand}`,
  'analysis.done': (e) => `analysis: ${e.missed.length} missed questions; pitch candidates ${e.sources.slice(0, 3).map((s) => s.domain).join(', ')}`,
  'content.done': (e) => `content: ${e.content.faqs.length} FAQs, pitch to ${e.content.pitch.to}`,
  'risk.done': (e) => `risk: confidence ${JSON.stringify(e.risk.confidence)} needsOwner=${e.risk.needsOwner} pii=${e.risk.pii.length} flags=${e.risk.flags.length}`,
  'approval.requested': (e) => `approval link ${e.approval.url}`,
  'approval.done': (e) => `approval ${e.status} ${JSON.stringify(e.decisions)}`,
  'publish.done': (e) => `publish: ${e.skipped ? 'skipped' : e.localUrl + ' files ' + e.files.join(',')}`,
  'track.done': (e) => `track: ${e.history.length} saved run(s) for this brand`,
  'stage.error': (e) => `ERROR in ${e.stage}: ${e.error}`,
  'run.done': (e) => `DONE in ${(e.ms / 1000).toFixed(0)}s ${e.note || ''}`,
}
const emit = (e) => { if (e.type === 'q.done' && ++nq % 10 === 0) console.log(at(), `answers ${nq}`); if (show[e.type]) console.log(at(), show[e.type](e)) }
await runPipeline({ brand, website, category, total: +total, tabs: 5, reuse, autoApprove: true }, emit, { runId: 'cli-' + Date.now(), port: 5198, awaitDecision: () => new Promise(() => {}) })
