import { launch, ask } from './gemini.mjs'
import { buildQuestions } from './questions.mjs'
import { parseAnswer, summarize } from './parse.mjs'

/** Runs one audit: N anonymous Gemini tabs in parallel work through the question list. Emits events as it goes. */
export async function runAudit({ brand, category, total = 40, tabs = 4, headed = false, signal }, emit) {
  const questions = buildQuestions(category, total)
  const t0 = Date.now(), results = new Array(questions.length).fill(null)
  emit({ type: 'run.start', brand, category, total: questions.length, tabs, questions })
  const { ctx, close } = await launch({ headed })
  let next = 0
  const worker = async (slot) => {
    await new Promise((r) => setTimeout(r, slot * 900)) // stagger tab opening
    while (true) {
      if (signal?.aborted) return
      const qi = next++
      if (qi >= questions.length) return
      emit({ type: 'q.start', qi, slot, q: questions[qi] })
      let lastErr = ''
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          let lastPartial = 0
          const raw = await ask(ctx, questions[qi], { onPartial: (text) => { if (Date.now() - lastPartial > 900) { lastPartial = Date.now(); emit({ type: 'q.partial', qi, text }) } } })
          const parsed = parseAnswer(raw, brand)
          results[qi] = { qi, q: questions[qi], text: raw.text, ms: raw.ms, ...parsed }
          emit({ type: 'q.done', ...results[qi] })
          lastErr = ''
          break
        } catch (e) { lastErr = String(e.message || e).slice(0, 120) }
      }
      if (lastErr) { results[qi] = { qi, q: questions[qi], error: lastErr }; emit({ type: 'q.error', qi, error: lastErr }) }
      emit({ type: 'run.progress', summary: summarize(results, brand, questions.length) })
    }
  }
  try { await Promise.all(Array.from({ length: Math.min(tabs, questions.length) }, (_, s) => worker(s))) } finally { await close() }
  const summary = summarize(results, brand, questions.length)
  emit({ type: 'run.done', summary, ms: Date.now() - t0 })
  return { summary, results }
}
