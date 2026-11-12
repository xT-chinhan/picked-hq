import { memo, useEffect, useRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useStoreApi } from '@xyflow/react'
import { FileText, Lightbulb, Mail, MessageCircle, MessageCircleQuestion, RefreshCw, Send, ShieldCheck, ShieldX, Store, TrendingUp, X } from 'lucide-react'
import { SCORES, clock, hash, phaseOf, scoreAt, scoutName, session, type Phase } from './sim'
import * as L from './layout'
import { rrect, setTrack, tracks, type Track } from './fx'

/* A swarm of agent cursors working the canvas: scouts drive the AI chat windows, runners drag cards
   between departments, inspectors draw selection boxes, the rest flock around the working team.
   Positions are pure functions of the clock. Cursors, cards, click ripples and every flow particle are
   painted on ONE canvas above the flow, so the DOM underneath stays still and cheap. */

type P = [number, number]
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const cl = (x: number) => Math.max(0, Math.min(1, x))
const jit = (h: number, r: number) => (((h >>> 7) % 1000) / 500 - 1) * r
const arc = (a: P, b: P, e: number, bend: number): P => {
  const dx = b[0] - a[0], dy = b[1] - a[1], s = Math.sin(Math.PI * e) * bend
  return [a[0] + dx * e - dy * s, a[1] + dy * e + dx * s]
}

/* ───────────── anchors (world coordinates) ───────────── */
const A = {
  store: (h: number): P => [L.R.store[0] + 120 + jit(h, 70), L.R.store[1] + 125 + jit(h >>> 3, 70)],
  planRow: (h: number): P => [L.planner[0] + 50 + (h % 140), L.planner[1] + 240 + ((h >>> 5) % 10) * 37],
  comp: (h: number): P => { const r = L.sess(h % 12); return [r[0] + 40 + ((h >>> 6) % 110), r[1] + 220] },
  verdict: (h: number): P => { const r = L.sess(h % 12); return [r[0] + 196 + jit(h, 14), r[1] + 33] },
  diag: (h: number): P => { const r = L.diag(h % 4); return [r[0] + 40 + ((h >>> 4) % 150), r[1] + 70 + jit(h, 16)] },
  rivalRow: (h: number): P => [L.rivals[0] + 40 + ((h >>> 4) % 150), L.rivals[1] + 62 + (h % 4) * 54],
  writerBody: (h: number): P => { const r = L.writer(h % 4); return [r[0] + 36 + ((h >>> 4) % 230), r[1] + 90 + ((h >>> 9) % 210)] },
  writerHead: (h: number): P => { const r = L.writer(h % 4); return [r[0] + 40 + ((h >>> 4) % 120), r[1] + 32] },
  check: (h: number): P => { const r = L.check(h % 3); return [r[0] + 200 + jit(h, 16), r[1] + 46] },
  retest: (h: number): P => { const r = L.retest(h % 2); return [r[0] + 44 + ((h >>> 4) % 140), r[1] + 274] },
  retestV: (h: number): P => { const r = L.retest(h % 2); return [r[0] + 220 + jit(h, 14), r[1] + 36] },
  apprRow: (h: number): P => [L.R.approval[0] + 60 + ((h >>> 4) % 190), L.R.approval[1] + 161 + (h % 4) * 52],
  channel: (h: number): P => [L.R.publish[0] + 52 + (h % 5) * 71.6 + jit(h, 6), L.R.publish[1] + 110 + jit(h >>> 3, 6)],
  chart: (h: number, t: number): P => {
    const idx = SCORES.indexOf(scoreAt(t))
    return [L.R.track[0] + 20 + (14 + idx * 62.4) * 1.03 + jit(h, 18), L.R.track[1] + 80 + (164 - (SCORES[idx] / 16) * 146) * 1.03 + jit(h >>> 3, 14)]
  },
}
type Route = { chip: string; src: (h: number, t: number) => P; dst: (h: number, t: number) => P }
const inR = (r: L.Rect) => (h: number): P => [r[0] + 30 + (h % Math.max(1, r[2] - 60)), r[1] + 46 + ((h >>> 6) % Math.max(1, r[3] - 76))]
const anyR = (rs: L.Rect[]) => (h: number): P => inR(rs[h % rs.length])(h >>> 2)
const MINE = [L.mineSrc(0), L.mineSrc(1)], MAILS = [0, 1, 2].map(L.citeMail), CHANS = [0, 1, 2, 3].map(L.syncChan)
const ROUTE: Record<Phase, Route> = {
  intake: { chip: 'shop', src: A.store, dst: anyR(MINE) },
  mining: { chip: 'chat', src: anyR(MINE), dst: inR(L.mineTop) },
  research: { chip: 'q', src: A.planRow, dst: A.comp },
  analysis: { chip: 'ans', src: A.verdict, dst: (h) => ((h >>> 11) % 3 ? A.diag(h) : A.rivalRow(h)) },
  content: { chip: 'idea', src: A.diag, dst: A.writerBody },
  citations: { chip: 'mail', src: inR(L.citeSrc), dst: anyR(MAILS) },
  sync: { chip: 'sync', src: anyR(CHANS), dst: inR(L.syncTruth) },
  qa: { chip: 'doc', src: A.writerHead, dst: (h) => ((h >>> 11) % 2 ? A.retest(h) : A.check(h)) },
  risk: { chip: 'shield', src: inR(L.riskClaims), dst: inR(L.riskRoute) },
  approve: { chip: 'ok', src: anyR([L.riskRoute, L.R.approval]), dst: inR(L.R.zalo) },
  publish: { chip: 'pub', src: inR(L.R.zalo), dst: A.channel },
  track: { chip: 'score', src: A.channel, dst: A.chart },
  impact: { chip: 'score', src: A.chart, dst: inR(L.R.impact) },
}
const RECTS: Record<Phase, L.Rect[]> = {
  intake: [L.R.store, L.planner, ...MINE],
  mining: [...MINE, L.mineTop],
  research: Array.from({ length: 12 }, (_, i) => L.sess(i)),
  analysis: [0, 1, 2, 3].map(L.diag).concat([L.rivals, L.share]),
  content: [0, 1, 2, 3].map(L.writer),
  citations: [L.citeSrc, ...MAILS, L.citeVer],
  sync: [...CHANS, L.syncTruth],
  qa: [0, 1, 2].map(L.check).concat([L.conf, L.retest(0), L.retest(1)]),
  risk: [L.riskClaims, L.riskPii, L.riskRoute],
  approve: [L.R.approval, L.R.zalo],
  publish: [L.R.publish, L.R.zalo],
  track: [L.R.track, L.R.publish],
  // the dashboard's own cards, so selection boxes frame a chart instead of tinting the whole board
  impact: [[L.R.impact[0] + 24, L.R.impact[1] + 84, 558, 405], [L.R.impact[0] + 26, L.R.impact[1] + 502, 380, 341],
    [L.R.impact[0] + 420, L.R.impact[1] + 502, 380, 341], [L.R.impact[0] + 814, L.R.impact[1] + 502, 380, 341]],
}

/* ───────────── the cast ───────────── */
const PAL = ['#4f46e5', '#ea580c', '#059669', '#0ea5e9', '#e11d48', '#7c3aed', '#d97706', '#0d9488', '#c026d3', '#2563eb']
const NAMES = ['Kai', 'Noor', 'Iris', 'Otto', 'Vera', 'Juno', 'Remy', 'Sage', 'Nico', 'Zara', 'Milo', 'Tess', 'Finn', 'Lena', 'Hugo', 'Yuki', 'Omar', 'Cleo']
type Kind = 'scout' | 'carry' | 'mark' | 'float'
const mk = (kind: Kind, n: number, name: (k: number) => string, c0: number) => Array.from({ length: n }, (_, k) => ({ kind, k, name: name(k), color: PAL[(k + c0) % PAL.length] }))
export const CAST = [
  ...mk('scout', 12, scoutName, 0),
  ...mk('carry', 10, (k) => NAMES[k], 3),
  ...mk('mark', 3, (k) => `QA-${k + 1}`, 6),
]

type Pose = { x: number; y: number; mode: string; chip: string; u: number; spring?: number }
const loopOf = (t: number, P: number, off: number) => { const v = (t + off) / P, n = Math.floor(v); return { n, u: v - n, t0: n * P - off } }

function carrier(k: number, t: number): Pose & { a: P; b: P } {
  const P = 3 + (k % 5) * 0.24, off = k * 0.41
  const { n, u } = loopOf(t, P, off)
  const leg = (m: number) => {
    const tm = Math.max(0, m * P - off + P * 0.2), r = ROUTE[phaseOf(tm)], h = hash(k + 31, m)
    return { a: r.src(h, tm), b: r.dst(hash(k + 77, m), tm), chip: r.chip, bend: ((h >>> 9) % 2 ? 1 : -1) * 0.13 }
  }
  const g = leg(n)
  let p: P
  if (u < 0.1) p = g.a
  else if (u < 0.58) p = arc(g.a, g.b, ease((u - 0.1) / 0.48), g.bend)
  else if (u < 0.66) p = g.b
  else p = arc(g.b, leg(n + 1).a, ease((u - 0.66) / 0.34), -g.bend * 0.7)
  const drag = u >= 0.1 && u < 0.6
  return { x: p[0], y: p[1], mode: 'arrow', chip: drag ? g.chip : '', u, a: g.a, b: g.b }
}

function scout(i: number, t: number): Pose & { key: string } {
  const s = session(t, i), r = L.sess(i)
  let p: P, mode = 'arrow'
  if (s.stage === 'boot') p = [r[0] + 125, r[1] + 140]
  else if (s.stage === 'type') { p = [r[0] + 36 + Math.min(150, s.typed * 4.3), r[1] + 220]; mode = 'text' }
  else if (s.stage === 'think') p = [r[0] + 228, r[1] + 221]
  else if (s.stage === 'answer') { const f = s.shown / s.total; p = [r[0] + 34 + ((f * 5) % 1) * 150, r[1] + 96 + f * 78]; mode = 'text' }
  else p = [r[0] + 198, r[1] + 34]
  return { x: p[0], y: p[1], mode, chip: '', u: 0, key: `${s.qi}${s.stage}`, spring: s.stage === 'type' || s.stage === 'answer' ? 16 : 9 }
}

function marker(k: number, t: number) {
  const P = 3.3 + k * 0.33, off = k * 0.9
  const { n, u } = loopOf(t, P, off)
  const box = (m: number) => {
    const tm = Math.max(0, m * P - off + P * 0.25), list = RECTS[phaseOf(tm)], r = list[hash(k + 91, m) % list.length]
    return { tl: [r[0] - 8, r[1] - 8] as P, br: [r[0] + r[2] + 8, r[1] + r[3] + 8] as P }
  }
  const b = box(n)
  let p: P, grow = 0, op = 0
  if (u < 0.22) p = arc(box(n - 1).br, b.tl, ease(u / 0.22), 0.1)
  else if (u < 0.6) { grow = ease((u - 0.22) / 0.38); p = [b.tl[0] + (b.br[0] - b.tl[0]) * grow, b.tl[1] + (b.br[1] - b.tl[1]) * grow]; op = 1 }
  else { p = b.br; grow = 1; op = 1 - cl((u - 0.7) / 0.12) }
  return { x: p[0], y: p[1], mode: 'cross', chip: '', u, tl: b.tl, w: (b.br[0] - b.tl[0]) * grow, h: (b.br[1] - b.tl[1]) * grow, op }
}


/* ───────────── canvas painters ───────────── */
const CHIP: Record<string, { c: string; I: any }> = {
  chat: { c: '#0068FF', I: MessageCircle }, mail: { c: '#db2777', I: Mail }, sync: { c: '#2563eb', I: RefreshCw }, shield: { c: '#d97706', I: ShieldX },
  shop: { c: '#0f172a', I: Store }, q: { c: '#4f46e5', I: MessageCircleQuestion }, ans: { c: '#e11d48', I: X }, idea: { c: '#7c3aed', I: Lightbulb },
  doc: { c: '#ea580c', I: FileText }, ok: { c: '#059669', I: ShieldCheck }, pub: { c: '#0ea5e9', I: Send }, score: { c: '#16a34a', I: TrendingUp },
}
const ARROW = new Path2D('M0 0 L0 16.6 L4.6 12.4 L7.7 19 L10.4 17.8 L7.4 11.3 L13.6 11.1 Z')
const IBEAM = new Path2D('M-3 -8 Q0 -8 0 -5.5 Q0 -8 3 -8 M0 -5.5 V5.5 M-3 8 Q0 8 0 5.5 Q0 8 3 8')
const CROSS = new Path2D('M0 -9 V9 M-9 0 H9')
const FONT = '"Inter Variable", ui-sans-serif, system-ui, sans-serif'
const TAU = Math.PI * 2
const tint = (hex: string, a: number) => `${hex}${Math.round(a * 255).toString(16).padStart(2, '0')}`

function Swarm() {
  const store = useStoreApi()
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current!, ctx = cv.getContext('2d')!
    const icons: Record<string, HTMLImageElement> = {}
    for (const k in CHIP) { const { c, I } = CHIP[k]; const im = new Image(); im.src = `data:image/svg+xml;utf8,${encodeURIComponent(renderToStaticMarkup(<I color={c} size={32} strokeWidth={2.3} />))}`; icons[k] = im }
    // outline runners around whatever is working
    const ring = (id: string, r: number[], on: Phase, color: string, rad: number) => setTrack(`ring-${id}`, rrect(r[0], r[1], r[2], r[3], rad), { color, on: [on], ring: true })
    ring('store', L.R.store, 'intake', '#4f46e5', 18); ring('research', L.R.research, 'research', L.C.research, 28); ring('analysis', L.R.analysis, 'analysis', L.C.analysis, 28)
    ring('content', L.R.content, 'content', L.C.content, 28); ring('qa', L.R.qa, 'qa', L.C.qa, 28); ring('approval', L.R.approval, 'approve', '#0f172a', 18)
    ring('publish', L.R.publish, 'publish', '#0ea5e9', 18); ring('track', L.R.track, 'track', '#16a34a', 18)
    ring('mining', L.R.mining, 'mining', L.C.mining, 28); ring('citations', L.R.citations, 'citations', L.C.citations, 28); ring('sync', L.R.sync, 'sync', L.C.sync, 28)
    ring('risk', L.R.risk, 'risk', L.C.risk, 28); ring('zalo', L.R.zalo, 'approve', '#0068FF', 46); ring('impact', L.R.impact, 'impact', '#4f46e5', 18)

    const st = CAST.map(() => ({ x: 0, y: 0, vx: 0, vy: 0, init: false, u: 0, key: '', chip: '', ca: 0 }))
    const ripples: { x: number; y: number; c: string; size: number; t0: number }[] = []
    const widths = new Map<string, number>()
    let raf = 0, last = performance.now(), score = -1, cw = 0, ch = 0
    const ripple = (x: number, y: number, c: string, size = 44, delay = 0) => ripples.push({ x, y, c, size, t0: performance.now() + delay })

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.05, (now - last) / 1000); last = now
      const { width: W, height: H, transform: [tx, ty, zoom] } = store.getState()
      if (!W || !H) return
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      if (cw !== W * dpr || ch !== H * dpr) { cv.width = cw = W * dpr; cv.height = ch = H * dpr }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H)
      const t = clock.t, ph = phaseOf(t)
      const X = (x: number) => x * zoom + tx, Y = (y: number) => y * zoom + ty
      const S = Math.max(0.82, Math.min(1.12, Math.pow(zoom, 0.22))) // on-screen size of cursors
      const lab = Math.max(0, Math.min(1, (zoom - 0.5) / 0.12))        // name tags fade out when far

      /* 1 ── flow particles */
      const comet = (tr: Track, f: number, r: number, alpha: number) => {
        const n = tr.pts.length / 2 - 1
        for (let j = 5; j >= 0; j--) {
          let g = f - (j * 8) / tr.len
          if (g < 0) { if (!tr.ring) continue; g += 1 }
          const i = Math.min(n - 1, Math.floor(g * n)), q = g * n - i
          const x = X(tr.pts[i * 2] + (tr.pts[i * 2 + 2] - tr.pts[i * 2]) * q), y = Y(tr.pts[i * 2 + 1] + (tr.pts[i * 2 + 3] - tr.pts[i * 2 + 1]) * q)
          if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue
          if (j === 0) { ctx.globalAlpha = alpha * 0.2; ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, TAU); ctx.fill() }
          ctx.globalAlpha = alpha * (1 - j * 0.17); ctx.beginPath(); ctx.arc(x, y, r * (1 - j * 0.14), 0, TAU); ctx.fill()
        }
      }
      tracks.forEach((tr) => {
        tr.a += ((tr.on.includes(ph) ? 1 : 0) - tr.a) * Math.min(1, dt * 3.5)
        if (tr.a > 0.02) {
          const n = tr.ring ? 4 : tr.thin ? 2 : Math.max(4, Math.round(tr.len / 130))
          const dur = tr.ring ? tr.len / 620 : Math.max(1.1, tr.len / 420)
          const r = tr.ring ? Math.max(2.2, 4.4 * zoom) : tr.thin ? Math.max(1.5, 2.8 * zoom) : Math.max(2.4, 5.2 * zoom)
          ctx.fillStyle = tr.color
          for (let k = 0; k < n; k++) comet(tr, (t / dur + k / n) % 1, r, tr.a)
        }
        if (!tr.thin && !tr.ring && tr.a < 0.98) {
          const dur = Math.max(1.1, tr.len / 420) * 2.6
          ctx.fillStyle = '#aab1c4'
          for (let k = 0; k < 2; k++) comet(tr, (t / dur + k / 2) % 1, Math.max(1.6, 3.2 * zoom), 1 - tr.a)
        }
      })
      ctx.globalAlpha = 1

      /* 2 ── agents */
      const marks: ReturnType<typeof marker>[] = []
      CAST.forEach((a, i) => {
        const s = st[i]
        let p: Pose
        if (a.kind === 'scout') {
          const q = scout(a.k, t); p = q
          if (q.key !== s.key) { if (s.key && q.key.endsWith('think')) ripple(q.x, q.y, a.color, 30); s.key = q.key }
        } else if (a.kind === 'carry') {
          const q = carrier(a.k, t); p = q
          if (s.u < 0.1 && q.u >= 0.1) ripple(q.a[0], q.a[1], a.color, 26)
          if (s.u < 0.6 && q.u >= 0.6) { ripple(q.b[0], q.b[1], CHIP[s.chip]?.c ?? a.color, 60); ripple(q.b[0], q.b[1], a.color, 34, 90) }
        } else if (a.kind === 'mark') {
          const q = marker(a.k, t); p = q; marks.push(q)
          if (s.u < 0.22 && q.u >= 0.22) ripple(q.x, q.y, a.color, 24)
        } else return
        s.u = p.u
        if (!s.init || !p.spring) { s.x = p.x; s.y = p.y; s.vx = s.vy = 0; s.init = true }
        else {
          const w = p.spring
          s.vx += (w * w * (p.x - s.x) - 2 * w * s.vx) * dt; s.x += s.vx * dt
          s.vy += (w * w * (p.y - s.y) - 2 * w * s.vy) * dt; s.y += s.vy * dt
        }
        if (p.chip) s.chip = p.chip
        s.ca += ((p.chip ? 1 : 0) - s.ca) * Math.min(1, dt * 14)
        ;(s as any).mode = p.mode
      })

      /* 3 ── selection boxes */
      ctx.font = `600 ${10.5 * S}px ${FONT}`; ctx.textBaseline = 'middle'
      marks.forEach((m, k) => {
        if (m.op <= 0.01 || m.w < 1) return
        const c = PAL[(k + 6) % PAL.length], x = X(m.tl[0]), y = Y(m.tl[1]), w = m.w * zoom, h = m.h * zoom
        ctx.globalAlpha = m.op
        ctx.fillStyle = tint(c, 0.07); ctx.fillRect(x, y, w, h)
        ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h)
        ctx.fillStyle = '#fff'
        for (const [hx, hy] of [[x, y], [x + w, y + h]]) { ctx.fillRect(hx - 3.5, hy - 3.5, 7, 7); ctx.strokeRect(hx - 3.5, hy - 3.5, 7, 7) }
        const label = `${Math.round(m.w)} × ${Math.round(m.h)}`, lw = ctx.measureText(label).width + 12 * S
        ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(x + w / 2 - lw / 2, y + h + 7, lw, 16 * S, 5 * S); ctx.fill()
        ctx.fillStyle = '#fff'; ctx.fillText(label, x + w / 2 - lw / 2 + 6 * S, y + h + 7 + 8.5 * S)
      })

      /* 4 ── click / drop ripples */
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i], p = (now - r.t0) / 700
        if (p >= 1) { ripples.splice(i, 1); continue }
        if (p < 0) continue
        const e = 1 - Math.pow(1 - p, 3), rad = (r.size / 2) * S * (0.15 + 0.85 * e)
        ctx.globalAlpha = (1 - p) * 0.9
        ctx.fillStyle = tint(r.c, 0.16); ctx.strokeStyle = r.c; ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(X(r.x), Y(r.y), rad, 0, TAU); ctx.fill(); ctx.stroke()
      }

      /* 5 ── cursors, the cards they drag, name tags */
      CAST.forEach((a, i) => {
        const s = st[i] as any, x = X(s.x), y = Y(s.y)
        if (x < -90 || y < -60 || x > W + 30 || y > H + 30) return
        ctx.setTransform(dpr * S, 0, 0, dpr * S, x * dpr, y * dpr)
        if (s.ca > 0.02) { // dragged card
          const c = CHIP[s.chip]
          ctx.save(); ctx.translate(15, 18); ctx.rotate(-0.09 * s.ca); ctx.scale(s.ca, s.ca); ctx.globalAlpha = Math.min(1, s.ca * 1.4)
          ctx.fillStyle = 'rgba(15,23,42,.16)'; ctx.beginPath(); ctx.roundRect(1, 5, 64, 31, 10); ctx.fill()
          ctx.fillStyle = '#fff'; ctx.strokeStyle = c.c; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(0, 0, 64, 31, 10); ctx.fill(); ctx.stroke()
          const im = icons[s.chip]; if (im.complete && im.naturalWidth) ctx.drawImage(im, 7.5, 7.5, 16, 16)
          ctx.fillStyle = tint(c.c, 0.28); ctx.beginPath(); ctx.roundRect(30, 10, 26, 3.6, 1.8); ctx.roundRect(30, 17.5, 16, 3.6, 1.8); ctx.fill()
          ctx.restore()
        }
        ctx.globalAlpha = a.kind === 'float' ? 0.85 : 1
        if (s.mode === 'arrow') {
          ctx.translate(0.5, 1.8); ctx.fillStyle = 'rgba(15,23,42,.22)'; ctx.fill(ARROW); ctx.translate(-0.5, -1.8)
          ctx.fillStyle = a.color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.fill(ARROW); ctx.stroke(ARROW)
        } else {
          const path = s.mode === 'text' ? IBEAM : CROSS
          ctx.lineCap = 'round'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.8; ctx.stroke(path); ctx.strokeStyle = a.color; ctx.lineWidth = 1.7; ctx.stroke(path)
        }
        if (a.name && lab > 0.02) {
          ctx.font = `600 10.5px ${FONT}`
          let w = widths.get(a.name); if (!w) widths.set(a.name, (w = ctx.measureText(a.name).width))
          const ly = 17 + 38 * s.ca
          ctx.globalAlpha = lab; ctx.fillStyle = a.color
          ctx.beginPath(); ctx.roundRect(13, ly, w + 13, 17, [3, 8.5, 8.5, 8.5]); ctx.fill()
          ctx.fillStyle = '#fff'; ctx.fillText(a.name, 19.5, ly + 9)
        }
      })
      ctx.globalAlpha = 1

      // celebrate every score jump
      const sNow = scoreAt(t)
      if (score >= 0 && sNow > score) for (let k = 0; k < 10; k++) { const c = A.chart(hash(k, 5), t); ripple(c[0] + jit(hash(k, 9), 110), c[1] + jit(hash(k, 3), 80), '#16a34a', 54 + k * 16, k * 70) }
      score = sNow
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [store])
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 z-[5] h-full w-full" />
}
export default memo(Swarm)
