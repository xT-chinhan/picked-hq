#!/usr/bin/env bash
# Builds the Python environment the business analysis uses (Scrapling). Run once on a new machine; the folder is gitignored (~370 MB).
# Needs uv (https://docs.astral.sh/uv/) and Python 3.10+.
set -euo pipefail
cd "$(dirname "$0")/.."
uv venv server/py/.venv --python 3.12 -q
uv pip install -q --python server/py/.venv/bin/python "scrapling[fetchers]" markdownify
server/py/.venv/bin/python - <<'PY'
from scrapling.fetchers import Fetcher
import logging; logging.disable(logging.CRITICAL)
p = Fetcher.get("https://example.com/", impersonate=None, stealthy_headers=False, timeout=15)
print("scrapling ok, status", p.status, "| markdown", len(p.markdown()), "chars")
PY
