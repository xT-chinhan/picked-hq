import { useEffect, useState } from 'react'
import type { Phase } from './sim'

/* The company's faces: 30 characters cut from the avatar sheet (public/avatars/aNN.webp, transparent). */
export type Person = { id: string; name: string; role: string; av: string; color: string; phase: Phase | 'any'; line: string }
const C: Record<string, string> = {}
fetch('/avatars/index.json').then((r) => r.json()).then((l: { id: string; color: string }[]) => l.forEach((x) => (C[x.id] = x.color))).catch(() => {})
export const tint = (av: string) => C[av] ?? '#6366f1'
export const src = (av: string) => `/avatars/${av}.webp`

/** Who does what. Names and roles match server/agents.mjs; the line is what the agent says when it is called. */
export const PEOPLE: Person[] = [
  { id: 'nan', name: 'NaN', role: 'Chief of staff', av: 'a21', color: '#7c3aed', phase: 'intake', line: 'I route every request.' },
  { id: 'lia', name: 'Lia', role: 'Translator', av: 'a12', color: '#0891b2', phase: 'intake', line: 'Any language in, English out.' },
  { id: 'mina', name: 'Mina', role: 'Question planner', av: 'a05', color: '#ca8a04', phase: 'mining', line: '40 questions real buyers ask.' },
  { id: 'scout1', name: 'Scout', role: 'Gemini tab', av: 'a04', color: '#ea580c', phase: 'research', line: 'Asking Gemini, anonymous tab.' },
  { id: 'scout2', name: 'Scout', role: 'Gemini tab', av: 'a02', color: '#ef4444', phase: 'research', line: 'Next question, fresh tab.' },
  { id: 'scout3', name: 'Scout', role: 'Gemini tab', av: 'a03', color: '#f97316', phase: 'research', line: 'Reading the answer.' },
  { id: 'scout4', name: 'Scout', role: 'Gemini tab', av: 'a13', color: '#38bdf8', phase: 'research', line: 'Logging who is named.' },
  { id: 'scout5', name: 'Scout', role: 'Gemini tab', av: 'a07', color: '#84cc16', phase: 'research', line: 'Counting the mentions.' },
  { id: 'ana', name: 'Ana', role: 'Analyst', av: 'a26', color: '#64748b', phase: 'analysis', line: 'Why the shop is skipped.' },
  { id: 'sy', name: 'Sy', role: 'Site auditor', av: 'a17', color: '#1d4ed8', phase: 'sync', line: 'Facts, each with its page.' },
  { id: 'mira', name: 'Mira', role: 'Writer', av: 'a24', color: '#ec4899', phase: 'content', line: 'Only from sourced facts.' },
  { id: 'theo', name: 'Theo', role: 'Outreach', av: 'a30', color: '#a16207', phase: 'citations', line: 'A pitch to the source AI trusts.' },
  { id: 'quinn', name: 'Quinn', role: 'Fact checker', av: 'a15', color: '#2563eb', phase: 'qa', line: 'Three models vote on each sentence.' },
  { id: 'rhea', name: 'Rhea', role: 'Risk officer', av: 'a28', color: '#6d28d9', phase: 'risk', line: 'No false claims. No personal data.' },
  { id: 'owner', name: 'Owner', role: 'The shop owner', av: 'a27', color: '#475569', phase: 'approve', line: 'Nothing ships without me.' },
  { id: 'pax', name: 'Pax', role: 'Publisher', av: 'a25', color: '#94a3b8', phase: 'publish', line: 'Publishing what was approved.' },
  { id: 'tara', name: 'Tara', role: 'Tracker', av: 'a10', color: '#10b981', phase: 'track', line: 'Measuring again next week.' },
]
/** The three models of the fact-check council. */
export const COUNCIL: Person[] = [
  { id: 'g4', name: 'Gemini 4', role: 'Council vote', av: 'a11', color: '#3b82f6', phase: 'qa', line: 'Supported.' },
  { id: 'astra', name: 'GPT-6 Astra', role: 'Council vote', av: 'a14', color: '#10b981', phase: 'qa', line: 'Supported.' },
  { id: 'opus', name: 'Claude Opus 5.5', role: 'Council vote', av: 'a20', color: '#d97757', phase: 'qa', line: 'Not supported.' },
]
/** Waiting on the bench, ready to be called into a team. */
export const BENCH: string[] = ['a01', 'a06', 'a08', 'a09', 'a16', 'a18', 'a19', 'a22', 'a23', 'a29']
export const person = (id: string) => PEOPLE.find((p) => p.id === id) ?? COUNCIL.find((p) => p.id === id) ?? null
/** The faces shown on a department card. */
const CREW: Partial<Record<Phase, string[]>> = { intake: ['nan', 'lia'], mining: ['mina'], research: ['scout1', 'scout2', 'scout3', 'scout4'], analysis: ['ana'], sync: ['sy'], content: ['mira'], citations: ['theo'], qa: ['quinn', 'g4', 'astra', 'opus'], risk: ['rhea'], approve: ['owner'], publish: ['pax'], track: ['tara'], impact: ['tara', 'ana'] }
export const crew = (phase: Phase) => (CREW[phase] ?? []).map((id) => person(id)!).filter(Boolean)

/** A round face for small spaces: the top of the character, on a soft tinted disc. */
export function Face({ av, size = 28, ring, className = '' }: { av: string; size?: number; ring?: string; className?: string }) {
  return (
    <span className={`relative inline-block flex-none overflow-hidden rounded-full ${className}`} style={{ width: size, height: size, background: `${tint(av)}22`, boxShadow: ring ? `0 0 0 2px #fff, 0 0 0 4px ${ring}` : undefined }}>
      <img src={src(av)} alt="" draggable={false} style={{ position: 'absolute', left: '50%', top: '6%', width: '112%', maxWidth: 'none', transform: 'translateX(-50%)' }} />
    </span>
  )
}

/** The whole character. `state`: idle breathes slowly, called pops and glows, asleep is dimmed. */
export function Avatar({ av, size = 96, state = 'idle', delay = 0, color }: { av: string; size?: number; state?: 'idle' | 'called' | 'asleep'; delay?: number; color?: string }) {
  const glow = color ?? tint(av)
  return (
    <span className="relative inline-block" style={{ width: size * 0.78, height: size }}>
      {state === 'called' && <span className="av-ring absolute inset-x-[-14%] bottom-[-4%] top-[8%] rounded-[50%]" style={{ background: `radial-gradient(closest-side, ${glow}55, transparent)` }} />}
      <img src={src(av)} alt="" draggable={false} className={`relative h-full w-full select-none object-contain ${state === 'idle' ? 'av-breathe' : state === 'called' ? 'av-called' : ''}`} style={{ animationDelay: `${delay}s`, filter: state === 'asleep' ? 'grayscale(.85) opacity(.55)' : undefined }} />
      <span className="absolute inset-x-[18%] -bottom-[3%] h-[7%] rounded-[50%] bg-slate-900/10 blur-[3px]" />
    </span>
  )
}

/** Re-render once the tint table has loaded (the faces use it for their soft background). */
export function useTints() { const [, set] = useState(0); useEffect(() => { const id = setTimeout(() => set(1), 600); return () => clearTimeout(id) }, []) }
