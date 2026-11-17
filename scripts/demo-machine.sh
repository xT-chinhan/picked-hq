#!/usr/bin/env bash
# Demo machine (this one): the UI runs here, the backend runs on the server machine. An SSH tunnel makes the server's API look local
# (so sign-in profiles, the agent browser and the extension work), and the built UI is served on http://localhost:5197.
# Usage: scripts/demo-machine.sh [user@server]    Stop with Ctrl+C.
set -u
SERVER=${1:-chinhan@192.168.92.169}
cd "$(dirname "$0")/.."
pnpm build >/dev/null 2>&1 || echo "build failed: serving the last build"
trap 'kill $(jobs -p) 2>/dev/null; exit 0' INT TERM
( while true; do ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=10 -o ServerAliveCountMax=3 -L 5198:127.0.0.1:5198 "$SERVER"; echo "tunnel dropped, reconnecting" >&2; sleep 1; done ) &
sleep 2
echo "Demo UI: http://localhost:5197   (API -> $SERVER:5198 through the tunnel)"
node node_modules/vite/bin/vite.js preview --port 5197 --strictPort
