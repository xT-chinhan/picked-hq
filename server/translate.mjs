const GOOGLE_URL = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=';
const translations = new Map();
// Avoid ambiguous Vietnamese words such as "do", "can", and "an".
const COMMON = new Set('the and to of for with run check show please what how brand result is are from this that your you would could should'.split(' '));

/** Translation failure with an input or provider error code and optional cause. */
export class TranslateError extends Error {
  constructor(message, code, cause) {
    super(message, { cause });
    this.name = 'TranslateError';
    this.code = code;
  }
}

/** Conservatively recognize English ASCII prompts using distinct common words. */
export function looksEnglish(text) {
  if (typeof text !== 'string' || !/^[\x00-\x7F]*$/.test(text)) return false;
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  return new Set(words.filter(word => COMMON.has(word))).size >= 2;
}

function remember(key, value) {
  translations.set(key, value);
  if (translations.size > 200) translations.delete(translations.keys().next().value);
}

function chunksOf(paragraph) {
  const chunks = [];
  let rest = paragraph.trim();
  while (rest.length > 1500) {
    const window = rest.slice(0, 1500);
    const sentences = [...window.matchAll(/[.!?](?=\s)/g)];
    const whitespace = [...rest.slice(0, 1501).matchAll(/\s/g)];
    const cut = sentences.at(-1)?.index !== undefined
      ? sentences.at(-1).index + 1 : whitespace.at(-1)?.index;
    // A single word over the limit cannot be split without violating the contract.
    if (!cut) throw new Error('A word exceeds the 1500-character provider limit');
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

async function translateChunk(text, fetchImpl, timeoutMs) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    let timer;
    try {
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error('Translation timed out'));
          controller.abort();
        }, timeoutMs);
      });
      return await Promise.race([timeout, (async () => {
        const response = await fetchImpl(`${GOOGLE_URL}${encodeURIComponent(text)}`, { signal: controller.signal });
        if (response?.status !== 200) throw new Error(`Provider status ${response?.status ?? 'unknown'}`);
        const data = await response.json();
        if (!Array.isArray(data?.[0]) || !data[0].length ||
            !data[0].every(segment => Array.isArray(segment) && typeof segment[0] === 'string') ||
            typeof data[2] !== 'string' || !data[2].trim()) {
          throw new Error('Invalid translation response');
        }
        const translated = data[0].map(segment => segment[0]).join('');
        if (!translated.trim()) throw new Error('Empty translation response');
        return { translated, source: data[2] };
      })()]);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

// Vietnamese typed without diacritics: words that are not common English words, so two distinct hits are a reliable signal.
const VI_PLAIN = new Set('toi khong duoc nhung nay thuong hieu kiem tra chay hoi nao nhu cac mot nhieu nhat voi ngoai sau truoc giup lam gui xem cuu doi thu cau loi san pham gia dung phai muon biet minh cua'.split(' '));
const stripDiacritics = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');

/** True when the text is ASCII-only but is evidently Vietnamese written without accents. */
export function looksUnaccentedVietnamese(text) {
  if (typeof text !== 'string' || !/^[\x00-\x7F]*$/.test(text) || looksEnglish(text)) return false;
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  return new Set(words.filter(word => VI_PLAIN.has(word))).size >= 2;
}

/** Build a restorer that asks the system LLM to put the diacritics back (nothing else is allowed to change). */
export function makeAgyRestorer(llm, model = 'gemini-3.8-flash-low') {
  return async (text) => {
    const out = await llm.agyJson({
      model,
      prompt: `Restore the Vietnamese diacritics in the text below. Return the SAME words in the SAME order with correct accents. Do not translate, add, remove or rephrase anything.\n\nText: ${text}`,
      schema: { type: 'object', properties: { restored: { type: 'string' } }, required: ['restored'] },
    });
    return out.restored;
  };
}

/**
 * Better translation for Vietnamese typed without accents: restore the diacritics first (the restorer may only add accents,
 * verified here), then translate. Falls back to the plain translation when the restorer fails or changes any word.
 */
export async function refineTranslation(text, opts = {}) {
  const { restore, restoreTimeoutMs = 25000, ...rest } = opts;
  const base = await translateToEnglish(text, rest);
  if (typeof restore !== 'function' || !looksUnaccentedVietnamese(text)) return { ...base, restored: null, refined: false };
  const key = `refine:${text}`;
  if (rest.cache !== false && translations.has(key)) return { ...translations.get(key), cached: true, ms: 0 };
  const started = performance.now();
  try {
    const restored = await Promise.race([restore(text), new Promise((_, reject) => setTimeout(() => reject(new Error('restore timed out')), restoreTimeoutMs))]);
    const squash = (value) => value.toLowerCase().replace(/\s+/g, ' ').trim();
    if (typeof restored !== 'string' || !restored.trim() || squash(stripDiacritics(restored)) !== squash(text)) throw new Error('restorer changed the words');
    const better = await translateToEnglish(restored, rest);
    const result = { ...better, original: text, restored, refined: true, ms: Math.round(performance.now() - started) };
    if (rest.cache !== false) remember(key, result);
    return result;
  } catch (cause) {
    return { ...base, restored: null, refined: false, restoreError: String(cause.message ?? cause) };
  }
}

/** Translate a prompt using Google, optional fallback, and a 200-entry FIFO cache. */
export async function translateToEnglish(text, opts = {}) {
  if (typeof text !== 'string' || !text.trim()) throw new TranslateError('Văn bản không được để trống.', 'empty');
  const { fetchImpl = fetch, timeoutMs = 4000, fallback = null, cache = true } = opts;
  if (cache && translations.has(text)) return { ...translations.get(text), cached: true, ms: 0 };
  const started = performance.now();
  let output = text;
  let source = 'en';
  let provider = 'none';
  if (!looksEnglish(text)) {
    source = 'unknown';
    try {
      const parts = [];
      const sources = [];
      // Keep paragraph separators verbatim; join translated chunks with one space.
      for (const part of text.split(/(\r\n|\n|\r)/)) {
        if (/^[\r\n]+$/.test(part) || !part.trim()) { parts.push(part); continue; }
        const translated = [];
        for (const chunk of chunksOf(part)) {
          const result = await translateChunk(chunk, fetchImpl, timeoutMs);
          sources.push(result.source);
          source = sources.find(language => language !== 'en') ?? 'en';
          translated.push(result.source === 'en' ? chunk : result.translated);
        }
        parts.push(translated.join(' '));
      }
      provider = source === 'en' ? 'none' : 'google';
      output = source === 'en' ? text : parts.join('');
    } catch (cause) {
      if (typeof fallback !== 'function') throw new TranslateError('Không thể dịch văn bản.', 'provider', cause);
      try {
        output = await fallback(text);
        if (typeof output !== 'string' || !output.trim()) throw new Error('Fallback returned empty or invalid text');
        provider = 'fallback';
      } catch (fallbackCause) {
        throw new TranslateError('Không thể dịch văn bản.', 'provider', new AggregateError([cause, fallbackCause], 'Translation providers failed'));
      }
    }
  }
  const result = { original: text, text: output, source, target: 'en', provider,
    ms: looksEnglish(text) ? 0 : Math.round(performance.now() - started), cached: false };
  if (provider === 'google' && looksUnaccentedVietnamese(text)) result.needsRestore = true;
  if (cache) remember(text, result);
  return result;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  // Event listeners allow a 400 response without destroying the request socket.
  return new Promise((resolve, reject) => {
    req.on('data', chunk => {
      size += Buffer.byteLength(chunk);
      if (size > 20 * 1024) {
        chunks.length = 0;
        reject(new Error('Request body exceeds 20 KB'));
      } else chunks.push(Buffer.from(chunk));
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
    req.on('aborted', () => reject(new Error('Request aborted')));
  });
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

/** Handle POST /api/translate (fast) and POST /api/translate/refine (accent restoration first); false for other routes. */
export async function handleTranslateRequest(req, res, opts = {}) {
  const route = req.url?.split('?')[0];
  if (req.method !== 'POST' || (route !== '/api/translate' && route !== '/api/translate/refine')) return false;
  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch {
    sendJson(res, 400, { error: 'Yêu cầu JSON không hợp lệ hoặc vượt quá 20 KB.' });
    return true;
  }
  try {
    sendJson(res, 200, route === '/api/translate/refine' ? await refineTranslation(payload?.text, opts) : await translateToEnglish(payload?.text, opts));
  } catch (error) {
    sendJson(res, error.code === 'empty' ? 400 : 502, { error: error.message, code: error.code ?? 'provider' });
  }
  return true;
}
