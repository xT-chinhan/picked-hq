import test from 'node:test';
import assert from 'node:assert/strict';
import { scanPii, scanClaims, numbersIn, flattenContent, checkContent } from '../risk.mjs';

const facts = { brand: 'Picked', website: 'https://example.test', facts: [
  { id: 'f1', kind: 'feature', text: 'Giao hàng trong 6-8 giờ. Giá 189.000đ.', source: 'https://example.test' },
  { id: 'f2', kind: 'contact', text: 'Liên hệ HELLO@example.test hoặc 0908 123 456.', source: 'https://example.test/contact' },
] };
const contentWith = (text, refs = ['f1']) => ({
  faqs: [{ q: 'Thông tin?', a: text, refs }],
  overview: { title: 'Giới thiệu', paragraphs: [] },
  pitch: { to: 'Báo chí', subject: 'Thông tin', body: [] },
});
function fakeJudge(decide = () => true) {
  const calls = [];
  return {
    calls,
    async agyJson({ prompt, schema }) {
      const rows = JSON.parse(prompt.slice(prompt.indexOf('\n') + 1));
      calls.push(rows);
      assert.equal(schema.properties.verdicts.items.properties.supported.type, 'boolean');
      return { verdicts: rows.map(row => ({ id: row.id, supported: decide(row), why: 'evidence checked' })) };
    },
  };
}

test('PII recognizes Vietnamese phones, hotlines, email and identity numbers', () => {
  for (const phone of ['0908123456', '0908 123 456', '090.812.3456', '090-812-3456',
    '+84908123456', '+84 908 123 456', '84.908.123.456', '1800 6068', '1900 1234', '1900 123456']) {
    assert.deepEqual(scanPii(`Gọi ${phone}.`), [{ type: 'phone', match: phone }]);
  }
  assert.deepEqual(scanPii('HELLO@example.test'), [{ type: 'email', match: 'HELLO@example.test' }]);
  assert.deepEqual(scanPii('012345678901'), [{ type: 'national_id', match: '012345678901' }]);
  assert.deepEqual(scanPii('123456789'), [{ type: 'national_id', match: '123456789' }]);
  assert.deepEqual(scanPii('1234567890123456'), [{ type: 'bank_account', match: '1234567890123456' }]);
  assert.deepEqual(scanPii('1234567890'), [{ type: 'bank_account', match: '1234567890' }]);
});

test('PII excludes ordinary prices, years, ranges, embedded and overlong numbers', () => {
  assert.deepEqual(scanPii('Giá 189.000đ, năm 2026, giao 6-8 giờ.'), []);
  assert.deepEqual(scanPii('SKU123456789 a0908123456 12345678901234567'), []);
});

test('PII allow-list normalizes contact formatting and email case without overlap leaks', () => {
  assert.deepEqual(scanPii('090.812.3456 HELLO@example.test 012345678901', {
    allow: ['0908 123 456', 'hello@EXAMPLE.test', '012345678901'],
  }), []);
  assert.equal(scanPii('0908123456').length, 1);
});

test('claims detect every required phrase, case-insensitively with Unicode boundaries', () => {
  const phrases = {
    superlative: ['tốt nhất', 'số 1', 'số một', 'hàng đầu', 'đứng đầu', 'rẻ nhất', 'uy tín nhất', 'best'],
    absolute: ['100%', 'tuyệt đối', 'không bao giờ', 'duy nhất'],
    health: ['chữa', 'điều trị', 'trị bệnh', 'phòng ngừa bệnh', 'giảm cân', 'ung thư'],
    guarantee: ['cam kết hoàn tiền', 'đảm bảo 100%', 'bảo đảm'],
  };
  for (const [type, values] of Object.entries(phrases)) {
    for (const phrase of values) assert.ok(scanClaims(phrase.toUpperCase()).some(hit => hit.type === type), phrase);
  }
  assert.deepEqual(scanClaims('Giao hàng trong 6-8 giờ. Số 10. bestway.'), []);
  assert.equal(scanClaims('TỐT NHẤT, tốt nhất').length, 1);
  assert.equal(scanClaims('điều trị'.normalize('NFD'))[0].type, 'health');
});

test('numbers normalize prices, decimal commas, zeros and ranges without units', () => {
  assert.deepEqual(numbersIn('6-8 giờ; 189.000đ; 1.234.567,50 đồng; 02,5 kg; 2.50 kg; 0006; 8'),
    ['6', '8', '189000', '1234567.5', '2.5', '2.5', '6', '8']);
  assert.deepEqual(numbersIn('Không có số.'), []);
});

test('flatten splits Vietnamese sentences, preserves price dots, inherits and copies refs', () => {
  const content = contentWith('Giá 189.000đ. Giao nhanh! Có sẵn?\nĐặt ngay');
  content.overview.paragraphs.push({ text: 'Giới thiệu.', refs: ['f2'] });
  content.pitch.body.push({ text: 'Xin chào.\nThông tin mới.', refs: ['f1', 'f2'] });
  const rows = flattenContent(content);
  assert.deepEqual(rows.map(row => row.sentence), ['Giá 189.000đ.', 'Giao nhanh!', 'Có sẵn?', 'Đặt ngay', 'Giới thiệu.', 'Xin chào.', 'Thông tin mới.']);
  assert.deepEqual(rows.map(row => row.doc), ['faq', 'faq', 'faq', 'faq', 'overview', 'pitch', 'pitch']);
  assert.equal(new Set(rows.map(row => row.id)).size, 7);
  assert.deepEqual(rows[3].refs, ['f1']);
  assert.deepEqual(rows[6].refs, ['f1', 'f2']);
  rows[0].refs.push('new');
  assert.deepEqual(content.faqs[0].refs, ['f1']);
  assert.deepEqual(flattenContent(contentWith('  ')), []);
});

test('unsupported semantic verdict lowers confidence and requests owner review', async () => {
  const llm = fakeJudge(row => !row.sentence.includes('miễn phí'));
  const risk = await checkContent({ content: contentWith('Giao trong 6-8 giờ. Giao miễn phí.'), facts }, llm);
  assert.deepEqual(risk.confidence, { faq: 0.5, overview: 1, pitch: 1 });
  assert.deepEqual(risk.needsOwner, ['faq']);
  assert.deepEqual(llm.calls[0][0].facts, [{ id: 'f1', text: facts.facts[0].text }]);
  assert.equal(risk.items[1].supported, false);
});

test('deterministic checks exclude failing sentences from the judge', async () => {
  const llm = fakeJudge();
  const content = contentWith('Giao trong 12 giờ. Giá 189000đ.');
  content.faqs.push({ a: 'Thông tin.', refs: [] }, { a: 'Thông tin khác.', refs: ['missing'] });
  const risk = await checkContent({ content, facts }, llm);
  assert.equal(llm.calls.length, 1);
  assert.deepEqual(llm.calls[0].map(row => row.sentence), ['Giá 189000đ.']);
  assert.deepEqual(risk.items.map(item => item.why), ['number 12 not in facts', 'evidence checked', 'missing references', 'unknown reference']);
});

test('PII and claims carry doc and block judging; contact facts are allowed', async () => {
  const llm = fakeJudge();
  const content = contentWith('Liên hệ hello@example.test.', ['f2']);
  content.overview.paragraphs.push({ text: 'Liên hệ private@example.test.', refs: ['f1'] });
  content.pitch.body.push({ text: 'Dịch vụ tốt nhất.', refs: ['f1'] });
  const risk = await checkContent({ content, facts }, llm);
  assert.deepEqual(risk.pii, [{ doc: 'overview', type: 'email', match: 'private@example.test' }]);
  assert.deepEqual(risk.flags, [{ doc: 'pitch', type: 'superlative', match: 'tốt nhất' }]);
  assert.deepEqual(risk.needsOwner, ['overview', 'pitch']);
  assert.equal(llm.calls[0].length, 1);
});

test('judge exceptions fail closed and empty content needs no judge', async () => {
  const risk = await checkContent({ content: contentWith('Giao hàng.'), facts }, {
    async agyJson() { throw new Error('offline'); },
  });
  assert.equal(risk.items[0].why, 'judge unavailable');
  assert.equal(risk.items[0].supported, false);
  assert.deepEqual(risk.needsOwner, ['faq']);
  const empty = await checkContent({ content: {}, facts });
  assert.deepEqual(empty.confidence, { faq: 1, overview: 1, pitch: 1 });
  assert.deepEqual(empty.needsOwner, []);
});

test('judge batches are at most 20 and confidence threshold is strictly below 0.9', async () => {
  const content = contentWith('Giao hàng. '.repeat(41));
  const llm = fakeJudge();
  const risk = await checkContent({ content, facts }, llm);
  assert.deepEqual(llm.calls.map(call => call.length), [20, 20, 1]);
  assert.equal(risk.confidence.faq, 1);
  const threshold = await checkContent({ content: contentWith('Giao hàng. '.repeat(10)), facts },
    fakeJudge(row => row.id !== 'faq-1'));
  assert.equal(threshold.confidence.faq, 0.9);
  assert.deepEqual(threshold.needsOwner, []);
});

test('missing or duplicate judge verdicts fail closed', async () => {
  for (const verdicts of [[], [
    { id: 'faq-1', supported: true, why: 'supported' },
    { id: 'faq-1', supported: true, why: 'supported' },
  ]]) {
    const risk = await checkContent({ content: contentWith('Giao hàng.'), facts }, {
      async agyJson() { return { verdicts }; },
    });
    assert.equal(risk.items[0].supported, false);
    assert.equal(risk.items[0].why, 'judge unavailable');
  }
});
