// Council: the same judging job goes to several different engines at once and the verdicts are merged by vote,
// so one model's mistake cannot decide whether a sentence is safe to publish.
import { call } from './engines.mjs'

/**
 * Merges judge answers of the shape { verdicts: [{ id, supported, why }] } from several engines.
 * A sentence is supported only with a strict majority of the engines that answered; a tie counts as not supported.
 * Returns { verdicts, votes } where votes[id] = [{ engine, supported }].
 */
export function mergeVerdicts(answers) {
  const votes = {}, why = {}
  for (const { engine, json } of answers) {
    for (const v of Array.isArray(json?.verdicts) ? json.verdicts : []) {
      if (typeof v?.id !== 'string' || typeof v.supported !== 'boolean') continue
      ;(votes[v.id] ??= []).push({ engine, supported: v.supported })
      if (!v.supported && !why[v.id]) why[v.id] = String(v.why ?? '')
      if (v.supported && !(v.id in why)) why[v.id] = ''
    }
  }
  const verdicts = Object.entries(votes).map(([id, vs]) => {
    const yes = vs.filter((x) => x.supported).length, supported = yes * 2 > vs.length
    const reason = supported ? answers.map((a) => a.json?.verdicts?.find((v) => v?.id === id && v.supported)?.why).find(Boolean) ?? '' : why[id] || 'not supported by the facts'
    return { id, supported, why: reason }
  })
  return { verdicts, votes }
}

/**
 * Runs make(id) for every id and resolves with the answers so far once all settled, or once a strict majority has answered
 * and `graceMs` has passed, so one slow engine cannot hold the others up. Late answers are ignored (their calls still finish and are logged).
 */
export function gather(ids, make, { graceMs = 15000 } = {}) {
  const quorum = Math.floor(ids.length / 2) + 1
  return new Promise((resolve) => {
    const answers = []; let pending = ids.length, timer = null, done = false
    const finish = () => { if (done) return; done = true; clearTimeout(timer); resolve(answers.slice()) }
    if (!ids.length) return finish()
    for (const id of ids) {
      Promise.resolve().then(() => make(id)).then((v) => { if (!done) answers.push(v) }, () => {}).finally(() => {
        pending--
        if (!pending) finish(); else if (answers.length >= quorum && !timer) timer = setTimeout(finish, graceMs)
      })
    }
  })
}

/**
 * An `llm` object (agyJson only) that fans every request out to `engineIds`. `onVotes(votes, answers)` receives each merge,
 * so the pipeline can show who agreed. Engines that fail are skipped; with none left the call fails.
 */
export function councilLlm(engineIds, { role = 'council', onVotes, graceMs = 15000 } = {}) {
  return {
    async agyJson({ prompt, schema, timeoutMs = 120000 }) {
      const answers = await gather(engineIds, (id) => call(id, { prompt, schema, role, timeoutMs }), { graceMs })
      if (!answers.length) throw new Error('every council engine failed')
      const merged = mergeVerdicts(answers)
      onVotes?.(merged.votes, answers.map((a) => ({ engine: a.engine, ms: a.ms, tokens: a.tokens })), engineIds.length)
      return { verdicts: merged.verdicts }
    },
    agyText: async ({ prompt, timeoutMs }) => (await call(engineIds[0], { prompt, role, timeoutMs })).text,
  }
}

/** Summary for the UI: how many sentences were unanimous and which ones the engines disagreed on. */
export function tally(votes) {
  const rows = Object.entries(votes).map(([id, vs]) => ({ id, yes: vs.filter((v) => v.supported).length, of: vs.length, split: vs.some((v) => v.supported) && vs.some((v) => !v.supported) }))
  return { sentences: rows.length, unanimous: rows.filter((r) => !r.split).length, split: rows.filter((r) => r.split).map((r) => r.id) }
}
