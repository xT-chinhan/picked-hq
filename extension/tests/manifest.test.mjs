import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve('extension');
test('manifest is MV3 and references existing allowed files', () => { const m=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))); assert.equal(m.manifest_version,3); assert.deepEqual(m.permissions,['sidePanel','activeTab','scripting','storage','contextMenus']); assert.equal(m.host_permissions.includes('<all_urls>'),false); assert.equal(m.permissions.includes('debugger'),false); assert.equal(m.permissions.includes('nativeMessaging'),false); for (const f of ['background.js','panel.html']) assert.equal(fs.existsSync(path.join(root,f)),true); assert.equal(m.commands['ask-nan'].suggested_key.default,'Alt+Shift+N'); });

test('no file or folder name in the extension starts with an underscore (Chrome reserves them and refuses to load it)', () => {
  const bad = []
  const walk = (d) => { for (const n of fs.readdirSync(d)) { const f = path.join(d, n); if (n.startsWith('_')) bad.push(f); if (fs.statSync(f).isDirectory()) walk(f) } }
  walk(root)
  assert.deepEqual(bad, [])
})

test('broad page access is optional (asked for when the visitor turns it on), never granted at install', () => {
  const m = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')))
  assert.deepEqual(m.optional_host_permissions, ['http://*/*', 'https://*/*'])
  assert.equal(m.host_permissions.some((h) => /\*/.test(h.replace(/\/\*$/, '')) ), false)
  assert.equal(JSON.stringify(m).includes('<all_urls>'), false)
})
