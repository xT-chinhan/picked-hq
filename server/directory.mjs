// The brands the UI offers, with everything an audit needs. One source of truth for the server and the frontend.
export const CATEGORY = 'hộp cơm giữ nhiệt'
export const BRANDS = [
  { name: 'Elmich', website: 'https://elmich.vn', note: 'Pitch brand' },
  { name: 'Lock&Lock', website: 'https://www.locknlock.vn', note: 'Market leader' },
  { name: 'Sunhouse', website: 'https://sunhouse.com.vn', note: 'Local rival' },
  { name: 'Zojirushi', website: 'https://www.zojirushi.com.vn', note: 'Premium import' },
]
const key = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
/** Known brand for a typed name (case, spacing and "&" insensitive), or null. */
export const findBrand = (name) => BRANDS.find((b) => key(b.name) === key(name)) ?? null
