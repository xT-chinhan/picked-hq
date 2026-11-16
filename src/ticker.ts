/** One shared 80 ms timer for every imperative text reveal, so twelve chat windows cost one interval instead of twelve React renders per tick. */
const subs = new Set<() => void>()
let id = 0
export function tick(cb: () => void) {
  subs.add(cb)
  if (!id) id = window.setInterval(() => subs.forEach((f) => f()), 80)
  return () => { subs.delete(cb); if (!subs.size) { clearInterval(id); id = 0 } }
}
