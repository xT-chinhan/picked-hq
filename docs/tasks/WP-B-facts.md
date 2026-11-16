# WP-B — Site facts (`server/facts.mjs`, `server/__tests__/facts.test.mjs`)

Build the source-of-truth step: read a brand's public website and extract numbered, sourced facts.

## Exports
1. `fetchSiteText(website, opts = {})` → `{ pages: [{ url, title, text }], blocked: boolean, notes: string[] }`
   - opts: `maxPages = 5`, `maxChars = 14000` (total across pages), `userAgent = 'PickedBot/1.0 (+https://pickedhq.vercel.app)'`, `fetchImpl = fetch`, `delayMs = 300` (min gap between requests).
   - Respect `robots.txt` (use `robots-parser`): if the homepage is disallowed for our user agent, return `blocked: true` and no pages. Disallowed paths are skipped and noted in `notes`.
   - Page discovery: homepage first; then same-host links found on the homepage, scored by keywords in the URL or link text (`san-pham`, `product`, `gioi-thieu`, `about`, `lien-he`, `contact`, `bao-hanh`, `warranty`, `chinh-sach`, `policy`); then the first URLs of `sitemap.xml` if still short of `maxPages`. De-duplicate, drop fragments, drop non-HTML (images, pdf, zip).
   - Text extraction with `linkedom`: remove `script, style, noscript, svg, nav, footer, header, form, iframe`; prefer `<main>`, else `<body>`; collapse whitespace; keep headings and paragraph breaks as `\n`; give each page at most `Math.floor(maxChars / maxPages)` characters (cut at a word boundary). Title from `<title>`.
   - Fetch errors for one page must not fail the whole call (add a note).
2. `extractFacts({ brand, website, site }, llm)` → `Facts`
   - Build a Vietnamese-aware prompt with the page texts (each page prefixed by its URL). Ask `llm.agyJson` with a JSON schema `{ facts: [{ kind, text, source }] }` (kind enum as in the contract; text ≤ 160 chars; Vietnamese; only information literally supported by the page text; no marketing superlatives; no invented numbers).
   - Post-process: keep only facts whose `source` equals one of `site.pages[].url`; trim; drop empty and duplicate texts (case-insensitive); cap at 40 facts; assign ids `f1`, `f2`, … in order; return `{ brand, website, facts }`.
   - If `site.pages` is empty, throw an `Error('no readable pages')`.

## Tests (offline)
- Text extraction from inline HTML fixtures: scripts/nav/footer removed, headings kept, truncation at word boundary.
- robots.txt blocking and per-path disallow; error on one page does not fail the call; discovery prefers keyword links; dedupe.
- `extractFacts` with a fake `llm`: filters facts with unknown `source`, dedupes, assigns ids, throws on empty pages.
- One test gated by `LIVE=1` that calls `fetchSiteText('https://elmich.vn', { maxPages: 3 })` and asserts at least one page with text.
