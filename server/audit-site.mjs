// Runs the 39-check site audit for one URL in its own process and prints one JSON object.
// A separate process keeps a crash or a slow site away from the server, and lets it run with IPv6 autoselect off (see README).
// usage: node --no-network-family-autoselection server/audit-site.mjs <url>
import { auditSites } from './vendor/site-audit.mjs'

const url = process.argv[2]
const r = await auditSites({ website: url, userAgent: 'PickedBot/1.0 (+https://pickedhq.pages.dev)', budget: { pages: 4, requests: 24, delayMs: 300 } })
const s = r.sites?.[0]
console.log(JSON.stringify({
  score: r.score ?? null, blocked: !!s?.blockedAudit, unreachable: !s, host: r.hosts?.[0] ?? null,
  checks: (s?.checks ?? []).map((c) => ({ id: c.id, group: c.group, title: c.title, status: c.status, evidence: c.evidence, fix: c.fix })),
}))
