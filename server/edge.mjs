// Publishes this machine as the backend of the hosted UI: runs a Cloudflare quick tunnel and announces its address to the edge.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const FILE = path.join(os.homedir(), '.config', 'picked', 'edge.env')
/** { secret, url } from ~/.config/picked/edge.env, or null when the edge is not configured on this machine. */
export function edgeConfig() {
  if (process.env.PICKED_NO_EDGE || !fs.existsSync(FILE)) return null
  const env = Object.fromEntries(fs.readFileSync(FILE, 'utf8').split('\n').map((l) => l.split(/=(.*)/s).slice(0, 2)).filter(([k, v]) => k && v))
  return env.EDGE_SECRET && env.EDGE_URL ? { secret: env.EDGE_SECRET, url: env.EDGE_URL.replace(/\/$/, '') } : null
}

export function startEdge(port, cfg, log = console.log) {
  let child = null, tunnel = '', stopped = false, timer = null
  const beat = async (method = 'POST') => {
    if (method === 'POST' && !tunnel) return
    try {
      const r = await fetch(`${cfg.url}/api/_beat`, { method, headers: { 'x-edge-secret': cfg.secret, 'content-type': 'application/json' }, body: method === 'POST' ? JSON.stringify({ url: tunnel }) : undefined, signal: AbortSignal.timeout(8000) })
      if (!r.ok) log(`edge: heartbeat ${r.status}`)
    } catch (e) { log(`edge: heartbeat failed (${e.cause?.code || e.message})`) }
  }
  const spawnTunnel = () => {
    tunnel = ''
    child = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`], { stdio: ['ignore', 'ignore', 'pipe'] })
    let buf = ''
    child.stderr.on('data', (c) => {
      buf += c
      const m = buf.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)
      if (m && m[0] !== tunnel) { tunnel = m[0]; log(`edge: ${cfg.url} → this machine (${tunnel})`); beat() }
      if (buf.length > 4000) buf = buf.slice(-1000)
    })
    child.on('exit', () => { tunnel = ''; if (!stopped) { log('edge: tunnel stopped, restarting in 5 s'); setTimeout(spawnTunnel, 5000) } })
    child.on('error', (e) => { log(`edge: cannot start cloudflared (${e.message})`); stopped = true })
  }
  spawnTunnel()
  // Cloudflare KV's free plan allows 1,000 writes a day: the address is written when the tunnel changes and refreshed hourly (the record lasts 24 h); a dead tunnel shows as offline because the request itself fails
  timer = setInterval(() => beat(), 3600000)
  const stop = async () => { stopped = true; clearInterval(timer); await beat('DELETE'); child?.kill() }
  for (const s of ['SIGINT', 'SIGTERM']) process.once(s, () => stop().finally(() => process.exit(0)))
  return { stop, url: () => tunnel }
}
