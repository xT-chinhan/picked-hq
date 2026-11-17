// Shared by the edge routes: finds the live backend (the team's own machine, behind a tunnel) and proxies to it.
export const OFFLINE = 'NaN-Team đang tạm khóa để phát triển dự án'

const page = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Picked</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;font:500 17px system-ui,sans-serif;color:#334155;background:#f8fafc"><p style="text-align:center;padding:24px"><b style="display:block;font-size:22px;color:#0f172a;margin-bottom:6px">Picked</b>${OFFLINE}.</p>`

export function offline(request, why = '') {
  const html = (request.headers.get('accept') || '').includes('text/html')
  return html
    ? new Response(page, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-why': why } })
    : new Response(JSON.stringify({ offline: true, error: OFFLINE }), { status: 503, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-why': why } })
}

let memo = { at: 0, entry: null } // per isolate: one KV read serves every request for 20 s
export async function proxy({ request, env }) {
  const url = new URL(request.url)
  if (Date.now() - memo.at > 20000) memo = { at: Date.now(), entry: await env.EDGE.get('backend', 'json') }
  const entry = memo.entry
  if (!entry?.url) return offline(request, 'no-entry')
  const headers = new Headers(request.headers)
  headers.set('x-picked-edge', env.EDGE_SECRET)
  headers.set('x-picked-ip', request.headers.get('cf-connecting-ip') || '')
  // only the owner's login cookie goes through; every other cookie stays in the browser
  const owner = /(?:^|;\s*)(picked_owner=[\w-]+)/.exec(request.headers.get('cookie') || '')
  if (owner) headers.set('cookie', owner[1]); else headers.delete('cookie')
  let res
  try {
    res = await fetch(new Request(entry.url + url.pathname + url.search, { method: request.method, headers, body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body, redirect: 'manual' }))
  } catch (e) { memo.at = 0; return offline(request, 'fetch:' + String(e.message).slice(0, 60)) } // the address may have changed: read it again next time
  // Only our own server sets x-picked; anything else (tunnel down, 502, 530) means the machine is off.
  if (!res.headers.get('x-picked')) { memo.at = 0; return offline(request, 'status:' + res.status) }
  const out = new Headers(res.headers)
  out.delete('x-picked'); out.set('cache-control', 'no-store')
  return new Response(res.body, { status: res.status, headers: out })
}
