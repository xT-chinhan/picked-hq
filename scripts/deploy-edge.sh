#!/usr/bin/env bash
# Builds the UI and publishes it, with the edge functions, to Cloudflare Pages (pickedhq.pages.dev).
# Needs ~/.config/picked/cloudflare.env (CLOUDFLARE_API_TOKEN); the backend itself runs on this machine via `pnpm live`.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ~/.config/picked/cloudflare.env; set +a
export CLOUDFLARE_ACCOUNT_ID=f9cd3d090f1c1d162b4522d10d663fcd
pnpm build
npx --yes wrangler pages deploy dist --project-name pickedhq --branch main --commit-dirty=true
