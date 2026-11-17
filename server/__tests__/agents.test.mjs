import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// each run gets its own data directory, so the real ledger and soul lock are never touched
process.env.PICKED_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'picked-agents-'))
const { ENGINES, engine, ledger, call } = await import('../engines.mjs')
const { AGENTS, agent, agentLlm, roster, lockSouls } = await import('../agents.mjs')

test('engine registry: unique ids, known drivers, Claude through agy, Codex engines use the api profile', () => {
  assert.equal(new Set(ENGINES.map((e) => e.id)).size, ENGINES.length)
  for (const e of ENGINES) { assert.ok(['agy', 'codex'].includes(e.driver)); assert.ok(['fast', 'write', 'deep'].includes(e.tier)); if (/claude/i.test(e.model)) assert.equal(e.driver, 'agy') }
  assert.ok(engine('opus-med') && engine('sonnet-med'))
  assert.match(engine('astra').home, /codex_profiles\/api$/)
  assert.equal(engine('nope'), null)
})

test('calling an unknown engine or a schema on an engine that ignores schemas is refused before any process starts', async () => {
  await assert.rejects(() => call('nope', { prompt: 'x' }), /unknown engine/)
  await assert.rejects(() => call('oss', { prompt: 'x', schema: { type: 'object' } }), /does not follow JSON schemas/)
})

test('ledger lists every engine with zeroed stats on a fresh data directory', () => {
  const l = ledger()
  assert.equal(l.engines.length, ENGINES.length); assert.ok(l.engines.every((e) => e.calls === 0 && e.avgMs === null)); assert.deepEqual(l.recent, [])
})

test('every council member and fallback is a real engine, and souls forbid inventing facts', () => {
  for (const a of AGENTS) {
    const ids = [a.engine.primary, ...(a.engine.fallback ?? []), ...(a.engine.council ?? [])].filter(Boolean)
    for (const id of ids) assert.ok(engine(id), `${a.id} uses unknown engine ${id}`)
    assert.match(a.soul, /Never invent/)
  }
  assert.ok(agent('quinn').engine.council.length >= 3)
})

test('agentLlm rejects unknown agents and agents that use no model', () => {
  assert.throws(() => agentLlm('nobody'), /unknown agent/)
  assert.throws(() => agentLlm('rhea'), /does not use a model/)
  assert.equal(typeof agentLlm('quinn').agyJson, 'function')
})

test('a changed soul is flagged until the souls are locked again', () => {
  assert.ok(roster().every((r) => !r.drift))
  const a = agent('mira'); const before = a.soul
  a.soul += ' Extra rule.'
  assert.equal(roster().find((r) => r.id === 'mira').drift, true)
  lockSouls(); assert.equal(roster().find((r) => r.id === 'mira').drift, false)
  a.soul = before
})

test('Codex profiles: a profile that fails (usage limit, provider down) hands the call to the next one', async () => {
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path'), cp = await import('node:child_process')
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-codex-')), home = (n, ok) => { const d = path.join(bin, n); fs.mkdirSync(d); fs.writeFileSync(path.join(d, 'ok'), ok ? '1' : '0'); return d }
  // a fake `codex`: succeeds only when its CODEX_HOME holds ok=1, writing the -o file the way the real one does
  fs.writeFileSync(path.join(bin, 'codex'), '#!/bin/sh\nif [ "$(cat "$CODEX_HOME/ok")" != "1" ]; then echo "usage limit" >&2; exit 1; fi\nwhile [ $# -gt 0 ]; do [ "$1" = "-o" ] && echo ready > "$2"; shift; done\n', { mode: 0o755 })
  const code = `const { call } = await import(${JSON.stringify(new URL('../engines.mjs', import.meta.url).href)}); const r = await call('astra', { prompt: 'x', fresh: true }); console.log(r.text)`
  const out = cp.execFileSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, PICKED_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'pd-')), PICKED_CODEX_HOMES: [home('a', false), home('b', true)].join('|') }, encoding: 'utf8' })
  assert.match(out, /ready/)
})
