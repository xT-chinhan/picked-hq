# WP-E — Owner approval (`server/approve.mjs`, `server/__tests__/approve.test.mjs`)

The owner reviews and approves generated documents from a phone (QR link) or the canvas.

## Exports
- `createApproval({ runId, brand, docs, baseUrl })` → `{ id, url, status: 'pending', ... }`. `docs` = `[{ key, title, summary, confidence, flags: [string] }]`. `id` = `crypto.randomBytes(9).toString('base64url')`. `url = ${baseUrl}/approve/${id}`. Persist to `server/data/approvals/<id>.json` (create the folder) and keep an in-memory map; `getApproval(id)` reads memory then disk.
- `qrDataUrl(url)` → `data:image/...` string using the `qrcode` package (`QRCode.toDataURL`, margin 1, width 280).
- `renderApprovalPage(approval)` → HTML string. Mobile-first, clean white UI, one accent colour #4f46e5, system font, no external assets, English UI labels (the document `summary` text may be Vietnamese). Shows the brand and, for each doc, a card with title, the summary (escaped, `white-space: pre-wrap`), a confidence chip (green ≥ 90 %, amber otherwise) and flags. Controls: per-doc Approve / Reject toggle (default Approve; docs with flags or confidence < 90 % default to Reject until the owner changes it), a sticky bottom bar with **Approve selected**. Submit with `fetch('/api/approve/<id>', { method: 'POST', body: JSON.stringify({ decisions }) })`; on success replace the page with a confirmation ("Thanks — you can close this page"). If the approval is already decided, render a read-only result.
- `handleApprovalRequest(req, res, { onDecision } = {})` → `boolean` (true when it handled the request). Routes: `GET /approve/:id` (HTML or 404), `GET /api/approve/:id` (JSON `{ id, status, decisions }`), `POST /api/approve/:id` (JSON body `{ decisions: { [docKey]: 'approve'|'reject' } }`; limit body to 20 KB; validate keys against the approval's docs; set `status` to `approved` when at least one doc is approved, else `rejected`; persist; call `onDecision(approval)`; respond `{ ok: true }`). A second POST on a decided approval returns 409. Unknown ids → 404.
- `decideApproval(id, decisions)` — the same decision logic used by the POST route, exported so the canvas button can call it.

## Tests (offline)
- Page escapes HTML in titles/summaries; defaults for flagged docs; read-only after decision.
- Route tests with a real `http.createServer` on an ephemeral port: GET page, POST decisions, 409 on repeat, 404 unknown id, invalid key → 400, oversized body → 413.
- `qrDataUrl` returns a `data:image/` URL. Use a temp directory override (read `process.env.APPROVALS_DIR`, default `server/data/approvals`) so tests do not write into the repo.
