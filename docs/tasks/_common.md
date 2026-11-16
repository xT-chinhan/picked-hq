# Shared context (read first)

You are helping build **Picked**, an AI agent that measures and improves how AI assistants (Gemini, ChatGPT…) recommend a brand (GEO). Repo root = current directory. Server code lives in `server/` as **ES modules (`.mjs`), Node 24**, no TypeScript, no build step. Tests use the built-in runner: `node --test server/__tests__/<name>.test.mjs`.

Rules
- Edit or create ONLY the files named in your task. Do not touch `src/`, `package.json`, other `server/*.mjs` files, or lockfiles. If you need a dependency that is not installed, say so in your final message instead of adding it. Installed and allowed: `linkedom`, `robots-parser`, `qrcode`.
- You have no network in the sandbox. Tests must be offline (fixtures, fakes). Any test that needs the real internet must be skipped unless `process.env.LIVE === '1'`.
- Never call an LLM directly. Functions that need an LLM take an `llm` argument with: `llm.agyJson({ prompt, schema, model }) -> Promise<object>` (returns parsed JSON that matches the JSON schema) and `llm.agyText({ prompt, model }) -> Promise<string>`. In tests pass a fake `llm`.
- User-facing generated text (content, labels shown on pages) is **Vietnamese**. Code, identifiers and comments are English.
- Style: small pure functions, JSDoc on exports, clear thrown errors, no `TODO`, no placeholder code, no dead code. Escape all HTML you emit.
- Data contracts (shared by all packages):
  - `Facts = { brand, website, facts: [{ id: 'f1', kind, text, source }] }`, `kind` in `product|price|feature|contact|policy|certification|about`, `source` is a page URL.
  - `Content = { faqs: [{ q, a, refs: ['f1'] }], overview: { title, paragraphs: [{ text, refs }] }, pitch: { to, subject, body: [{ text, refs }] } }`
  - `Risk = { items: [{ doc, sentence, refs, supported, why }], pii: [{ doc, type, match }], flags: [{ doc, type, match }], confidence: { faq, overview, pitch }, needsOwner: ['faq'] }`
- When finished, run your tests, then end with a short report: files created, how to run the tests, test results, and any deviation from the spec.

