# WP-T — Prompt translation (`server/translate.mjs`, `server/__tests__/translate.test.mjs`)

Translate any user prompt to English fast, detecting the source language. Used for the commands people type to the "System One" chat and for free-form questions.

## Exports
1. `translateToEnglish(text, opts = {})` → `Promise<{ original, text, source, target: 'en', provider, ms, cached }>`
   - `opts`: `fetchImpl = fetch`, `timeoutMs = 4000`, `fallback = null` (an async function `(text) => string` used when Google fails), `cache = true`.
   - Provider: Google's free endpoint `GET https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=<encoded>`. The response is JSON: `data[0]` is an array of segments whose first element is the translated text (join them in order); `data[2]` is the detected source language code.
   - If `text` is empty or whitespace → throw `TranslateError` with `code: 'empty'`.
   - If the detected source is already `en` → return the original unchanged with `provider: 'none'`.
   - Skip the network entirely when the text clearly is English already: pure ASCII and at least two common English words (the, and, to, of, for, with, run, check, show, please, what, how …) → `provider: 'none'`, `source: 'en'`. Vietnamese typed without diacritics must NOT be classified as English by this check.
   - Long text: split into chunks of at most 1500 characters on sentence boundaries (`. ! ? ` and newlines; never mid-word), translate chunks in order (sequentially), and join with a single space. Keep newlines between paragraphs.
   - On timeout, network error, non-200 status or an unparsable body: retry once; if it still fails and `opts.fallback` is set, call it and return `provider: 'fallback'`; otherwise throw `TranslateError` with `code: 'provider'` and the cause.
   - Small in-memory cache (Map, max 200 entries, oldest evicted) keyed by `text`; a hit returns `cached: true` and `ms: 0`.
2. `TranslateError` — `Error` subclass with a `code` field (`empty` | `provider`).
3. `looksEnglish(text)` — the heuristic above, exported for tests.
4. `handleTranslateRequest(req, res, opts = {})` → `Promise<boolean>`: handles `POST /api/translate` with JSON body `{ text }` (limit body to 20 KB), responds `200` with the result JSON; `400` for empty or invalid JSON; `502` for provider failure; returns `true` when it handled the request and `false` for any other route. Do not start a server in this module.

## Tests (offline; real network only when `LIVE=1`)
- A fake `fetchImpl` returning the Google response shape: segments joined, language detected, `ms` is a number.
- Already-English (detected `en`, and the ASCII heuristic) returns the original and does not call fetch.
- Vietnamese without diacritics (`"kiem tra thuong hieu elmich"`) is not skipped by the heuristic.
- Chunking: a 4000-character paragraph is translated in order in chunks ≤ 1500 characters, newlines preserved, no mid-word cut.
- Retry once then fallback; retry once then `TranslateError('provider')`; empty → `TranslateError('empty')`; timeout (fake fetch that never resolves) respects `timeoutMs`.
- Cache hit: second identical call returns `cached: true` and makes no request; eviction beyond 200 entries.
- `handleTranslateRequest` with a real `http.createServer` on an ephemeral port (200, 400, 502, wrong route → false).
- One test gated by `LIVE=1` that translates `"Kiểm tra thương hiệu Elmich xem AI có nhắc tới không"` and asserts the result contains `elmich` (case-insensitive) and `source === 'vi'`.
