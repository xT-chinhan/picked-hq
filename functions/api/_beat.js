// The backend announces its tunnel address here when it changes and hourly; the record expires after a day if it never comes back.
export async function onRequest({ request, env }) {
  if (request.headers.get('x-edge-secret') !== env.EDGE_SECRET) return new Response('forbidden', { status: 403 })
  if (request.method === 'DELETE') { await env.EDGE.delete('backend'); return Response.json({ ok: true }) }
  if (request.method !== 'POST') return new Response('method', { status: 405 })
  const { url } = await request.json().catch(() => ({}))
  if (typeof url !== 'string' || !/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(url)) return new Response('bad url', { status: 400 })
  await env.EDGE.put('backend', JSON.stringify({ url, at: Date.now() }), { expirationTtl: 86400 })
  return Response.json({ ok: true })
}
