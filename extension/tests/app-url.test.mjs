import test from 'node:test'; import assert from 'node:assert/strict';
const store = {};
globalThis.chrome = { storage: { local: { get: async () => ({ ...store }), set: async (o) => Object.assign(store, o) } } };
const { appUrl, setBase } = await import('../lib/api.js');

test('a local server hands the visitor to the hosted app (the local server has no UI)', async () => {
  assert.equal(await appUrl(), 'https://pickedhq.pages.dev');
  await setBase('http://localhost:5198');
  assert.equal(await appUrl(), 'https://pickedhq.pages.dev');
});
test('any other server is assumed to serve the app itself', async () => {
  await setBase('https://example.org/');
  assert.equal(await appUrl(), 'https://example.org');
});
