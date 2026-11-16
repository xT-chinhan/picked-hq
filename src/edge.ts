import { create } from 'zustand'

/** What the hosted UI shows whenever the team's own machine (the backend) is switched off. */
export const OFFLINE_MSG = 'NaN-Team đang tạm khóa để phát triển dự án'

/** null = not checked yet; the scripted demo and saved replays never depend on this. */
export const useEdge = create<{ online: boolean | null }>(() => ({ online: null }))
export async function probe() {
  let online = false
  try {
    const r = await fetch('/api/health', { cache: 'no-store', signal: AbortSignal.timeout(6000) })
    online = r.ok && !!(await r.json()).ok
  } catch { /* offline */ }
  if (useEdge.getState().online !== online) useEdge.setState({ online })
  return online
}
let started = false
export function watchEdge() {
  if (started) return
  started = true
  probe()
  setInterval(probe, 20000)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) probe() })
}
