#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

echo
echo "=== Agents Startup Runtime Verification ==="
echo
echo "Checklist:"
echo "- Confirm deployed revision includes latest startup-gating commits"
echo "- Run authenticated Agents sweep"
echo "- Review output for recoder-6l4 and recoder-q6u close criteria"
echo

node scripts/e2e-agents-auth.mjs

cat <<'EOF'

--- What To Check ---

For recoder-q6u:
- PASS if output shows:
  - "Response: Agent response appeared in chat"
  - or "Response: Error message rendered in chat"
- FAIL if output still shows:
  - "No visible response or error in chat after 10s"

For recoder-6l4:
- Compare repeated startup failures against the last known bad pattern:
  - /v1/thread/:id/agent-runs 404 x8
  - /v1/threads/:id 404 x7
- PASS only if those counts are gone or materially reduced

Secondary health checks:
- /v1/agents should stay 200
- /v1/projects/:id should stay 200
- /v1/project/:id/sandbox/status should stay 200
- /v1/threads/:id/tags should not spray 503s
- /v1/threads/archived should not 503
- /v1/memory/thread/:id/settings should not 503

Reference:
- docs/agents-startup-runtime-checklist.md

EOF
