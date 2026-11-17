import { create } from 'zustand'
import { AnimatePresence } from 'motion/react'
import { useLive, leaveLive } from './live'
import { clock, useSim } from './sim'
import { Messenger } from './Messenger'

/* The office is the messenger home: one row per agent, group chat, real jobs running inline. The animated workflow canvas behind it is the simulation.
   While the office is open the canvas is paused (see App); the demo clock starts when the office closes. */
export const useOffice = create<{ open: boolean }>(() => ({ open: location.pathname !== '/workflow' && !/[?&](t|nowake|nocam)\b/.test(location.search) }))

// keep the browser's Back button and the C shortcut aligned with the open office
let restoringRoute = false
useOffice.subscribe((state, previous) => {
  if (state.open === previous.open || restoringRoute) return
  const route = state.open ? '/' : '/workflow'
  if (location.pathname !== route) history.pushState({}, '', route)
})
window.addEventListener('popstate', () => {
  restoringRoute = true
  useOffice.setState({ open: location.pathname !== '/workflow' })
  restoringRoute = false
})

/** Start the scripted showcase from its first second. */
function playStory() { if (useLive.getState().mode !== 'script') leaveLive(); clock.t = 0; useSim.setState({ t: 0, now: Date.now() }); useOffice.setState({ open: false }) }

export function Office() {
  const open = useOffice((s) => s.open)
  return <AnimatePresence>{open && <Messenger onWorkflow={playStory} />}</AnimatePresence>
}
