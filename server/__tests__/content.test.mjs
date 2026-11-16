import test from 'node:test';
import assert from 'node:assert/strict';
import { generateContent } from '../content.mjs';

const input = {
  brand: 'Bếp Việt', category: 'Hộp cơm',
  facts: { brand: 'Bếp Việt', website: 'https://brand.test/', facts: [
    { id: 'f1', kind: 'product', text: 'Hộp cơm inox.', source: 'https://brand.test/' },
    { id: 'f2', kind: 'price', text: 'Giá 200.000 đồng.', source: 'https://brand.test/' },
  ] },
  missed: ['Hộp cơm làm từ gì?', 'Giá bao nhiêu?'], sources: [{ domain: 'review.test', count: 12 }],
};
const paragraph = { text: ' Hộp cơm inox. ', refs: [' f1 ', 'unknown', 'f1'] };
const output = () => ({
  faqs: [{ q: ' Chất liệu? ', a: ' Inox. ', refs: ['f1', 'unknown'] }],
  overview: { title: ' Giới thiệu ', paragraphs: [paragraph, { text: 'Không có nguồn.', refs: ['unknown'] }] },
  pitch: { to: ' other.test ', subject: ' Mời đánh giá ', body: [paragraph, { text: 'Không có nguồn.', refs: [] }] },
});

test('calls injected LLM once with grounding rules, questions, fact ids and Content schema', async () => {
  let calls = 0;
  const result = await generateContent(input, { async agyJson({ prompt, schema }) {
    calls++;
    for (const text of [...input.missed, 'f1', 'f2', 'review.test', '60', 'tiếng Việt', 'tốt nhất', 'số 1', 'hàng đầu']) assert.ok(prompt.includes(text));
    assert.deepEqual(schema.required, ['faqs', 'overview', 'pitch']);
    assert.equal(schema.properties.overview.properties.paragraphs.minItems, 2);
    assert.equal(schema.properties.pitch.properties.body.maxItems, 3);
    return output();
  } });
  assert.equal(calls, 1);
  assert.deepEqual(result.faqs, [{ q: 'Chất liệu?', a: 'Inox.', refs: ['f1'] }]);
  assert.deepEqual(result.overview, { title: 'Giới thiệu', paragraphs: [{ text: 'Hộp cơm inox.', refs: ['f1'] }] });
  assert.deepEqual(result.pitch, { to: 'review.test', subject: 'Mời đánh giá', body: result.overview.paragraphs });
});

test('drops ungrounded, empty and unshortenable FAQs before capping at eight', async () => {
  const response = output();
  response.faqs = [
    { q: 'No refs?', a: 'Không rõ.', refs: ['unknown'] },
    { q: ' ', a: 'Không rõ.', refs: ['f1'] },
    { q: 'Quá dài?', a: 'từ '.repeat(91), refs: ['f1'] },
    ...Array.from({ length: 10 }, (_, index) => ({ q: `Câu ${index}?`, a: 'Inox.', refs: ['f1'] })),
  ];
  const result = await generateContent(input, { agyJson: async () => response });
  assert.equal(result.faqs.length, 8);
  assert.equal(result.faqs[0].q, 'Câu 0?');
  assert.equal(result.faqs.at(-1).q, 'Câu 7?');
});

test('shortens long answers at a sentence boundary instead of dropping them', async () => {
  const response = output();
  response.faqs = [{ q: 'Dài?', a: `${'một '.repeat(40).trim()}. ${'hai '.repeat(30).trim()}.`, refs: ['f1'] }];
  const result = await generateContent(input, { agyJson: async () => response });
  assert.equal(result.faqs.length, 1);
  assert.equal(result.faqs[0].a.split(/\s+/).length, 40);
});

test('selects at most twelve diverse questions, deduplicates and uses a generic editor', async () => {
  const missed = ['Hộp cơm inox?', ' Hộp cơm inox? ', 'Hộp cơm inox có gì?', 'Giao hàng ở đâu?',
    'Bảo hành?', 'Giá?', 'Dung tích?', 'Màu sắc?', 'Chứng nhận?', 'Vệ sinh?'];
  await generateContent({ ...input, missed, sources: [] }, { async agyJson({ prompt }) {
    const data = JSON.parse(prompt.split('Dữ liệu:\n')[1]);
    assert.equal(data.missed.length, 9);
    assert.equal(new Set(data.missed).size, 9);
    assert.equal(data.missed[0], 'Hộp cơm inox?');
    assert.equal(data.missed[1], 'Giao hàng ở đâu?');
    assert.equal(data.recipient, 'Ban biên tập');
    return output();
  } });
});

test('throws when no referenced content survives, and propagates LLM failures', async () => {
  const response = output();
  await assert.rejects(generateContent({ ...input, facts: { ...input.facts, facts: [] } }, { agyJson: async () => response }), /No usable content/);
  await assert.rejects(generateContent(input, { agyJson: async () => ({}) }), /No usable content/);
  await assert.rejects(generateContent(input, { agyJson: async () => { throw new Error('fake failure'); } }), /fake failure/);
  await assert.rejects(generateContent({ ...input, facts: [] }, {}), /Facts object/);
  await assert.rejects(generateContent(input, {}), /llm.agyJson/);
});
