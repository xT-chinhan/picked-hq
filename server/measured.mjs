// Real timings from the runs saved on this machine: what the cost comparison uses instead of made-up numbers.
import fs from 'node:fs'
import path from 'node:path'

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null }
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }

/** analysesDir: saved Business X-rays; runDirs: saved audits (first one wins when an id exists twice). */
export function measured({ analysesDir, runDirs = [] }) {
  const xray = []
  if (analysesDir && fs.existsSync(analysesDir)) for (const f of fs.readdirSync(analysesDir)) { if (!f.endsWith('.json') || f === 'index.json') continue; const r = readJson(path.join(analysesDir, f)); if (r && !r.partial && Number.isFinite(r.ms) && r.ms > 0) xray.push(r.ms) }
  const audit = [], seen = new Set()
  for (const d of runDirs) {
    if (!fs.existsSync(d)) continue
    for (const f of fs.readdirSync(d)) {
      if (!f.endsWith('.json') || f === 'index.json' || seen.has(f)) continue; seen.add(f)
      const r = readJson(path.join(d, f)), st = r?.events?.find?.((e) => e.type === 'run.start')
      // only runs that really asked Gemini (a replay of saved answers is not a measurement of the work)
      if (r && st && !st.reused && st.total >= 30 && Number.isFinite(r.ms) && r.ms > 0) audit.push({ ms: r.ms, questions: st.total })
    }
  }
  return {
    xray: { n: xray.length, medianMs: median(xray) },
    audit: { n: audit.length, medianMs: median(audit.map((a) => a.ms)), questions: audit.length ? Math.max(...audit.map((a) => a.questions)) : 40 },
  }
}
