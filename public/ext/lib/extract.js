/** Extract a bounded, serializable page snapshot without modifying the document.
 * Defaults allow Chrome to inject this self-contained function directly.
 * @param {Document} document
 * @param {string} url
 * @returns {object}
 */
export function extractPage(document = globalThis.document, url = globalThis.location.href) {
  const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
  const hidden = (element) => {
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(element.tagName)) return true;
    if (element.hasAttribute('hidden')) return true;
    const style = document.defaultView?.getComputedStyle?.(element);
    return (style?.display || element.style?.display) === 'none'
      || ['hidden', 'collapse'].includes(style?.visibility || element.style?.visibility);
  };
  const visible = (element) => {
    for (let current = element; current; current = current.parentElement) {
      if (hidden(current)) return false;
    }
    return true;
  };
  const textOf = (node) => {
    if (node.nodeType === 3) return node.textContent;
    if (node.nodeType !== 1 || hidden(node)) return '';
    return Array.from(node.childNodes, textOf).join(' ');
  };
  const allHeadings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'))
    .filter(visible).map((h) => ({ level: Number(h.tagName.slice(1)), text: clean(textOf(h)) }));
  const jsonld = [];
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const value = JSON.parse(script.textContent);
      if (value && typeof value === 'object') jsonld.push(value);
    } catch { /* Malformed publisher markup is ignored. */ }
    if (jsonld.length === 10) break;
  }
  const types = new Set();
  const stack = [...jsonld];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    const values = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
    for (const value of values) if (typeof value === 'string') types.add(value);
    stack.push(...Object.values(node).filter((value) => value && typeof value === 'object'));
  }
  const links = { internal: 0, external: 0 };
  const origin = new URL(url).origin;
  const resolve = (href) => {
    try { return new URL(href, document.baseURI && /^https?:/.test(document.baseURI) ? document.baseURI : url); }
    catch { return null; }
  };
  for (const anchor of document.querySelectorAll('a[href]')) {
    const target = resolve(anchor.getAttribute('href'));
    if (target && ['http:', 'https:'].includes(target.protocol)) {
      links[target.origin === origin ? 'internal' : 'external']++;
    }
  }
  const canonical = document.querySelector('link[rel~="canonical"]')?.getAttribute('href');
  return {
    url, title: clean(document.title),
    description: clean(document.querySelector('meta[name="description"]')?.getAttribute('content')),
    headings: allHeadings.slice(0, 30), text: clean(textOf(document.body)).slice(0, 8000),
    jsonld, schemaTypes: [...types],
    hasFaq: [...types].some((type) => /(?:^|[/#])FAQPage$/.test(type))
      || allHeadings.filter((h) => h.text.endsWith('?')).length >= 3,
    canonical: canonical ? resolve(canonical)?.href || '' : '',
    lang: document.documentElement?.getAttribute('lang') || '', links,
  };
}

/** The deep read: everything the page shows a visitor, plus what it loads. Self-contained (Chrome injects it into the tab) and read-only.
 *  It sees the page as the visitor's own browser rendered it, which is exactly what a blocked robot cannot see. */
export function extractDeep() {
  const clean = (v) => (v || '').replace(/\s+/g, ' ').trim();
  const doc = document, here = location.href, origin = location.origin;
  const body = doc.body;
  const text = clean(body?.innerText || '').slice(0, 30000);
  const headings = Array.from(doc.querySelectorAll('h1,h2,h3,h4'), (h) => ({ level: Number(h.tagName.slice(1)), text: clean(h.innerText) })).filter((h) => h.text).slice(0, 60);
  const jsonld = [];
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) { try { const v = JSON.parse(s.textContent); if (v && typeof v === 'object') jsonld.push(v); } catch { /* ignored */ } if (jsonld.length >= 12) break; }
  const types = new Set(), stack = [...jsonld];
  while (stack.length) { const n = stack.pop(); if (!n || typeof n !== 'object') continue; for (const t of Array.isArray(n['@type']) ? n['@type'] : [n['@type']]) if (typeof t === 'string') types.add(t); stack.push(...Object.values(n).filter((x) => x && typeof x === 'object')); }
  const meta = (sel) => clean(doc.querySelector(sel)?.getAttribute('content'));
  const internal = [], external = new Map();
  for (const a of doc.querySelectorAll('a[href]')) {
    let u; try { u = new URL(a.getAttribute('href'), here); } catch { continue; }
    if (!/^https?:$/.test(u.protocol)) continue;
    if (u.origin === origin) { if (internal.length < 60) internal.push({ path: u.pathname + u.search, text: clean(a.innerText).slice(0, 60) }); }
    else external.set(u.hostname, (external.get(u.hostname) || 0) + 1);
  }
  const imgs = Array.from(doc.images);
  const resources = performance.getEntriesByType('resource');
  const hosts = new Map();
  for (const r of resources) { try { const h = new URL(r.name).hostname; if (h !== location.hostname) hosts.set(h, (hosts.get(h) || 0) + 1); } catch { /* data: urls */ } }
  const nav = performance.getEntriesByType('navigation')[0];
  const prices = [...new Set((text.match(/(?:₫\s?\d[\d.,]*|\d[\d.,]*\s?(?:₫|đ|VND|vnđ)|\$\s?\d[\d.,]*)/gi) || []).slice(0, 12))];
  const contacts = [...new Set([...(text.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || []), ...(text.match(/(?:\+?84|0)[\s.-]?\d{2,3}[\s.-]?\d{3}[\s.-]?\d{3,4}/g) || [])])].slice(0, 6);
  return {
    url: here, title: clean(doc.title), description: meta('meta[name="description"]'), lang: doc.documentElement.getAttribute('lang') || '',
    canonical: doc.querySelector('link[rel~="canonical"]')?.href || '', robotsMeta: meta('meta[name="robots"]'),
    og: { title: meta('meta[property="og:title"]'), type: meta('meta[property="og:type"]'), image: meta('meta[property="og:image"]') ? 'set' : '', site: meta('meta[property="og:site_name"]') },
    headings, text, schemaTypes: [...types], jsonld: jsonld.slice(0, 6).map((j) => JSON.stringify(j).slice(0, 700)),
    hasFaq: [...types].some((t) => /FAQPage$/.test(t)) || headings.filter((h) => h.text.endsWith('?')).length >= 3,
    links: { internal: internal.length, external: [...external.values()].reduce((a, b) => a + b, 0), sample: internal.slice(0, 40), outside: [...external.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([h, n]) => `${h} (${n})`) },
    images: { total: imgs.length, noAlt: imgs.filter((i) => !i.getAttribute('alt')).length },
    stats: { domNodes: doc.getElementsByTagName('*').length, scripts: doc.scripts.length, requests: resources.length, thirdParty: [...hosts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([h, n]) => `${h} (${n})`), loadMs: nav ? Math.round(nav.loadEventEnd || nav.domContentLoadedEventEnd) : null },
    prices, contacts,
  };
}
