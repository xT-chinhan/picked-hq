# WP-C — Content and shop page (`server/content.mjs`, `server/shop.mjs`, `server/__tests__/content.test.mjs`, `server/__tests__/shop.test.mjs`)

## `server/content.mjs`
`generateContent({ brand, category, facts, missed, sources }, llm)` → `Content`
- `facts` is a `Facts` object. `missed` = buyer questions (strings) where AI assistants did not name the brand (use at most 8, most diverse first). `sources` = `[{ domain, count }]` of sites AI answers cite most.
- Call `llm.agyJson` once with a JSON schema for `Content`. The prompt (Vietnamese output) must state the rules: every FAQ answer ≤ 60 words and answers the missed question directly; use ONLY information from the numbered facts; every FAQ `a`, overview paragraph and pitch paragraph carries `refs` listing the fact ids it relies on; no superlatives ("tốt nhất", "số 1", "hàng đầu"), no invented numbers, prices or promises; if the facts cannot answer a question, omit that FAQ. Overview = title + 2–3 paragraphs. Pitch = a short, polite email to the top cited source (`sources[0].domain`, else a generic editor) offering a product sample for an honest review: `to`, `subject`, 3 short paragraphs.
- Post-process: drop refs that are not fact ids; drop FAQs/paragraphs left with no valid ref; cap FAQs at 8; trim strings; throw if nothing usable remains.

## `server/shop.mjs`
- `slugify(text)` — lowercase ASCII slug, Vietnamese diacritics removed (đ→d), non-alphanumerics → `-`.
- `renderShopPage({ brand, slug, website, category, facts, content, baseUrl, publishedAt })` → `{ 'index.html', 'llms.txt', 'sitemap.xml', 'robots.txt' }` (strings). Pure function.
  - `index.html`: self-contained (inline CSS, no JS, no external assets), `lang="vi"`, mobile-first, clean white design with generous spacing and one accent colour (#4f46e5). Sections: header (brand, category), overview, FAQ (`<h3>` question + `<p>` answer), "Thông tin" list built from facts of kind `contact` and `price`, and a "Nguồn" list linking each distinct fact `source`. Footer: "Trang thông tin do Picked soạn từ nguồn công khai, chủ thương hiệu đã duyệt" and the publish date. Include `<meta name="description">` from the first overview paragraph.
  - JSON-LD in `<script type="application/ld+json">`: `Organization` (name, url = website, sameAs only if known) and `FAQPage` (mainEntity from faqs). Escape `</script>` sequences.
  - `llms.txt` per llmstxt.org: `# {brand}`, a `> ` one-line summary, then `## Thông tin chính` bullets `- [title](url): note` (one per distinct fact source), `## Hỏi đáp` bullets with the question as link text pointing at `${baseUrl}#faq-N` and the answer as note.
  - `sitemap.xml` with `baseUrl` and `lastmod`; `robots.txt`: `User-agent: *`, `Allow: /`, then explicit `Allow` groups for `GPTBot`, `OAI-SearchBot`, `ChatGPT-User`, `PerplexityBot`, `ClaudeBot`, `Google-Extended`, plus the `Sitemap:` line.
  - Escape every dynamic value in HTML (text and attributes).

## Tests (offline)
- `generateContent` with a fake `llm`: strips unknown refs, drops FAQs without refs, caps at 8, throws when empty; the prompt passed to the fake contains the missed questions and the fact ids.
- `slugify('Hộp cơm Đà Nẵng')` → `hop-com-da-nang`.
- `renderShopPage`: output contains JSON-LD that `JSON.parse`s, FAQPage has one entity per FAQ, HTML-escapes `<script>` in a fact, `llms.txt` starts with `# brand` and has the two sections, sitemap and robots are well formed.
