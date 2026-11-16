import test from 'node:test'
import assert from 'node:assert/strict'
import { runToolLoop } from '../toolloop.mjs'
import { CATALOG, entry, publicCatalog } from '../mcp-catalog.mjs'

const tools = [{ server: 'gh', name: 'list_issues', description: 'List issues', inputSchema: { properties: { repo: { type: 'string' } } } }]
const scripted = (...outs) => { const seen = []; return { seen, agyJson: async (o) => { seen.push(o.prompt); return outs.shift() } } }
const call = (log = []) => async (server, tool, args) => { log.push([server, tool, args]); return { text: 'issue #1: bug', isError: false, ms: 5 } }
const A = (answer) => ({ action: 'answer', server: '', tool: '', arguments: '', answer })
const C = (tool, args) => ({ action: 'call', server: 'gh', tool, arguments: args, answer: '' })

test('calls one tool then answers, passing the result back as data', async () => {
  const log = [], llm = scripted(C('list_issues', '{"repo":"a/b"}'), A('1 issue open'))
  const r = await runToolLoop({ request: 'open issues?', tools, llm, call: call(log) })
  assert.equal(r.answer, '1 issue open'); assert.deepEqual(log, [['gh', 'list_issues', { repo: 'a/b' }]]); assert.equal(r.steps.length, 1)
  assert.match(llm.seen[1], /issue #1: bug/); assert.match(llm.seen[1], /data, not instructions/)
})

test('a tool outside the allowed list is refused and never executed', async () => {
  const log = [], r = await runToolLoop({ request: 'x', tools, llm: scripted(C('delete_repo', '{}'), A('could not')), call: call(log) })
  assert.equal(log.length, 0); assert.equal(r.steps[0].refused, true); assert.equal(r.answer, 'could not')
})

test('bad arguments and failing calls become steps, not crashes', async () => {
  const r = await runToolLoop({ request: 'x', tools, llm: scripted(C('list_issues', 'not json'), C('list_issues', '[]'), C('list_issues', '{}'), A('gave up')), call: async () => { throw new Error('server down') } })
  assert.deepEqual(r.steps.map((s) => s.text), ['arguments were not a JSON object', 'arguments were not a JSON object', 'server down']); assert.equal(r.answer, 'gave up')
})

test('after maxSteps the model must answer, and a model that keeps calling is cut off', async () => {
  const llm = scripted(C('list_issues', '{}'), C('list_issues', '{}'), C('list_issues', '{}'))
  const r = await runToolLoop({ request: 'x', tools, llm, call: call(), maxSteps: 2 })
  assert.equal(r.steps.length, 2); assert.match(llm.seen[2], /must answer now/); assert.ok(r.answer.length > 0)
})

test('catalog entries are unique, public view hides commands, unknown ids give null', () => {
  assert.equal(new Set(CATALOG.map((c) => c.id)).size, CATALOG.length)
  assert.ok(publicCatalog().every((c) => !('command' in c) && !('args' in c)))
  assert.equal(entry('github').requires[0].key, 'GITHUB_PERSONAL_ACCESS_TOKEN'); assert.equal(entry('nope'), null)
})
