// Copies the extension's real panel (HTML, CSS, JS, icons) into public/ext so the app can show it inside a page for the recording.
// public/ext/stub.js stands in for Chrome's APIs and public/ext/brand.json (highlandscoffee.com.vn) is the page snapshot it reads; both are committed.
import fs from 'node:fs'
const SRC = 'extension', DST = 'public/ext'
fs.mkdirSync(`${DST}/lib`, { recursive: true }); fs.mkdirSync(`${DST}/icons`, { recursive: true })
for (const f of ['panel.css', 'panel.js']) fs.copyFileSync(`${SRC}/${f}`, `${DST}/${f}`)
for (const f of fs.readdirSync(`${SRC}/lib`)) fs.copyFileSync(`${SRC}/lib/${f}`, `${DST}/lib/${f}`)
for (const f of fs.readdirSync(`${SRC}/icons`).filter((x) => x.endsWith('.png'))) fs.copyFileSync(`${SRC}/icons/${f}`, `${DST}/icons/${f}`)
const html = fs.readFileSync(`${SRC}/panel.html`, 'utf8').replace('<script type="module" src="panel.js"></script>', '<script src="stub.js"></script>\n  <script type="module" src="panel.js"></script>')
if (!html.includes('stub.js')) throw new Error('could not place the stub in panel.html')
fs.writeFileSync(`${DST}/preview.html`, html)
console.log('extension preview ready in', DST)
