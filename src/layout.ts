import type { Phase } from './sim'

/* world coordinates shared by the canvas, the camera and the cursor swarm */
export type Rect = number[] // [x, y, w, h]
export const C = {
  mining: '#0891b2', research: '#4f46e5', analysis: '#7c3aed', content: '#ea580c',
  citations: '#db2777', sync: '#2563eb', qa: '#059669', risk: '#d97706',
}
export const R = {
  mining: [-820, 0, 720, 850], store: [0, 300, 240, 250], research: [340, 0, 1360, 850], analysis: [1820, 60, 560, 730],
  content: [0, 1000, 700, 850], qa: [820, 1060, 600, 730], risk: [1540, 1060, 560, 730],
  approval: [2220, 1200, 330, 450], zalo: [2620, 1060, 340, 730], publish: [3080, 1060, 390, 250], track: [3080, 1370, 390, 420],
  impact: [3590, 990, 1220, 870],
  citations: [0, 2060, 1080, 720], sync: [1200, 2060, 900, 720],
}
const at = (p: Rect, c: Rect): Rect => [p[0] + c[0], p[1] + c[1], c[2], c[3]]
export const LOCAL = {
  planner: [24, 88, 250, 738],
  sess: (i: number) => [300 + (i % 4) * 262, 88 + Math.floor(i / 4) * 249, 250, 240],
  diag: (k: number) => [24, 88 + k * 156, 250, 140],
  rivals: [298, 88, 238, 296], share: [298, 400, 238, 296],
  writer: (k: number) => [24 + (k % 2) * 338, 88 + Math.floor(k / 2) * 381, 314, 357],
  check: (k: number) => [24, 88 + k * 104, 250, 92],
  conf: [24, 400, 250, 296],
  retest: (j: number) => [298, 88 + j * 312, 278, 296],
  mineSrc: (k: number) => [24, 88 + k * 373, 320, 357], mineTop: [368, 88, 328, 738],
  citeSrc: [24, 88, 320, 608], citeMail: (k: number) => [368, 88 + k * 206, 320, 194], citeVer: [712, 88, 344, 608],
  syncChan: (k: number) => [24 + (k % 2) * 222, 88 + Math.floor(k / 2) * 310, 210, 298], syncTruth: [492, 88, 384, 608],
  riskClaims: [24, 88, 512, 320], riskPii: [24, 422, 512, 104], riskRoute: [24, 540, 512, 166],
}
export const planner = at(R.research, LOCAL.planner)
export const sess = (i: number) => at(R.research, LOCAL.sess(i))
export const diag = (k: number) => at(R.analysis, LOCAL.diag(k))
export const rivals = at(R.analysis, LOCAL.rivals)
export const share = at(R.analysis, LOCAL.share)
export const writer = (k: number) => at(R.content, LOCAL.writer(k))
export const check = (k: number) => at(R.qa, LOCAL.check(k))
export const conf = at(R.qa, LOCAL.conf)
export const retest = (j: number) => at(R.qa, LOCAL.retest(j))
export const mineSrc = (k: number) => at(R.mining, LOCAL.mineSrc(k))
export const mineTop = at(R.mining, LOCAL.mineTop)
export const citeSrc = at(R.citations, LOCAL.citeSrc)
export const citeMail = (k: number) => at(R.citations, LOCAL.citeMail(k))
export const citeVer = at(R.citations, LOCAL.citeVer)
export const syncChan = (k: number) => at(R.sync, LOCAL.syncChan(k))
export const syncTruth = at(R.sync, LOCAL.syncTruth)
export const riskClaims = at(R.risk, LOCAL.riskClaims)
export const riskPii = at(R.risk, LOCAL.riskPii)
export const riskRoute = at(R.risk, LOCAL.riskRoute)

export const ALL = { x: -900, y: -60, width: 5800, height: 3020 }
export const rect = (k: keyof typeof R, pad = 40) => ({ x: R[k][0] - pad, y: R[k][1] - pad, width: R[k][2] + pad * 2, height: R[k][3] + pad * 2 })
export const OWNER = { x: 2160, y: 1020, width: 860, height: 810 }

/* camera shots: one still framing per step, as (centre x, centre y, visible height) */
export type Shot = [number, number, number]
export const SHOT: Record<Phase, Shot> = {
  intake: [1950, 1450, 3100],
  mining: [-290, 425, 940],
  research: [1040, 430, 930],
  analysis: [2040, 428, 830],
  content: [560, 1425, 930],
  citations: [540, 2420, 820],
  sync: [1650, 2420, 820],
  qa: [1120, 1425, 840],
  risk: [1820, 1425, 830],
  approve: [2590, 1425, 850],
  publish: [3275, 1425, 830],
  track: [3360, 1425, 830],
  impact: [4200, 1425, 950],
}
export const VIEW = Object.fromEntries(Object.entries(SHOT).map(([k, [x, y, h]]) => [k, { x: x - h * 0.94, y: y - h / 2, width: h * 1.88, height: h }])) as Record<Phase, any>
