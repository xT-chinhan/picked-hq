import type { ComponentType } from 'react'
import { Truth, nodeTypes } from './nodes'
import { flowTypes } from './flows'
import { useLive } from './live'
import * as V from './livenodes'

/** In a live or replayed run, each of these cards swaps to its real-data variant; otherwise the scripted showcase stays. */
const swap = (Base: ComponentType<any>, Live: ComponentType<any>) => function Swapped(props: any) {
  const on = useLive((s) => s.mode !== 'script')
  return on ? <Live {...props} /> : <Base {...props} />
}
const all: Record<string, ComponentType<any>> = { ...nodeTypes, ...flowTypes }
/** stand-alone cards carry their Real / Simulated tag just above the card */
const tag = (Comp: ComponentType<any>, k: string) => function Tagged(props: any) {
  return <><Truth k={k} className="absolute -top-[22px] left-2" /><Comp {...props} /></>
}
export const allTypes: Record<string, ComponentType<any>> = {
  ...all,
  store: swap(all.store, V.StoreLive), minesrc: swap(all.minesrc, V.MineBrandLive), minetop: swap(all.minetop, V.MineTopLive),
  syncchan: swap(all.syncchan, V.SyncChanLive), synctruth: swap(all.synctruth, V.SyncTruthLive),
  writer: swap(all.writer, V.WriterLive), citesrc: swap(all.citesrc, V.CiteSourcesLive), citemail: swap(all.citemail, V.CiteMailLive), citever: swap(all.citever, V.CiteVerifyLive),
  check: swap(all.check, V.CheckLive), conf: swap(all.conf, V.ConfLive), retest: swap(all.retest, V.RetestLive),
  riskclaims: swap(all.riskclaims, V.RiskClaimsLive), riskpii: swap(all.riskpii, V.RiskPiiLive), riskroute: swap(all.riskroute, V.RiskRouteLive),
  approval: swap(all.approval, V.ApprovalLive), zalo: swap(all.zalo, V.ApprovalPhoneLive), publish: swap(all.publish, V.PublishLive),
  track: swap(all.track, V.TrackLive), impact: swap(all.impact, V.ImpactLive),
}
for (const [t, k] of [['store', 'intake'], ['approval', 'approve'], ['zalo', 'approve'], ['publish', 'publish'], ['track', 'track'], ['impact', 'impact']]) allTypes[t] = tag(allTypes[t], k)
