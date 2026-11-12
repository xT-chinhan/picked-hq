import type { Phase } from './sim'

/* Paths that particles ride on (edges and card outlines), sampled once into world-space polylines
   so the canvas overlay can draw hundreds of comets per frame without touching the DOM. */
export type Track = { pts: Float32Array; len: number; color: string; on: Phase[]; thin?: boolean; ring?: boolean; a: number }
export const tracks = new Map<string, Track>()

let probe: SVGPathElement | null = null
export function setTrack(id: string, d: string, o: { color: string; on: Phase[]; thin?: boolean; ring?: boolean }) {
  if (!probe) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('style', 'position:absolute;width:0;height:0;visibility:hidden')
    probe = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    svg.appendChild(probe); document.body.appendChild(svg)
  }
  probe.setAttribute('d', d)
  const len = probe.getTotalLength(), n = Math.max(2, Math.ceil(len / 6) + 1), pts = new Float32Array(n * 2)
  for (let i = 0; i < n; i++) { const p = probe.getPointAtLength((len * i) / (n - 1)); pts[i * 2] = p.x; pts[i * 2 + 1] = p.y }
  tracks.set(id, { ...o, pts, len, a: tracks.get(id)?.a ?? 0 })
}
export const dropTrack = (id: string) => tracks.delete(id)
export const rrect = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r} ${y} H${x + w - r} A${r} ${r} 0 0 1 ${x + w} ${y + r} V${y + h - r} A${r} ${r} 0 0 1 ${x + w - r} ${y + h} H${x + r} A${r} ${r} 0 0 1 ${x} ${y + h - r} V${y + r} A${r} ${r} 0 0 1 ${x + r} ${y} Z`
