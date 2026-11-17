// GEO Copilot: from one website, find where the business lives online, check that every place tells the same story
// (the same name, address and phone is how an AI assistant recognises one entity), and draft the files that fix it.
// Everything here is read from the site's own public HTML; platforms that do not admit robots are listed as links, never fetched.
import { parseHTML } from 'linkedom'

const UA = 'PickedBot/1.0 (+https://pickedhq.pages.dev)'
const PLATFORMS = [
  ['facebook', /(^|\.)facebook\.com$|(^|\.)fb\.com$/], ['instagram', /(^|\.)instagram\.com$/], ['tiktok', /(^|\.)tiktok\.com$/], ['youtube', /(^|\.)youtube\.com$|^youtu\.be$/],
  ['zalo', /(^|\.)zalo\.me$/], ['shopee', /(^|\.)shopee\.vn$/], ['lazada', /(^|\.)lazada\.vn$/], ['tiki', /(^|\.)tiki\.vn$/], ['linkedin', /(^|\.)linkedin\.com$/], ['x', /^(www\.)?(x|twitter)\.com$/],
  ['maps', /^(www\.)?google\.[a-z.]+$|^maps\.app\.goo\.gl$|^goo\.gl$|^g\.page$/],
]
const ORG_TYPES = /^(Organization|LocalBusiness|Store|OnlineStore|Corporation|Restaurant|CafeOrCoffeeShop|Brand)$/
const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()
/** Vietnamese phone numbers in one shape: digits only, +84 written as 0. */
export const normPhone = (p) => { let d = String(p ?? '').replace(/[^\d+]/g, ''); if (d.startsWith('+84')) d = '0' + d.slice(3); else if (d.startsWith('84') && d.length >= 11) d = '0' + d.slice(2); d = d.replace(/\D/g, ''); return /^0(1900|1800)/.test(d) ? d.slice(1) : d } // hotlines 1900/1800 are written without the 0
const plain = (s) => clean(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
export const platformOf = (url) => { try { const u = new URL(url), h = u.hostname.replace(/^www\./, ''); for (const [k, re] of PLATFORMS) if (re.test(h) || re.test(u.hostname)) { if (k === 'maps' && !/maps|goo\.gl|g\.page/.test(u.hostname + u.pathname)) continue; return k } } catch { /* not a url */ } return null }

function orgNodes(jsonld) {
  const out = [], stack = [...jsonld]
  while (stack.length) {
    const n = stack.pop(); if (!n || typeof n !== 'object') continue
    if (Array.isArray(n)) { stack.push(...n); continue }
    const types = [].concat(n['@type'] ?? [])
    if (types.some((t) => ORG_TYPES.test(String(t)))) out.push(n)
    if (n['@graph']) stack.push(n['@graph'])
  }
  return out
}
const addressOf = (a) => (!a ? '' : typeof a === 'string' ? clean(a) : clean([a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode, a.addressCountry?.name ?? a.addressCountry].filter(Boolean).join(', ')))

/** Pure: everything the homepage says about who the business is. */
export function extractIdentity(html, url) {
  const { document } = parseHTML(html), origin = new URL(url).origin
  const meta = (sel) => clean(document.querySelector(sel)?.getAttribute('content'))
  const jsonld = []
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) { try { jsonld.push(JSON.parse(s.textContent)) } catch { /* broken markup is ignored */ } }
  const orgs = orgNodes(jsonld), org = orgs.find((o) => o.sameAs || o.telephone || o.address) ?? orgs[0] ?? null
  const text = clean(document.body?.textContent ?? '')
  const profiles = new Map(), internal = []
  for (const a of document.querySelectorAll('a[href]')) {
    let u; try { u = new URL(a.getAttribute('href'), url) } catch { continue }
    if (!/^https?:$/.test(u.protocol)) continue
    const k = platformOf(u.href)
    if (k && u.pathname.length > 1 && !/\/(sharer|share|intent|dialog)\b/.test(u.pathname)) { if (!profiles.has(k)) profiles.set(k, u.href.split('#')[0]) }
    else if (u.origin === origin && internal.length < 40) { const t = clean(a.textContent).slice(0, 60); if (t && !internal.some((x) => x.url === u.href)) internal.push({ url: u.origin + u.pathname, text: t }) }
  }
  const sameAs = [].concat(org?.sameAs ?? []).filter((x) => typeof x === 'string')
  const telLinks = [...document.querySelectorAll('a[href^="tel:"]')].map((a) => normPhone(a.getAttribute('href').slice(4)))
  const noIds = text.replace(/(MST|Mã số thuế|Mã số doanh nghiệp|Mã số DN|GPKD|Tax code|Số ĐKKD)[^0-9]{0,24}[\d][\d.\s-]{8,16}/gi, ' ') // tax and licence numbers look like phones
  const textPhones = (noIds.match(/(?:\+?84|0)[\s.-]?\d{2,3}[\s.-]?\d{3}[\s.-]?\d{3,4}/g) ?? []).map(normPhone)
  const orgPhones = [org?.telephone, ...[].concat(org?.contactPoint ?? []).map((c) => c?.telephone)].filter(Boolean).map(normPhone)
  const count = new Map(); for (const p of [...telLinks, ...textPhones]) if (p.length >= 9 && p.length <= 11) count.set(p, (count.get(p) ?? 0) + 1)
  const visiblePhones = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p).slice(0, 5)
  const addr = /(?:Địa chỉ|Address|Trụ sở)\s*[:：]\s*([^|•\n]{12,140}?)(?=\s{2,}|\s*(?:Điện thoại|Hotline|Email|Tel|ĐT|MST|Mã số)|$)/i.exec(text)?.[1]
  return {
    url, title: clean(document.title), description: meta('meta[name="description"]'), siteName: meta('meta[property="og:site_name"]'), logo: (() => { const l = (typeof org?.logo === 'string' ? org.logo : org?.logo?.url) || meta('meta[property="og:image"]'); try { return l ? new URL(l, url).href : '' } catch { return '' } })(),
    org: org ? { name: clean(org.name), telephone: orgPhones[0] ?? '', address: addressOf(org.address), hours: !!(org.openingHours || org.openingHoursSpecification), sameAs, raw: org } : null,
    visiblePhones, visibleAddress: clean(addr), emails: [...new Set(text.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/g) ?? [])].slice(0, 3),
    profiles: Object.fromEntries(profiles), internal,
  }
}

const fetchText = async (url, { fetchImpl = fetch, max = 1_500_000 } = {}) => {
  const r = await fetchImpl(url, { headers: { 'user-agent': UA, accept: 'text/html,text/plain;q=0.9,*/*;q=0.5' }, signal: AbortSignal.timeout(15000), redirect: 'follow' })
  return { ok: r.ok, status: r.status, type: r.headers.get('content-type') || '', text: (await r.text()).slice(0, max), url: r.url || url }
}

/** Finds the business's places online, starting from its own homepage. */
export async function discover(url, { fetchImpl = fetch, assert = async () => {} } = {}) {
  await assert(url)
  const page = await fetchText(url, { fetchImpl })
  const blocked = !page.ok || !/html/i.test(page.type)
  const id = blocked ? { url, title: '', description: '', siteName: '', logo: '', org: null, visiblePhones: [], visibleAddress: '', emails: [], profiles: {}, internal: [] } : extractIdentity(page.text, page.url)
  let llms = null
  try { const l = await fetchText(new URL('/llms.txt', url).href, { fetchImpl, max: 20000 }); if (l.ok && !/html/i.test(l.type)) llms = l.text } catch { /* no llms.txt */ }
  const host = new URL(url).hostname.replace(/^www\./, '')
  const sources = [{ id: 'website', kind: 'website', label: host, url: id.url, status: blocked ? 'blocked' : 'read', note: blocked ? `The site answered HTTP ${page.status} to our reader.` : 'Read by our robot' }]
  const seen = new Set()
  for (const [kind, href] of [...Object.entries(id.profiles), ...(id.org?.sameAs ?? []).map((h) => [platformOf(h), h])]) {
    if (!kind || seen.has(kind)) continue; seen.add(kind)
    // these platforms do not admit robots: we list the link and never fetch it; the owner can sign in to let the agent read it
    sources.push({ id: kind, kind, label: kind === 'maps' ? 'Google Maps' : kind[0].toUpperCase() + kind.slice(1), url: href, status: 'link', note: kind === 'maps' ? 'Linked from the site' : 'Linked from the site · sign in to let the agent read it', inSameAs: (id.org?.sameAs ?? []).some((s) => platformOf(s) === kind) })
  }
  return { url: id.url, host, blocked, identity: id, llms, sources }
}

const brandOf = (id, host) => clean(id.org?.name || id.siteName || id.title.split(/[|–—-]/)[0] || host)

/** Pure: does every place tell the same story? Each check names what it looked at. */
export function consistency(found, sources = found.sources) {
  const id = found.identity, checks = [], add = (key, status, label, detail) => checks.push({ id: key, status, label, detail })
  const kept = sources.filter((s) => s.kind !== 'website'), brand = brandOf(id, found.host)
  if (found.blocked) { add('reach', 'fail', 'The site lets our reader in', found.sources[0].note); return { brand, score: 0, checks } }
  add('org', id.org ? 'pass' : 'fail', 'The site declares who it is (Organization data)', id.org ? `Declared as “${id.org.name || 'unnamed'}”` : 'No Organization block: an assistant has to guess the business from the page text')
  const names = [id.org?.name, id.siteName, id.title].filter(Boolean), core = plain(brand).split(' ')[0]
  const off = names.filter((n) => !plain(n).includes(core))
  add('name', names.length < 2 ? 'warn' : off.length ? 'warn' : 'pass', 'One name everywhere on the site', names.length < 2 ? 'Only one place states the name, so there is nothing to confirm it' : off.length ? `“${brand}” is missing from: ${off.map((n) => `“${n.slice(0, 50)}”`).join(', ')}` : `“${brand}” appears in the title, the site name and the declared data`)
  const op = id.org?.telephone, vp = id.visiblePhones
  add('phone', op && vp.includes(op) ? 'pass' : op || vp.length ? 'warn' : 'fail', 'One phone number, declared and visible', op && vp.includes(op) ? `${op} is declared and shown on the page` : op ? `Declared ${op}, but the page shows ${vp.length ? vp.slice(0, 3).join(', ') : 'no number'}` : vp.length ? `The page shows ${vp.slice(0, 3).join(', ')}, but none is declared in the data` : 'No phone number found')
  const oa = id.org?.address, va = id.visibleAddress
  add('address', oa ? 'pass' : va ? 'warn' : 'fail', 'An address an assistant can quote', oa ? `Declared: ${oa.slice(0, 90)}` : va ? `Shown on the page (“${va.slice(0, 70)}”) but not declared in the data` : 'No address found')
  add('hours', id.org?.hours ? 'pass' : 'warn', 'Opening hours declared', id.org?.hours ? 'Declared in the data' : 'Not declared: “is it open now?” cannot be answered from the site')
  const missing = kept.filter((s) => s.kind !== 'maps' && !s.inSameAs)
  add('sameas', !kept.length ? 'warn' : missing.length ? 'fail' : 'pass', 'Every profile is tied to the business (sameAs)', !kept.length ? 'The site links to no social profile or marketplace' : missing.length ? `Linked on the page but not declared as the same business: ${missing.map((s) => s.label).join(', ')}` : `${kept.length} profiles declared as the same business`)
  add('maps', kept.some((s) => s.kind === 'maps') ? 'pass' : 'warn', 'A Google Maps place is linked', kept.some((s) => s.kind === 'maps') ? 'Linked from the site' : 'No Maps link: local questions (“near me”, “in District 7”) lean on Maps')
  add('llms', found.llms ? 'pass' : 'warn', 'A note for AI assistants (llms.txt)', found.llms ? 'Published' : 'Not published')
  for (const s of kept.filter((x) => x.facts?.title)) add(`p-${s.kind}`, plain(s.facts.title).includes(core) ? 'pass' : 'warn', `${s.label} carries the same name`, `Profile title: “${s.facts.title.slice(0, 70)}”`)
  const pts = checks.reduce((n, c) => n + (c.status === 'pass' ? 1 : c.status === 'warn' ? 0.5 : 0), 0)
  return { brand, score: Math.round((pts / checks.length) * 100), checks }
}

/** Pure: the files that fix what the checks found. Built only from facts read on the site and the profiles the owner confirmed. */
export function patches(found, sources = found.sources) {
  const id = found.identity, brand = brandOf(id, found.host), out = []
  if (found.blocked) return out
  const kept = sources.filter((s) => s.kind !== 'website')
  const phone = id.org?.telephone || id.visiblePhones[0] || '', address = id.org?.address || id.visibleAddress || ''
  const org = { '@context': 'https://schema.org', '@type': id.org?.raw?.['@type'] ?? 'Organization', name: brand, url: new URL('/', found.url).href, ...(id.logo ? { logo: id.logo } : {}), ...(id.description ? { description: id.description } : {}), ...(phone ? { telephone: phone } : {}), ...(id.org?.raw?.address && typeof id.org.raw.address === 'object' ? { address: id.org.raw.address } : address ? { address } : {}), ...(kept.length ? { sameAs: kept.map((s) => s.url) } : {}) }
  const before = id.org ? JSON.stringify({ '@type': id.org.raw['@type'], name: id.org.raw.name, telephone: id.org.raw.telephone, address: id.org.raw.address, sameAs: id.org.raw.sameAs }, null, 2) : ''
  const after = JSON.stringify(org, null, 2)
  if (after !== before) out.push({ id: 'org', file: 'Organization JSON-LD', where: 'In the <head> of every page, inside <script type="application/ld+json">', why: 'One declared identity (name, phone, address, profiles) is what lets an assistant treat the site, Maps and the social pages as one business.', hours: 2, before, after })
  if (!found.llms) {
    const pages = id.internal.filter((p) => p.text.length > 2).slice(0, 12)
    out.push({ id: 'llms', file: 'llms.txt', where: 'At the site root: /llms.txt', why: 'A short plain-text guide that tells AI assistants what the business is and which pages matter.', hours: 1.5, before: '', after: `# ${brand}\n\n> ${id.description || `${brand}: official website.`}\n\n## Key pages\n${pages.map((p) => `- [${p.text}](${p.url})`).join('\n') || `- [Home](${found.url})`}\n${phone || address ? `\n## Contact\n${phone ? `- Phone: ${phone}\n` : ''}${address ? `- Address: ${address}\n` : ''}` : ''}` })
  }
  out.push({ id: 'signal', file: 'robots.txt', where: 'Add one line to /robots.txt', why: 'States how AI systems may use the content: allowed for search and for answers, not for training.', hours: 0.5, before: '', after: 'Content-Signal: search=yes, ai-input=yes, ai-train=no' })
  return out
}
