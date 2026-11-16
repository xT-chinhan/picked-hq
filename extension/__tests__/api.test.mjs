import test from 'node:test'; import assert from 'node:assert/strict';
const chrome = { storage: { local: { data:{}, async get(k){ return {[k]:this.data[k]}; }, async set(v){Object.assign(this.data,v);} } } }; globalThis.chrome=chrome;
const { setBase, getBase, post, isLocalBase } = await import('../lib/api.js');
test('validates and normalizes base', async()=>{ await assert.rejects(()=>setBase('ftp://x')); await setBase('http://x.test/'); assert.equal(await getBase(),'http://x.test'); assert.equal(isLocalBase('http://127.0.0.1:5198'),true); });
test('surfaces API errors and offline response', async()=>{ globalThis.fetch=async()=>new Response(JSON.stringify({error:'Nope'}),{status:400,headers:{'content-type':'application/json'}}); await assert.rejects(()=>post('/x',{}),/Nope/); globalThis.fetch=async()=>new Response(JSON.stringify({error:'Offline',offline:true}),{status:503,headers:{'content-type':'application/json'}}); await assert.rejects(()=>post('/x',{}),/Offline/); });
test('times out', async()=>{ globalThis.fetch=async()=>{ throw new Error('timeout'); }; await assert.rejects(()=>post('/x',{}),/timeout/i); });
