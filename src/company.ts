import { create } from 'zustand'
import { useEdge } from './edge'
import { useEffect } from 'react'

/* The company as the backend reports it: agents with their souls and engines, and the engine room's ledger. */
export type AgentInfo = { id: string; name: string; role: string; phase: string; engine: { primary?: string; fallback?: string[]; council?: string[]; browser?: string; rules?: boolean }; tools: string[]; soul: string; soulHash: string; drift: boolean; lastCalls: number; lastMs: number | null; lastEngine: string | null }
export type EngineInfo = { id: string; label: string; driver: 'agy' | 'codex'; model: string; tier: 'fast' | 'write' | 'deep'; calls: number; fails: number; avgMs: number | null; tokens: number; last: number | null }
export type Call = { at: number; engine: string; role: string; ok: boolean; ms: number; tokens?: number; cached?: boolean }

export const useCompany = create<{ agents: AgentInfo[]; engines: EngineInfo[]; recent: Call[]; ok: boolean }>(() => ({ agents: [], engines: [], recent: [], ok: false }))
export async function refreshCompany() {
  try {
    const [a, e] = await Promise.all([fetch('/api/agents', { cache: 'no-store' }).then((r) => r.json()), fetch('/api/engines', { cache: 'no-store' }).then((r) => r.json())])
    useCompany.setState({ agents: a.agents, engines: e.engines, recent: e.recent, ok: true })
  } catch { useCompany.setState({ ok: false }) }
}
/** polls while a panel that shows the company is open */
export function useCompanyPoll(active: boolean) {
  const online = useEdge((s) => s.online)
  useEffect(() => {
    if (!active || online === false) return
    refreshCompany(); const id = setInterval(refreshCompany, 3000); return () => clearInterval(id)
  }, [active, online])
}
export const shortEngine = (id?: string | null) => (id ?? '').replace('-med', ' ·m').replace('-low', ' ·l').replace('-high', ' ·h').replace('-xhigh', ' ·xh')
