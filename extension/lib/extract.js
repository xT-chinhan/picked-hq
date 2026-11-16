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
