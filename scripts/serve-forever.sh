#!/usr/bin/env bash
# Stage mode: keep the backend up. If it ever exits, it is started again within a second. Stop with Ctrl+C.
cd "$(dirname "$0")/.."
trap 'kill $child 2>/dev/null; exit 0' INT TERM
while true; do
  node server/index.mjs & child=$!
  wait $child
  echo "backend exited ($?) at $(date +%T); restarting" >&2
  sleep 1
done
