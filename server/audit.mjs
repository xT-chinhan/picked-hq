import { launch, ask } from './gemini.mjs'
import { buildQuestions } from './questions.mjs'
import { parseAnswer, summarize } from './parse.mjs'
import { hub } from './browserhub.mjs'

const QUESTION_DEADLINE_MS = 110000 // one question never holds a tab longer than this, whatever the page does
const NEW_VISITOR_EVERY = 8 // questions per anonymous visitor before the worker starts over as a new one
const GIVE_UP_AFTER = 5 // this many questions in a row failing means Gemini is limiting us: stop asking, go on with what we have
const STALL_MS = 150000 // no progress at all for this long: say so, then close the browser so nothing stays hung

const deadline = (p, ms) => { let t; return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('deadline: the page stopped responding')), ms) })]).finally(() => clearTimeout(t)) }

/** Runs one audit: N anonymous Gemini tabs in parallel work through the question list. Emits events as it goes. A run always ends. */
export async function runAudit({ brand, category, total = 40, tabs = 4, headed = false, signal }, emit, { ask: askImpl = ask, launch: launchImpl = launch, deadlineMs = QUESTION_DEADLINE_MS, stallMs = STALL_MS, giveUpAfter = GIVE_UP_AFTER } = {}) {
  const questions = buildQuestions(category, total)
  const t0 = Date.now(), results = new Array(questions.length).fill(null)
  emit({ type: 'run.start', brand, category, total: questions.length, tabs, questions })
  const { ctx: first, fresh, close } = await launchImpl({ headed })
  let next = 0, streak = 0, stopped = false, lastProgress = Date.now(), warned = false
  const warn = (text) => { if (!warned) { warned = true; emit({ type: 'run.warning', text }) } }
  const watchdog = setInterval(() => {
    if (Date.now() - lastProgress > stallMs && !stopped) { stopped = true; warn('Gemini stopped answering. Finishing with the answers collected so far.'); close().catch(() => {}) }
  }, Math.min(10000, Math.max(50, stallMs / 3)))
  const worker = async (slot) => {
    await new Promise((r) => setTimeout(r, slot * 900)) // stagger tab opening
    let wctx = first, used = 0
    const rotate = async () => { const old = wctx; try { wctx = await fresh() } catch { stopped = true; return } used = 0; if (old) old.close().catch(() => {}) }
    if (slot > 0) await rotate()
    while (true) {
      if (signal?.aborted || stopped) return
      const qi = next++
      if (qi >= questions.length) return
      if (used >= NEW_VISITOR_EVERY) await rotate()
      emit({ type: 'q.start', qi, slot, q: questions[qi] })
      let lastErr = ''
      for (let attempt = 0; attempt < 2 && !stopped; attempt++) {
        try {
          let lastPartial = 0
          const raw = await deadline(askImpl(wctx, questions[qi], { onPage: (page) => hub.attach(`g${slot + 1}`, page, { kind: 'gemini', q: questions[qi] }), onPartial: (text) => { lastProgress = Date.now(); if (Date.now() - lastPartial > 900) { lastPartial = Date.now(); emit({ type: 'q.partial', qi, text }) } } }), deadlineMs)
          const parsed = parseAnswer(raw, brand)
          results[qi] = { qi, q: questions[qi], text: raw.text, ms: raw.ms, ...parsed }
          emit({ type: 'q.done', ...results[qi] })
          lastErr = ''; streak = 0; lastProgress = Date.now(); used++
          break
        } catch (e) { lastErr = String(e.message || e).slice(0, 120); if (attempt === 0 && !stopped) await rotate() } // a failed try starts over as a new visitor
      }
      if (lastErr) {
        results[qi] = { qi, q: questions[qi], error: lastErr }; emit({ type: 'q.error', qi, error: lastErr })
        if (!stopped && ++streak >= giveUpAfter) { stopped = true; warn(`Gemini refused ${giveUpAfter} questions in a row (it limits anonymous visitors). Continuing with the ${results.filter((r) => r && !r.error).length} answers collected.`) }
      }
      emit({ type: 'run.progress', summary: summarize(results, brand, questions.length) })
    }
  }
  try { await Promise.all(Array.from({ length: Math.min(tabs, questions.length) }, (_, s) => worker(s))) } finally { clearInterval(watchdog); await close().catch(() => {}) }
  // whatever was never asked is recorded as skipped, so the numbers add up and the pipeline goes on
  for (let i = 0; i < questions.length; i++) if (!results[i]) { results[i] = { qi: i, q: questions[i], error: 'skipped' }; emit({ type: 'q.error', qi: i, error: 'skipped' }) }
  const summary = summarize(results, brand, questions.length)
  emit({ type: 'research.done', summary, ms: Date.now() - t0 })
  return { summary, results }
}
