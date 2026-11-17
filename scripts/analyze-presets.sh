#!/usr/bin/env bash
# Runs the business analysis for a list of sites, one after another, and stores each report for offline replay.
# usage: scripts/analyze-presets.sh https://site1 https://site2 ...   (the backend must be running)
for u in "$@"; do
  id=$(curl -s -X POST localhost:5198/api/analyze -H 'content-type: application/json' -d "{\"input\":\"$u\"}" | python3 -c "import json,sys;print(json.load(sys.stdin).get('id',''))")
  [ -z "$id" ] && { echo "$u: refused"; continue; }
  curl -sN "localhost:5198/api/analyze/$id/events" >/dev/null
  echo "$u -> $id"
done
