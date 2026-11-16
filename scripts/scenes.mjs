// A contact sheet of the demo scenes (screenshots at the real size, then one montage) so a layout pass is one look.
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
const sel = (process.argv[2] || 'analysis,content,qa,risk,approve,impact').split(',')
const T = { mining: 0, research: 5, analysis: 20, content: 33, citations: 40, sync: 47, qa: 52, risk: 58, approve: 63, publish: 70, track: 75, impact: 80 }
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: false, args: ['--no-sandbox', '--window-size=1600,940', '--window-position=0,0'] })
const p = await b.newPage({ viewport: { width: 1600, height: 860 } })
const errs = []; p.on('pageerror', (e) => errs.push(e.message))
const files = []
for (const n of sel) { await p.goto(`http://localhost:5197/?nowake&t=${T[n]}`); await p.waitForTimeout(9500); const f = `/tmp/scene-${n}.png`; await p.screenshot({ path: f }); files.push(f) }
await b.close(); console.log('errors', JSON.stringify(errs.slice(0, 3)))
execFileSync('python3', ['-c', `
from PIL import Image
fs=${JSON.stringify(files)}
ims=[Image.open(f).resize((800,430)) for f in fs]
cols=2; rows=(len(ims)+1)//2
m=Image.new('RGB',(1600,430*rows),'white')
for i,im in enumerate(ims): m.paste(im,((i%cols)*800,(i//cols)*430))
m.save('/tmp/scenes.png')`])
