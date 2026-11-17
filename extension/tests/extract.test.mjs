import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { extractPage } from '../lib/extract.js';

const dom = (html) => parseHTML(html).document;

test('extracts bounded visible text and headings', () => {
  const d = dom(`<html><head><title>Title</title></head><body><h1>Welcome?</h1><h2>Next</h2><p>${'x '.repeat(5000)}</p><script>bad</script><style>bad</style><noscript>bad</noscript></body></html>`);
  const page = extractPage(d, 'https://example.com/a');
  assert.equal(page.title, 'Title');
  assert.equal(page.headings.length, 2);
  assert.ok(page.text.length <= 8000);
  assert.equal(page.text.includes('bad'), false);
  assert.equal(page.hasFaq, false);
});

test('parses valid JSON-LD and collects nested graph types', () => {
  const d = dom(`<head><script type="application/ld+json">{"@type":"FAQPage","@graph":[{"@type":["Question","Thing"]},{"nested":{"@type":"Answer"}}]}</script><script type="application/ld+json">oops</script></head><body><h1>Q?</h1></body>`);
  const page = extractPage(d, 'https://example.com');
  assert.equal(page.jsonld.length, 1);
  assert.deepEqual(page.schemaTypes.sort(), ['Answer','FAQPage','Question','Thing']);
  assert.equal(page.hasFaq, true);
});

test('detects FAQ from question headings and metadata', () => {
  const d = dom('<body><h2>One?</h2><h2>Two?</h2><h3>Three?</h3></body>');
  assert.equal(extractPage(d, 'https://example.com').hasFaq, true);
});

test('extracts canonical language description and link counts', () => {
  const d = dom('<html lang="vi"><head><meta name="description" content="Desc"><link rel="canonical" href="https://example.com/c"></head><body><a href="/x">i</a><a href="https://other.test/x">e</a><a href="mailto:x@y">m</a></body></html>');
  const page = extractPage(d, 'https://example.com/a');
  assert.equal(page.description, 'Desc'); assert.equal(page.canonical, 'https://example.com/c'); assert.equal(page.lang, 'vi');
  assert.deepEqual(page.links, { internal: 1, external: 1 });
});
