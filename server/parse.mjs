/* Turns a Gemini answer into: who was recommended (in order), was the target brand named, which sources were cited. */
const noAccent = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
export const norm = (s) => noAccent(s).toLowerCase().replace(/[^a-z0-9]/g, '')
export function aliasesOf(brand) {
  const b = noAccent(brand).toLowerCase(), set = new Set([norm(b)])
  if (b.includes('&')) { set.add(norm(b.replace(/&/g, 'n'))); set.add(norm(b.replace(/&/g, 'and'))) }
  return [...set].filter((x) => x.length >= 3)
}
const CANON = { locknlock: 'Lock&Lock', locklock: 'Lock&Lock', lockandlock: 'Lock&Lock', zojirushi: 'Zojirushi', tiger: 'Tiger', thermos: 'Thermos', elmich: 'Elmich', sunhouse: 'Sunhouse', tupperware: 'Tupperware', kangaroo: 'Kangaroo' }
/* Known brands of the demo categories. Position in the answer = recommendation order. */
const DICT = [
  ['Lock&Lock', ['locknlock', 'locklock', 'lockandlock']], ['Zojirushi', ['zojirushi']], ['Tiger', ['tigercorp', 'tigerbrand', 'tiger']], ['Thermos', ['thermos']],
  ['Elmich', ['elmich']], ['Sunhouse', ['sunhouse']], ['Tupperware', ['tupperware']], ['Zebra', ['zebra']], ['Kangaroo', ['kangaroo']], ['Inochi', ['inochi']],
  ['Hakawa', ['hakawa']], ['Goldsun', ['goldsun']], ['Pigeon', ['pigeon']], ['Mikiko', ['mikiko']], ['Stanley', ['stanley']], ['Skater', ['skater']], ['Hario', ['hario']],
]
const STOP = /tiêu chí|lưu ý|gợi ý|kết luận|so sánh|bảng|mẹo|tóm lại|lời khuyên|nên |chọn|mua |cách |tổng quan|đặc điểm|ưu điểm|nhược điểm|chất liệu|giá |địa điểm|nơi bán|xem thêm|top |các |những |thương hiệu|hộp cơm|dung tích|kênh|địa chỉ|hệ thống|bảo hành|khả năng|điểm |phân khúc|loại |dành cho|phù hợp|tại |ở |trên |online|cửa hàng|siêu thị|sản phẩm/i
export function cleanNames(raw) {
  const head = raw.split('\n')[0].replace(/^\s*(\d+[.)]|[-•*o])\s*/, '').split(/\s[(–—-]\s|[(:：]/)[0]
  return head.split(/\s+&\s+|\s*\/\s*|\s*,\s*|\s\+\s|\svà\s/).map((x) => cleanName(x)).filter(Boolean)
}
export function cleanName(raw) {
  let s = raw.replace(/^\s*(\d+[.)]|[-•*o])\s*/, '').replace(/\*+/g, '').trim()
  s = s.split(/\s[(–—-]\s|[(:：]/)[0].trim()
  const n = norm(s)
  if (CANON[n]) return CANON[n]
  // brand names are plain ASCII; Vietnamese words carry diacritics ("Độ bền", "Vệ sinh")
  if (s.length < 2 || s.length > 28 || s.split(/\s+/).length > 3 || STOP.test(s) || !/^[A-Z0-9][\x20-\x7E]*$/.test(s)) return null
  return s
}
export function parseAnswer(raw, brand) {
  const nt = norm(raw.text), al = aliasesOf(brand)
  const found = new Map() // display name -> first position in the answer
  const add = (name, aliases) => {
    let pos = -1
    for (const a of aliases) { const i = nt.indexOf(a); if (i >= 0 && (pos < 0 || i < pos)) pos = i }
    if (pos >= 0 && (!found.has(name) || found.get(name) > pos)) found.set(name, pos)
  }
  for (const [name, aliases] of DICT) add(name, aliases)
  for (const h of [...(raw.heads || []), ...(raw.cells || [])]) for (const c of cleanNames(h)) add(c, [CANON[norm(c)] ? norm(c) : norm(c)])
  for (const l of raw.text.split('\n')) if (/^\s*\d+[.)]\s+\S/.test(l)) for (const c of cleanNames(l)) add(c, [norm(c)])
  const targetName = brand.trim()
  add(targetName, al)
  // fold the target's aliases into one entry
  for (const [name] of [...found]) if (name !== targetName && al.some((a) => norm(name) === a)) { const p = Math.min(found.get(name), found.get(targetName) ?? 1e9); found.delete(name); found.set(targetName, p) }
  const brands = [...found].sort((a, b) => a[1] - b[1]).map(([n]) => n).slice(0, 8)
  const mentioned = al.some((a) => nt.includes(a))
  const idx = brands.findIndex((b) => b === targetName)
  const rank = idx >= 0 ? idx + 1 : null
  const chips = (raw.chips || []).map((c) => c.split('\n')[0].trim()).filter(Boolean)
  return { brands, mentioned, rank, domains: chips }
}
export function summarize(results, brand, total) {
  const done = results.filter((r) => r && !r.error)
  const al = aliasesOf(brand)
  const comp = new Map(), src = new Map()
  let mentioned = 0, rankSum = 0, rankN = 0, top3 = 0, first = 0
  for (const r of done) {
    if (r.mentioned) mentioned++
    if (r.rank) { rankSum += r.rank; rankN++; if (r.rank <= 3) top3++; if (r.rank === 1) first++ }
    for (const b of r.brands) if (b !== brand.trim()) comp.set(b, (comp.get(b) || 0) + 1)
    for (const d of new Set(r.domains)) src.set(d, (src.get(d) || 0) + 1)
  }
  const top = (m, k) => [...m].sort((a, b) => b[1] - a[1]).slice(0, k)
  return {
    brand, total, answered: done.length, mentioned, mentionRate: done.length ? mentioned / done.length : 0, top3, first, avgRank: rankN ? rankSum / rankN : null,
    competitors: top(comp, 6).map(([name, count]) => ({ name, count })), sources: top(src, 8).map(([domain, count]) => ({ domain, count })),
  }
}
