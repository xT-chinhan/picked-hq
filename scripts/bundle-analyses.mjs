// Copies the saved business analyses next to the app so they replay with no backend (the hosted page and a dead network).
import fs from 'node:fs'
const SRC = 'server/data/analyses', DST = 'public/analyses'
fs.mkdirSync(DST, { recursive: true })
for (const f of fs.readdirSync(DST)) fs.rmSync(`${DST}/${f}`)
const list = []
for (const f of fs.readdirSync(SRC).filter((x) => x.endsWith('.json'))) {
  const r = JSON.parse(fs.readFileSync(`${SRC}/${f}`, 'utf8'))
  fs.copyFileSync(`${SRC}/${f}`, `${DST}/${f}`)
  list.push({ id: r.id, brand: r.brand, url: r.url, siteScore: r.siteScore, finishedAt: r.finishedAt, partial: r.partial })
}
list.sort((a, b) => b.finishedAt - a.finishedAt)
fs.writeFileSync(`${DST}/index.json`, JSON.stringify(list))
console.log(list.map((x) => `${x.brand} ${x.siteScore}`).join(' | '))
