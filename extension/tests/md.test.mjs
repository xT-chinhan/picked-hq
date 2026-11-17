import test from 'node:test'; import assert from 'node:assert/strict';
import { parseInline, parseMd } from '../lib/md.js';

test('inline: bold, code and links become data, text stays text', () => {
  assert.deepEqual(parseInline('a **b** `c` [d](https://e.com) f').map((x) => x.t), ['text', 'b', 'text', 'code', 'text', 'a', 'text']);
  assert.equal(parseInline('[x](https://e.com)')[0].href, 'https://e.com');
});
test('links only accept http(s): a javascript: link stays plain text', () => {
  assert.deepEqual(parseInline('[x](javascript:alert(1))').map((p) => p.t), ['text']);
});
test('blocks: heading, paragraph, bullets, numbers, quote', () => {
  const b = parseMd('# Title\nplain line\n\n- one\n- two\n\n1. first\n2) second\n\n> quoted');
  assert.deepEqual(b.map((x) => x.k), ['h', 'p', 'ul', 'ol', 'quote']);
  assert.equal(b[2].items.length, 2); assert.equal(b[3].items.length, 2);
});
test('markup in text is never interpreted: it is returned as plain text', () => {
  const b = parseMd('<img src=x onerror=alert(1)> **ok**');
  assert.equal(b[0].inline[0].t, 'text'); assert.match(b[0].inline[0].v, /<img/);
});
