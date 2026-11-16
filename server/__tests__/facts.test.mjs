import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchSiteText, extractFacts } from '../facts.mjs';

const HOME = 'https://example.test/';
const html = body => `<html><head><title> Thương hiệu Việt </title></head><body>${body}</body></html>`;

function fixture(routes) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, options) => {
      calls.push({ url, options, time: Date.now() });
      const path = new URL(url).pathname;
      const value = routes[path];
      if (value instanceof Error) throw value;
      if (value instanceof Response) return value.clone();
      if (value === undefined) return new Response('', { status: 404 });
      return new Response(value, { headers: { 'content-type': path.endsWith('.xml') ? 'application/xml' : path.endsWith('.txt') ? 'text/plain' : 'text/html' } });
    },
  };
}

test('extracts main text, removes excluded elements, and preserves paragraph breaks', async () => {
  const f = fixture({ '/robots.txt': '', '/': html(`
    <header>HEADER</header><p>OUTSIDE</p><main><h1>Sản phẩm Việt</h1>
    <p>Ấm <strong>siêu tốc</strong> chất lượng.</p><p>Bảo hành hai năm.</p>
    ${['script', 'style', 'noscript', 'svg', 'nav', 'footer', 'header', 'form', 'iframe'].map(tag => `<${tag}>REMOVED</${tag}>`).join('')}
    </main>`) });
  const result = await fetchSiteText(HOME, { ...f, maxPages: 1, delayMs: 0 });
  assert.equal(result.pages[0].title, 'Thương hiệu Việt');
  assert.equal(result.pages[0].text, 'Sản phẩm Việt\nẤm siêu tốc chất lượng.\nBảo hành hai năm.');
  assert.equal(result.blocked, false);
  assert.deepEqual(result.notes, []);
});

test('falls back to body and truncates at word boundaries within per-page and total budgets', async () => {
  const f = fixture({ '/robots.txt': '', '/': html('<p>Alpha beta gamma delta</p><a href="/product">Next</a>'), '/product': html('<p>Alpha beta gamma delta</p>') });
  const result = await fetchSiteText(HOME, { ...f, maxPages: 2, maxChars: 27, delayMs: 0 });
  assert.deepEqual(result.pages.map(page => page.text), ['Alpha beta', 'Alpha beta']);
  assert.ok(result.pages.reduce((sum, page) => sum + page.text.length, 0) <= 27);
  const boundary = await fetchSiteText(HOME, { ...f, maxPages: 1, maxChars: 10, delayMs: 0 });
  assert.equal(boundary.pages[0].text, 'Alpha beta');
});

test('returns blocked without fetching the homepage when robots disallows it', async () => {
  const f = fixture({ '/robots.txt': 'User-agent: PickedBot\nDisallow: /' });
  const result = await fetchSiteText(HOME, { ...f, delayMs: 0 });
  assert.equal(result.blocked, true);
  assert.deepEqual(result.pages, []);
  assert.equal(f.calls.length, 1);
});

test('prefers keyword links, deduplicates fragments, skips disallowed and non-HTML URLs, and survives errors', async () => {
  const f = fixture({
    '/robots.txt': 'User-agent: *\nDisallow: /policy',
    '/': html(`<main>Trang chủ</main>
      <a href="/news">Tin tức</a><a href="/product#one">Sản phẩm</a>
      <a href="/product#two">Sản phẩm</a><a href="/policy">Chính sách</a>
      <a href="/contact">Liên hệ</a><a href="/details">about</a>
      <a href="https://elsewhere.test/product">product</a><a href="/catalog.PDF">product</a>
      <a href="mailto:hello@example.test">contact</a><a href="#top">Đầu trang</a>`),
    '/product': html('<p>Sản phẩm</p>'), '/contact': new Error('offline failure'),
    '/details': html('<p>Giới thiệu</p>'), '/news': html('<p>Tin tức</p>'),
  });
  const result = await fetchSiteText(HOME, { ...f, maxPages: 3, delayMs: 0 });
  assert.deepEqual(result.pages.map(page => page.url), [HOME, `${HOME}product`, `${HOME}details`]);
  assert.deepEqual(f.calls.map(call => new URL(call.url).pathname), ['/robots.txt', '/', '/product', '/contact', '/details']);
  assert.ok(result.notes.some(note => note.includes('/policy')));
  assert.ok(result.notes.some(note => note.includes('offline failure')));
});

test('fills remaining slots from first eligible sitemap URLs', async () => {
  const f = fixture({ '/robots.txt': '', '/': html('<p>Trang chủ</p>'),
    '/sitemap.xml': `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>${HOME}</loc></url><url><loc>${HOME}one#first</loc></url>
      <url><loc>${HOME}one#second</loc></url><url><loc>${HOME}image.png</loc></url>
      <url><loc>https://elsewhere.test/</loc></url><url><loc>${HOME}two</loc></url>
      <url><loc>${HOME}three</loc></url></urlset>`,
    '/one': html('<p>Một</p>'), '/two': html('<p>Hai</p>'),
  });
  const result = await fetchSiteText(HOME, { ...f, maxPages: 3, delayMs: 0 });
  assert.deepEqual(result.pages.map(page => page.url), [HOME, `${HOME}one`, `${HOME}two`]);
});

test('checks robots on redirect targets and skips non-HTML responses', async () => {
  const f = fixture({ '/robots.txt': 'User-agent: *\nDisallow: /private',
    '/': html('<p>Trang chủ</p><a href="/product">Sản phẩm</a><a href="/download">Tải</a>'),
    '/product': new Response('', { status: 302, headers: { location: '/private' } }),
    '/download': new Response('binary', { headers: { 'content-type': 'application/pdf' } }),
  });
  const result = await fetchSiteText(HOME, { ...f, maxPages: 3, delayMs: 0 });
  assert.equal(result.pages.length, 1);
  assert.ok(!f.calls.some(call => call.url.endsWith('/private')));
  assert.ok(result.notes.some(note => note.includes('/download')));
});

test('spaces requests and sends the configured user agent', async () => {
  const f = fixture({ '/robots.txt': '', '/': html('<p>Trang chủ</p>') });
  await fetchSiteText(HOME, { ...f, maxPages: 1, userAgent: 'TestBot', delayMs: 30 });
  assert.ok(f.calls[1].time - f.calls[0].time >= 28);
  assert.ok(f.calls.every(call => call.options.headers['User-Agent'] === 'TestBot'));
});

test('reports unavailable robots and failed homepage without throwing', async () => {
  const f = fixture({ '/robots.txt': new Error('robots unavailable'), '/': new Error('page unavailable') });
  const result = await fetchSiteText(HOME, { ...f, delayMs: 0 });
  assert.deepEqual(result.pages, []);
  assert.ok(result.notes.some(note => note.includes('robots unavailable')));
  assert.ok(result.notes.some(note => note.includes('page unavailable')));
});

test('validates crawler options', async () => {
  await assert.rejects(fetchSiteText('file:///tmp/file'), /HTTP/);
  await assert.rejects(fetchSiteText(HOME, { maxPages: 0 }), /maxPages/);
  await assert.rejects(fetchSiteText(HOME, { maxChars: -1 }), /maxChars/);
  await assert.rejects(fetchSiteText(HOME, { delayMs: -1 }), /delayMs/);
});

test('extractFacts supplies grounding instructions and schema, filters, trims, deduplicates and numbers facts', async () => {
  const site = { pages: [{ url: HOME, text: 'Bảo hành hai năm.' }] };
  const llm = { async agyJson({ prompt, schema }) {
    assert.ok(prompt.includes(HOME));
    assert.ok(prompt.includes(site.pages[0].text));
    assert.ok(prompt.includes('tiếng Việt'));
    assert.equal(schema.properties.facts.items.properties.text.maxLength, 160);
    assert.equal(schema.properties.facts.items.properties.kind.enum.length, 7);
    return { facts: [
      { kind: 'policy', text: ' Bảo hành hai năm. ', source: HOME },
      { kind: 'policy', text: 'BẢO HÀNH HAI NĂM.', source: HOME },
      { kind: 'about', text: 'Không có nguồn', source: `${HOME}other` },
      { kind: 'about', text: '  ', source: HOME },
      { kind: 'feature', text: 'Có tay cầm.', source: HOME },
      { kind: 'invalid', text: 'Loại sai.', source: HOME },
      { kind: 'about', text: 'a'.repeat(161), source: HOME },
    ] };
  } };
  assert.deepEqual(await extractFacts({ brand: 'Việt', website: HOME, site }, llm), {
    brand: 'Việt', website: HOME, facts: [
      { id: 'f1', kind: 'policy', text: 'Bảo hành hai năm.', source: HOME },
      { id: 'f2', kind: 'feature', text: 'Có tay cầm.', source: HOME },
    ],
  });
});

test('extractFacts caps output at 40 facts and rejects empty pages before calling the LLM', async () => {
  const llm = { async agyJson() { return { facts: Array.from({ length: 45 }, (_, i) => ({ kind: 'about', text: `Dữ kiện ${i}`, source: HOME })) }; } };
  const result = await extractFacts({ brand: 'Việt', website: HOME, site: { pages: [{ url: HOME, text: 'Dữ kiện' }] } }, llm);
  assert.equal(result.facts.length, 40);
  assert.equal(result.facts.at(-1).id, 'f40');
  await assert.rejects(extractFacts({ brand: 'Việt', website: HOME, site: { pages: [] } }, null), { message: 'no readable pages' });
});

test('live Elmich site has readable text', { skip: process.env.LIVE !== '1' }, async () => {
  const result = await fetchSiteText('https://elmich.vn', { maxPages: 3 });
  assert.ok(result.pages.some(page => page.text.length > 0));
});
