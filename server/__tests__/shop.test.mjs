import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML, DOMParser } from 'linkedom';
import robotsParser from 'robots-parser';
import { slugify, renderShopPage } from '../shop.mjs';

const input = {
  brand: 'Bếp Việt', slug: 'bep-viet', category: 'Hộp cơm', website: 'https://brand.test/',
  baseUrl: 'https://picked.test/shops/bep-viet', publishedAt: '2026-11-16T10:00:00Z',
  facts: { brand: 'Bếp Việt', website: 'https://brand.test/', facts: [
    { id: 'f1', kind: 'product', text: 'Hộp cơm inox.', source: 'https://brand.test/' },
    { id: 'f2', kind: 'price', text: '<script>alert("x")</script> & giá', source: 'https://brand.test/' },
    { id: 'f3', kind: 'contact', text: 'Liên hệ cửa hàng.', source: 'https://brand.test/contact?a=1&b=2' },
  ] },
  content: {
    faqs: [{ q: 'Chất liệu?', a: 'Inox.', refs: ['f1'] }, { q: 'Giá?', a: 'Xem giá tại cửa hàng.', refs: ['f2'] }],
    overview: { title: 'Giới thiệu', paragraphs: [{ text: 'Hộp cơm inox.', refs: ['f1'] }] },
    pitch: { to: 'Ban biên tập', subject: 'Mời đánh giá', body: [] },
  },
};

test('slugify removes Vietnamese diacritics and trims separators', () => {
  assert.equal(slugify('Hộp cơm Đà Nẵng'), 'hop-com-da-nang');
  assert.equal(slugify('  ĐẶC BIỆT & inox! '), 'dac-biet-inox');
  assert.equal(slugify(''), '');
});

test('renders Vietnamese HTML, parseable JSON-LD, source links, metadata and escaped facts', () => {
  const files = renderShopPage(input);
  assert.deepEqual(Object.keys(files), ['index.html', 'llms.txt', 'llms-full.txt', 'sitemap.xml', 'robots.txt']);
  const html = files['index.html'];
  const { document } = parseHTML(html);
  assert.equal(document.documentElement.lang, 'vi');
  assert.equal(document.querySelector('meta[name=description]').content, input.content.overview.paragraphs[0].text);
  const graph = JSON.parse(document.querySelector('script').textContent)['@graph'];
  assert.equal(graph[0]['@type'], 'Organization'); assert.equal(graph[0].name, input.brand); assert.equal(graph[0].url, input.website);
  assert.equal(graph[0].description, input.content.overview.paragraphs[0].text);
  assert.equal(graph[1]['@type'], 'FAQPage');
  assert.equal(graph[1].mainEntity.length, input.content.faqs.length);
  assert.equal(document.querySelectorAll('article h3').length, 2);
  assert.equal(document.querySelectorAll('section:last-child a').length, 2);
  assert.ok(html.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; giá'));
  assert.equal(document.querySelectorAll('script').length, 1);
  assert.equal(document.querySelectorAll('script[src], link[rel=stylesheet], img').length, 0);
  assert.ok(document.querySelector('footer').textContent.includes('chủ thương hiệu đã duyệt'));
  assert.equal(document.querySelector('time').textContent, '16/11/2026');
});

test('escapes dynamic attributes and script terminators without corrupting JSON-LD values', () => {
  const malicious = '</ScRiPt><script>alert(1)</script>" &';
  const data = structuredClone(input);
  data.brand = data.slug = data.category = data.content.overview.title = malicious;
  data.content.overview.paragraphs[0].text = malicious;
  data.content.faqs[0].q = data.content.faqs[0].a = malicious;
  const { document } = parseHTML(renderShopPage(data)['index.html']);
  assert.equal(document.querySelectorAll('script').length, 1);
  assert.equal(document.querySelector('header').id, malicious);
  assert.equal(document.querySelector('h1').textContent, malicious);
  assert.equal(document.querySelector('meta[name=description]').content, malicious);
  const graph = JSON.parse(document.querySelector('script').textContent)['@graph'];
  assert.equal(graph[0].name, malicious);
  assert.equal(graph[1].mainEntity[0].acceptedAnswer.text, malicious);
});

test('renders llms sections with unique sources and working FAQ anchors', () => {
  const files = renderShopPage(input);
  const text = files['llms.txt'];
  assert.ok(text.startsWith(`# ${input.brand}\n`));
  assert.ok(text.includes('> Hộp cơm inox.'));
  assert.ok(text.includes('## Thông tin chính'));
  assert.ok(text.includes('## Hỏi đáp'));
  assert.equal(text.match(/^- /gm).length, 4);
  input.content.faqs.forEach((faq, index) => {
    assert.ok(text.includes(`[${faq.q}](${input.baseUrl}#faq-${index + 1}): ${faq.a}`));
    assert.ok(files['index.html'].includes(`id="faq-${index + 1}"`));
  });
});

test('sitemap XML escapes URLs and robots explicitly allows each requested bot', () => {
  const data = { ...input, baseUrl: `${input.baseUrl}?a=1&b=2` };
  const files = renderShopPage(data);
  assert.ok(files['sitemap.xml'].includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'));
  assert.ok(files['sitemap.xml'].includes('?a=1&amp;b=2'));
  const xml = new DOMParser().parseFromString(files['sitemap.xml'], 'text/xml');
  assert.equal(xml.querySelector('loc').textContent, data.baseUrl);
  assert.equal(xml.querySelector('lastmod').textContent, '2026-11-16');
  const robots = robotsParser('https://picked.test/robots.txt', files['robots.txt']);
  for (const bot of ['*', 'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'ClaudeBot', 'Google-Extended']) {
    assert.ok(files['robots.txt'].includes(`User-agent: ${bot}\nAllow: /`));
    assert.equal(robots.isAllowed(input.baseUrl, bot), true);
  }
  assert.deepEqual(robots.getSitemaps(), [`${input.baseUrl}/sitemap.xml`]);
});

test('rendering is deterministic, does not mutate inputs and rejects unsafe URLs or invalid dates', () => {
  const before = structuredClone(input);
  assert.deepEqual(renderShopPage(input), renderShopPage(input));
  assert.deepEqual(input, before);
  assert.throws(() => renderShopPage({ ...input, website: 'javascript:alert(1)' }), /HTTP/);
  assert.throws(() => renderShopPage({ ...input, baseUrl: 'invalid' }), /HTTP/);
  assert.throws(() => renderShopPage({ ...input, publishedAt: 'invalid' }), /valid date/);
  assert.throws(() => renderShopPage({ ...input, facts: { facts: [{ source: 'javascript:alert(1)' }] } }), /fact source/);
});

test('Organization lists sameAs links, the page carries Open Graph tags, and llms-full.txt quotes every fact with its source', () => {
  const files = renderShopPage(input), { document } = parseHTML(files['index.html']);
  const org = JSON.parse(document.querySelector('script').textContent)['@graph'][0];
  assert.ok(Array.isArray(org.sameAs) && org.sameAs.includes(input.website) && org.sameAs.length <= 6);
  for (const url of org.sameAs) assert.match(url, /^https?:\/\//);
  assert.equal(document.querySelector('meta[property="og:type"]').content, 'website');
  assert.equal(document.querySelector('meta[property="og:url"]').content, input.baseUrl);
  const full = files['llms-full.txt'];
  assert.match(full, /^# Bếp Việt/);
  for (const fact of input.facts.facts) { assert.ok(full.includes(fact.text)); assert.ok(full.includes(fact.source)); }
  for (const faq of input.content.faqs) assert.ok(full.includes(faq.a));
});
