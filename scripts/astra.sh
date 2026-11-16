#!/usr/bin/env bash
# Run one work package on Codex Astra: scripts/astra.sh WP-B   (spec in docs/tasks/WP-B-*.md)
# Writes the model's final message to docs/tasks/out/<WP>.txt. Keep at most 3 running at once.
set -euo pipefail
cd "$(dirname "$0")/.."
wp="$1"; spec=$(ls docs/tasks/${wp}-*.md | head -1)
mkdir -p docs/tasks/out
codex exec --skip-git-repo-check --ephemeral -s workspace-write -m gpt-6-astra -c model_reasoning_effort=medium \
  -o "docs/tasks/out/${wp}.txt" "$(cat docs/tasks/_common.md "$spec")" < /dev/null > "docs/tasks/out/${wp}.log" 2>&1
echo "$wp done (exit $?) -> docs/tasks/out/${wp}.txt"
