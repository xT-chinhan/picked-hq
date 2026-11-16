# WP-D — Risk gate (`server/risk.mjs`, `server/__tests__/risk.test.mjs`)

Check generated content before a human sees it.

## Exports
1. `scanPii(text, { allow = [] } = {})` → `[{ type, match }]`, `type` in `phone|email|national_id|bank_account`.
   - Vietnamese phones: `0` + 9 digits with optional spaces/dots/dashes (e.g. `0908 123 456`, `090.812.3456`), `+84` / `84` forms, hotlines like `1800 6068` or `1900 xxxx`. Emails. Citizen ID: exactly 12 digits; old ID: exactly 9 digits (as standalone numbers). Bank-account-like standalone digit runs of 10–16 not already matched.
   - Anything whose normalized form (digits only / lowercase) equals an entry of `allow` is NOT reported (public business contacts that appear in the facts).
2. `scanClaims(text)` → `[{ type, match }]`, `type` in `superlative|absolute|health|guarantee`. Vietnamese patterns, case-insensitive, diacritics-aware: superlative (`tốt nhất`, `số 1`, `số một`, `hàng đầu`, `đứng đầu`, `rẻ nhất`, `uy tín nhất`, `best`), absolute (`100%`, `tuyệt đối`, `không bao giờ`, `duy nhất`), health (`chữa`, `điều trị`, `trị bệnh`, `phòng ngừa bệnh`, `giảm cân`, `ung thư`), guarantee (`cam kết hoàn tiền`, `đảm bảo 100%`, `bảo đảm`). Return each distinct match once.
3. `numbersIn(text)` → array of normalized number tokens with optional unit (`'6-8 giờ'` → tokens `'6'`, `'8'`, `'giờ'` handling is your choice but must be documented and tested); used to verify that figures in a sentence exist in the referenced facts.
4. `flattenContent(content)` → `[{ id, doc, sentence, refs }]` for FAQ answers (`doc: 'faq'`), overview paragraphs (`'overview'`) and pitch body (`'pitch'`); split paragraphs into sentences (Vietnamese-friendly: split on `. ! ?` followed by whitespace/end), each sentence inherits its paragraph's `refs`.
5. `checkContent({ content, facts }, llm)` → `Risk` (see contract).
   - Deterministic checks first, per sentence: (a) has ≥ 1 ref and all refs exist in `facts`; (b) every number in the sentence appears in the text of the referenced facts; (c) `scanPii` (allow = contact facts) and `scanClaims`. A failing sentence gets `supported: false` and a short Vietnamese-free English `why` (e.g. `'number 12 not in facts'`).
   - Then, for sentences that passed, ask `llm.agyJson` (batches of ≤ 20; schema `{ verdicts: [{ id, supported: boolean, why }] }`) whether each sentence is fully supported by its referenced facts; merge verdicts. If the llm call throws, mark the batch `supported: false, why: 'judge unavailable'` rather than crashing.
   - `confidence[doc]` = supported sentences / total sentences for that doc (1 when the doc has no sentences). `needsOwner` = docs with confidence < 0.9 or at least one flag or pii hit. `pii` and `flags` carry the `doc` they came from.

## Tests (offline)
- PII: positives (several phone formats, email, 12-digit ID) and negatives (prices like `189.000đ`, years, `6-8 giờ`), allow-list works.
- Claims: each category caught, clean text not flagged.
- `flattenContent` sentence splitting and ref inheritance.
- `checkContent` with a fake `llm`: unsupported verdict lowers confidence and sets `needsOwner`; deterministic number check fails without calling the llm for that sentence; llm failure handled.
