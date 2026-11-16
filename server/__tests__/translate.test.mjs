import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Readable } from 'node:stream';
import { translateToEnglish, TranslateError, looksEnglish, handleTranslateRequest, looksUnaccentedVietnamese, refineTranslation, makeAgyRestorer } from '../translate.mjs';

function googleResponse(text, source = 'vi') {
  return { ok: true, status: 200, async json() { return [[ [text, 'x'] ], null, source]; } };
}

const noFetch = () => { throw new Error('network called'); };

test('rejects empty input and detects English heuristically', async () => {
  await assert.rejects(() => translateToEnglish('  ', { fetchImpl: noFetch }), e => e instanceof TranslateError && e.code === 'empty');
  assert.equal(looksEnglish('please check the brand and show the result'), true);
  assert.equal(looksEnglish('kiem tra thuong hieu elmich'), false);
});

test('skips network for clear English and preserves original', async () => {
  const result = await translateToEnglish('please check the brand and show the result', { fetchImpl: noFetch });
  assert.deepEqual(result, { original: result.original, text: result.original, source: 'en', target: 'en', provider: 'none', ms: result.ms, cached: false });
  assert.equal(result.ms, 0);
});

test('translates Google response and joins segments', async () => {
  let calls = 0;
  const result = await translateToEnglish('Kiểm tra thương hiệu', { fetchImpl: async () => { calls++; return googleResponse('Check the brand'); } });
  assert.equal(result.text, 'Check the brand');
  assert.equal(result.source, 'vi');
  assert.equal(result.provider, 'google');
  assert.equal(typeof result.ms, 'number');
  assert.equal(calls, 1);
});

test('chunks long text without splitting words and preserves paragraphs', async () => {
  const chunks = [];
  const paragraph = Array.from({ length: 700 }, (_, i) => `từ${i}`).join(' ');
  const source = `${paragraph}\n\n${paragraph}`;
  const result = await translateToEnglish(source, { fetchImpl: async url => { const q = new URL(url).searchParams.get('q'); chunks.push(q); return googleResponse(q, 'vi'); } });
  assert.equal(result.text, source);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(c => c.length <= 1500));
  assert.ok(chunks.every(c => !c.endsWith('từ')));
  assert.equal(chunks.join(' '), `${paragraph} ${paragraph}`);
});

test('retries once then falls back or throws provider error', async () => {
  let calls = 0;
  const fallback = async text => `Fallback ${text}`;
  const result = await translateToEnglish('xin chao', { fetchImpl: async () => { calls++; throw new Error('down'); }, fallback });
  assert.equal(calls, 2); assert.equal(result.provider, 'fallback'); assert.equal(result.text, 'Fallback xin chao');
  calls = 0;
  await assert.rejects(() => translateToEnglish('xin chao 2', { fetchImpl: async () => { calls++; throw new Error('down'); } }), e => e.code === 'provider');
  assert.equal(calls, 2);
});

test('timeout retries and respects timeoutMs', async () => {
  let calls = 0;
  await assert.rejects(() => translateToEnglish('xin chao timeout', { timeoutMs: 20, fetchImpl: () => { calls++; return new Promise(() => {}); } }), e => e.code === 'provider');
  assert.equal(calls, 2);
});

test('caches hits and evicts oldest beyond 200 entries', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return googleResponse('ok'); };
  await translateToEnglish('cache me', { fetchImpl });
  const hit = await translateToEnglish('cache me', { fetchImpl });
  assert.equal(hit.cached, true); assert.equal(hit.ms, 0); assert.equal(calls, 1);
  for (let i = 0; i < 201; i++) await translateToEnglish(`mục ${i}`, { fetchImpl });
  await translateToEnglish('cache me', { fetchImpl });
  assert.equal(calls, 203);
});

function request(port, path, body, method = 'POST') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('handles translate HTTP endpoint on an ephemeral port', async t => {
  const server = http.createServer(async (req, res) => {
    const handled = await handleTranslateRequest(req, res, { cache: false, fetchImpl: async () => {
      if (req.headers['x-fail']) throw new Error('down');
      return googleResponse('Hello');
    } });
    if (!handled) { res.statusCode = 404; res.end('{}'); }
  });
  t.after(() => server.close());
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'EACCES') { t.skip(`Sandbox forbids listening: ${error.code}`); return; }
    throw error;
  }
  const port = server.address().port;
  assert.equal((await request(port, '/api/translate', JSON.stringify({ text: 'xin chao' }))).status, 200);
  for (const body of ['{bad', '{}', 'null', '{"text":" "}', JSON.stringify({ text: 'é'.repeat(11000) })]) {
    assert.equal((await request(port, '/api/translate', body)).status, 400);
  }
  assert.equal((await request(port, '/other', '{}')).status, 404);
  assert.equal((await request(port, '/api/translate', undefined, 'GET')).status, 404);
  const failure = await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/api/translate', method: 'POST', headers: { 'x-fail': '1' } }, res => {
      res.resume(); res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject); req.end('{"text":"xin chao"}');
  });
  assert.equal(failure, 502);
});

test('HTTP handler validates streams and returns false for unrelated routes', async () => {
  async function invoke(body, opts = {}, method = 'POST', url = '/api/translate') {
    const req = Readable.from([Buffer.from(body)]);
    Object.assign(req, { method, url });
    const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.body = JSON.parse(value); } };
    const handled = await handleTranslateRequest(req, res, { cache: false, fetchImpl: async () => googleResponse('Hello'), ...opts });
    return { handled, ...res };
  }
  const good = await invoke('{"text":"xin chao"}');
  assert.equal(good.handled, true); assert.equal(good.statusCode, 200); assert.equal(good.body.text, 'Hello');
  assert.match(good.headers['content-type'], /application\/json/);
  for (const body of ['{bad', '{}', 'null', '{"text":" "}', '{"text":4}', JSON.stringify({ text: 'é'.repeat(11000) })]) {
    assert.equal((await invoke(body)).statusCode, 400);
  }
  assert.equal((await invoke('{"text":"xin chao"}', { fetchImpl: async () => { throw new Error('down'); } })).statusCode, 502);
  const other = await invoke('{}', {}, 'POST', '/other');
  assert.equal(other.handled, false); assert.equal(other.body, undefined);
  assert.equal((await invoke('{}', {}, 'GET')).handled, false);
});

test('detected English preserves exact original after one detection request', async () => {
  let calls = 0;
  const original = '  Hello, everyone!  ';
  const result = await translateToEnglish(original, { cache: false, fetchImpl: async () => { calls++; return googleResponse('Altered', 'en'); } });
  assert.equal(calls, 1); assert.equal(result.text, original); assert.equal(result.provider, 'none'); assert.equal(result.source, 'en');
});

test('joins segments, encodes prompts, and retries invalid responses', async () => {
  const original = 'Kiểm tra 50% & #elmich?';
  const result = await translateToEnglish(original, { cache: false, fetchImpl: async url => {
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get('q'), original);
    assert.equal(parsed.searchParams.get('sl'), 'auto');
    assert.equal(parsed.searchParams.get('tl'), 'en');
    return { status: 200, json: async () => [[['Check ', ''], ['Elmich', '']], null, 'vi'] };
  } });
  assert.equal(result.text, 'Check Elmich');
  for (const response of [
    { status: 503 },
    { status: 200, json: async () => { throw new SyntaxError('bad JSON'); } },
    { status: 200, json: async () => [[['ok'], [4]], null, 'vi'] },
    { status: 200, json: async () => [[], null, 'vi'] },
  ]) {
    let calls = 0;
    const retry = await translateToEnglish('thử lại', { cache: false, fetchImpl: async () => ++calls === 1 ? response : googleResponse('Retry') });
    assert.equal(retry.text, 'Retry'); assert.equal(calls, 2);
  }
});

test('timeout also covers response body and aborts both attempts', async () => {
  const signals = [];
  const started = performance.now();
  await assert.rejects(translateToEnglish('chờ nội dung', { cache: false, timeoutMs: 15, fetchImpl: async (_, { signal }) => {
    signals.push(signal); return { status: 200, json: () => new Promise(() => {}) };
  } }), e => e instanceof TranslateError && e.code === 'provider' && e.cause instanceof Error);
  assert.equal(signals.length, 2); assert.ok(signals.every(signal => signal.aborted));
  assert.ok(performance.now() - started < 1000);
});

test('cache false bypasses reads and writes, and fallback failures stay provider errors', async () => {
  let calls = 0;
  const opts = { cache: false, fetchImpl: async () => { calls++; return googleResponse('Fresh'); } };
  await translateToEnglish('không lưu', opts);
  await translateToEnglish('không lưu', opts);
  assert.equal(calls, 2);
  for (const fallback of [async () => '', async () => { throw new Error('fallback failed'); }]) {
    await assert.rejects(translateToEnglish('lỗi dự phòng', { cache: false, fetchImpl: async () => { throw new Error('down'); }, fallback }), e => e.code === 'provider');
  }
});

test('live translation is opt-in', { skip: process.env.LIVE !== '1' }, async () => {
  const result = await translateToEnglish('Kiểm tra thương hiệu Elmich xem AI có nhắc tới không');
  assert.match(result.text.toLowerCase(), /elmich/);
  assert.equal(result.source, 'vi');
});

test('uses sentence boundaries and awaits chunks sequentially', async () => {
  const first = `${'đoạn '.repeat(200).trim()}.`;
  const second = `${'khác '.repeat(180).trim()}!`;
  let active = 0;
  const seen = [];
  const result = await translateToEnglish(`${first} ${second}\n\nCuối.`, {
    cache: false,
    fetchImpl: async url => {
      assert.equal(active++, 0);
      seen.push(new URL(url).searchParams.get('q'));
      await new Promise(resolve => setImmediate(resolve));
      active--;
      return googleResponse(`Part ${seen.length}`);
    },
  });
  assert.deepEqual(seen, [first, second, 'Cuối.']);
  assert.equal(result.text, 'Part 1 Part 2\n\nPart 3');
});

test('overlong words fail cleanly instead of sending oversized chunks or splitting words', async () => {
  await assert.rejects(translateToEnglish('ộ'.repeat(1501), { cache: false, fetchImpl: noFetch }), e => e.code === 'provider' && /word/.test(e.cause.message));
});

test('ms is a whole number of milliseconds', async () => {
  const result = await translateToEnglish('Kiểm tra thương hiệu ms', { fetchImpl: async () => googleResponse('Check the brand'), cache: false });
  assert.equal(Number.isInteger(result.ms), true);
});

test('recognizes Vietnamese typed without accents and never mistakes English or accented text for it', () => {
  assert.equal(looksUnaccentedVietnamese('kiem tra thuong hieu elmich'), true);
  assert.equal(looksUnaccentedVietnamese('toi muon biet gia san pham'), true);
  assert.equal(looksUnaccentedVietnamese('please check the brand and show the result'), false);
  assert.equal(looksUnaccentedVietnamese('Kiểm tra thương hiệu'), false);
  assert.equal(looksUnaccentedVietnamese('run the audit'), false);
});

test('flags plain-ASCII Vietnamese as needing accent restoration', async () => {
  const result = await translateToEnglish('kiem tra thuong hieu elmich', { fetchImpl: async () => googleResponse('Check elmich effect'), cache: false });
  assert.equal(result.needsRestore, true);
});

test('refine restores accents then translates the restored text', async () => {
  const seen = [];
  const fetchImpl = async (url) => { const q = decodeURIComponent(url.split('&q=')[1]); seen.push(q); return googleResponse(q.includes('thương') ? 'Check the Elmich brand' : 'Check elmich effect'); };
  const result = await refineTranslation('kiem tra thuong hieu Elmich', { fetchImpl, cache: false, restore: async () => 'kiểm tra thương hiệu Elmich' });
  assert.equal(result.refined, true);
  assert.equal(result.restored, 'kiểm tra thương hiệu Elmich');
  assert.equal(result.text, 'Check the Elmich brand');
  assert.equal(result.original, 'kiem tra thuong hieu Elmich');
  assert.equal(seen.length, 2);
});

test('refine rejects a restorer that changes words and falls back to the plain translation', async () => {
  const fetchImpl = async () => googleResponse('Check elmich effect');
  const result = await refineTranslation('kiem tra thuong hieu elmich', { fetchImpl, cache: false, restore: async () => 'hãy kiểm tra thương hiệu elmich ngay' });
  assert.equal(result.refined, false);
  assert.equal(result.text, 'Check elmich effect');
  assert.match(result.restoreError, /changed the words/);
});

test('refine skips the restorer for accented Vietnamese and for English', async () => {
  const restore = async () => { throw new Error('should not run'); };
  const accented = await refineTranslation('Kiểm tra thương hiệu', { fetchImpl: async () => googleResponse('Check the brand'), cache: false, restore });
  assert.equal(accented.refined, false);
  const english = await refineTranslation('please check the brand and show the result', { fetchImpl: noFetch, cache: false, restore });
  assert.equal(english.refined, false);
});

test('refine survives a failing or slow restorer', async () => {
  const fetchImpl = async () => googleResponse('Check elmich effect');
  const failing = await refineTranslation('kiem tra thuong hieu elmich', { fetchImpl, cache: false, restore: async () => { throw new Error('agy down'); } });
  assert.equal(failing.refined, false);
  const slow = await refineTranslation('kiem tra thuong hieu elmich', { fetchImpl, cache: false, restoreTimeoutMs: 30, restore: () => new Promise(() => {}) });
  assert.match(slow.restoreError, /timed out/);
});

test('makeAgyRestorer asks the LLM for a JSON restored field', async () => {
  let seen;
  const restore = makeAgyRestorer({ async agyJson(o) { seen = o; return { restored: 'kiểm tra' }; } });
  assert.equal(await restore('kiem tra'), 'kiểm tra');
  assert.match(seen.prompt, /kiem tra/);
  assert.deepEqual(seen.schema.required, ['restored']);
});

test('HTTP refine route returns the refined result', async () => {
  const body = JSON.stringify({ text: 'kiem tra thuong hieu elmich' });
  const req = Object.assign(Readable.from([body]), { method: 'POST', url: '/api/translate/refine' });
  let status, payload;
  const res = { setHeader() {}, set statusCode(v) { status = v; }, end(v) { payload = JSON.parse(v); } };
  const handled = await handleTranslateRequest(req, res, { fetchImpl: async (u) => googleResponse(decodeURIComponent(u).includes('thương') ? 'Check the Elmich brand' : 'Check elmich effect'), cache: false, restore: async () => 'kiểm tra thương hiệu elmich' });
  assert.equal(handled, true);
  assert.equal(status, 200);
  assert.equal(payload.text, 'Check the Elmich brand');
  assert.equal(payload.refined, true);
});
