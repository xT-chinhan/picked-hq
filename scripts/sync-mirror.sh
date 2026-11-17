#!/usr/bin/env bash
# Mirror this machine (the server) to the second machine, so it has the same project, data and tools.
# Usage: scripts/sync-mirror.sh [user@host]   (needs an ssh key on that machine; set up once with ssh-copy-id)
# The mirror runs with the tunnel off (PICKED_NO_EDGE=1): only this machine answers pickedhq.pages.dev.
set -eu
H=${1:-chinhan@192.168.92.169}
R="rsync -aHs --partial"
APP="/home/chinhan/dự án /ai4biz-hackathon/"
$R --exclude server/data/profiles/ --exclude '*.log' --exclude node_modules --exclude dist --exclude server/py/.venv "$HOME$APP" "$H:$APP" 2>/dev/null || $R --exclude server/data/profiles/ --exclude '*.log' --exclude node_modules --exclude dist --exclude server/py/.venv "$APP" "$H:$APP"
$R ~/.config/picked/ "$H:.config/picked/"
$R ~/.codex_profiles/api/ "$H:.codex_profiles/api/"
ssh "$H" 'export XDG_RUNTIME_DIR=/run/user/$(id -u) PATH=$HOME/.nvm/versions/node/v24.14.1/bin:$PATH; cd "'"$APP"'app" && pnpm install --frozen-lockfile >/dev/null 2>&1; pnpm build 2>&1 | tail -1; systemctl --user restart picked-backend picked-ui; sleep 4; curl -s localhost:5198/api/health'
