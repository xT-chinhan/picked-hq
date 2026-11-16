// Scores the files Picked generates for a brand as if they were deployed at the root of the shop's own domain
// (the audit reads the origin's homepage, robots.txt, llms.txt and sitemap), with the same 39 checks used on real sites.
// The folder is served on a loopback port only for the duration of the audit.
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { auditSites } from '../server/vendor/site-audit.mjs'

const slug = process.argv[2] || 'elmich', root = path.resolve('public/shops', slug)
const TYPES = { '.html': 'text/html; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' }
const srv = http.createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname, f = path.join(root, p === '/' ? 'index.html' : p)
  if (!f.startsWith(root) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404, { 'content-type': 'text/html' }); return res.end('<!doctype html><title>Not found</title><h1>404</h1>') }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f))
})
await new Promise((r) => srv.listen(0, '127.0.0.1', r))
const url = `http://127.0.0.1:${srv.address().port}/`
// the generated files name the public address in their links; the loopback copy answers the same paths
const r = await auditSites({ website: url, userAgent: 'PickedBot/1.0 (+https://pickedhq.pages.dev)', budget: { pages: 4, requests: 24, delayMs: 100 }, allowPrivateNetwork: true })
srv.close()
const s = r.sites[0]
if (!s) { console.error('no site audited', JSON.stringify(r.hosts)); process.exit(1) }
const audit = { score: r.score, blocked: !!s.blockedAudit, checks: s.checks.map((c) => ({ id: c.id, group: c.group, title: c.title, status: c.status, evidence: c.evidence, fix: c.fix })) }
const bench = JSON.parse(fs.readFileSync('public/data/benchmark.json', 'utf8'))
bench.published = { name: `${slug} (Picked files)`, note: 'The files Picked generates, served as the root of a shop domain', auditedAt: new Date().toISOString(), audit }
fs.writeFileSync('public/data/benchmark.json', JSON.stringify(bench))
console.log('Picked files score', audit.score)
