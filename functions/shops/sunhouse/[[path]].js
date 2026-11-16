// A test page for a brand that is not our client was published here by mistake; the CDN kept a copy, so this route answers 410.
export const onRequest = () => new Response('Gone', { status: 410, headers: { 'cache-control': 'no-store' } })
