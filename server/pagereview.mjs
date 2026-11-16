// Page review: how readable and quotable is this page for an AI assistant? Deterministic checks over the payload the
// browser extension extracts; the only network use is a guarded look at the site's llms.txt.
import dns from 'node:dns/promises'
import net from 'node:net'

const words = (t) => (String(t).match(/\S+/gu) ?? []).length
const has = (types, ...names) => names.some((n) => types.some((t) => String(t).toLowerCase() === n.toLowerCase()))

/** True for addresses that must never be fetched on a visitor's behalf (loopback, private, link-local, metadata). */
export function isPrivateIp(ip) {
  if (net.isIPv6(ip)) { const v = ip.toLowerCase(); return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:') && isPrivateIp(v.slice(7)) }
  const [a, b] = ip.split('.').map(Number)
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
}

/** Looks up <origin>/llms.txt. Only public https/http hosts; short timeout; never throws. Returns 'found' | 'missing' | 'skipped'. */
export async function probeLlmsTxt(pageUrl, { fetchImpl = fetch, lookup = dns.lookup } = {}) {
  try {
    const u = new URL(pageUrl)
    if (!/^https?:$/.test(u.protocol) || u.port && !['80', '443'].includes(u.port)) return 'skipped'
    const ips = net.isIP(u.hostname) ? [{ address: u.hostname }] : await lookup(u.hostname, { all: true })
    if (!ips.length || ips.some((x) => isPrivateIp(x.address))) return 'skipped'
    const r = await fetchImpl(`${u.origin}/llms.txt`, { redirect: 'manual', signal: AbortSignal.timeout(4000), headers: { 'user-agent': 'PickedBot/1.0 (+https://pickedhq.pages.dev)' } })
    return r.status === 200 && /text\/(plain|markdown)/.test(r.headers.get('content-type') || '') ? 'found' : 'missing'
  } catch { return 'skipped' }
}

/** @returns {{ score: number, checks: {id,status,label,detail}[], summary: string }} */
export function reviewPage(page, { llms = 'skipped' } = {}) {
  const p = page ?? {}, title = String(p.title ?? '').trim(), desc = String(p.description ?? '').trim(), text = String(p.text ?? ''), types = Array.isArray(p.schemaTypes) ? p.schemaTypes : []
  const h1 = (p.headings ?? []).filter((h) => h.level === 1).length, n = words(text)
  const checks = []
  const add = (id, status, label, detail) => checks.push({ id, status, label, detail })
  add('title', title.length >= 10 && title.length <= 70 ? 'pass' : title ? 'warn' : 'fail', 'Page title', title ? `${title.length} characters` : 'missing')
  add('description', desc.length >= 50 && desc.length <= 170 ? 'pass' : desc ? 'warn' : 'fail', 'Meta description', desc ? `${desc.length} characters (50 to 170 reads best)` : 'missing: assistants fall back to guessing a summary')
  add('h1', h1 === 1 ? 'pass' : h1 ? 'warn' : 'fail', 'One main heading', h1 === 1 ? 'exactly one H1' : h1 ? `${h1} H1 headings` : 'no H1')
  add('content', n >= 300 ? 'pass' : n >= 120 ? 'warn' : 'fail', 'Enough text to quote', `${n} words`)
  add('schema-org', has(types, 'Organization', 'LocalBusiness', 'Store', 'OnlineStore') ? 'pass' : 'fail', 'Organization data (JSON-LD)', has(types, 'Organization', 'LocalBusiness', 'Store', 'OnlineStore') ? 'found' : 'no Organization or LocalBusiness block: assistants cannot confirm who the brand is')
  add('schema-product', has(types, 'Product', 'ItemList', 'Offer') ? 'pass' : 'warn', 'Product data (JSON-LD)', has(types, 'Product', 'ItemList', 'Offer') ? 'found' : 'no Product block with price and availability')
  add('faq', p.hasFaq ? 'pass' : 'fail', 'Questions answered on the page', p.hasFaq ? 'FAQ found' : 'no FAQ: this is what buyer questions to an assistant match against')
  add('price', /(\d[\d.,]*\s?(₫|đ|vnd|vnđ|k\b))|(\$\s?\d)/iu.test(text) ? 'pass' : 'warn', 'A visible price', /(\d[\d.,]*\s?(₫|đ|vnd|vnđ|k\b))|(\$\s?\d)/iu.test(text) ? 'found' : 'no price in the text')
  add('contact', /(\+?84|0)[\s.-]?\d{2,3}[\s.-]?\d{3}[\s.-]?\d{3,4}|@[\w-]+\.\w+/u.test(text) || has(types, 'ContactPoint') ? 'pass' : 'warn', 'Contact details', 'phone, email or ContactPoint')
  add('canonical', p.canonical ? 'pass' : 'warn', 'Canonical address', p.canonical ? 'set' : 'missing')
  add('lang', p.lang ? 'pass' : 'warn', 'Language declared', p.lang || 'missing')
  if (llms !== 'skipped') add('llms', llms === 'found' ? 'pass' : 'warn', 'llms.txt', llms === 'found' ? 'the site publishes one' : 'not found at the site root')
  const pts = checks.reduce((s, c) => s + (c.status === 'pass' ? 1 : c.status === 'warn' ? 0.5 : 0), 0)
  const score = Math.round((pts / checks.length) * 100), fails = checks.filter((c) => c.status === 'fail')
  const summary = fails.length ? `${score}/100. Fix first: ${fails.slice(0, 3).map((c) => c.label.toLowerCase()).join(', ')}.` : `${score}/100. No blocking gaps.`
  return { score, checks, summary }
}
