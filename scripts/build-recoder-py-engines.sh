#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_VENV_ROOT="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_VENV_ROOT"
  rm -rf "$REPO_ROOT/backend/engines/py/colbert/colbert_ai.egg-info"
}
trap cleanup EXIT

uv build "$REPO_ROOT/backend/engines/py/browser-use"
uv build "$REPO_ROOT/backend/engines/py/mem0"
uv build "$REPO_ROOT/backend/engines/py/pal-mcp-server"

python3 -m venv "$TMP_VENV_ROOT/venv"
"$TMP_VENV_ROOT/venv/bin/python" -m pip install setuptools wheel >/dev/null
(
  cd "$REPO_ROOT/backend/engines/py/colbert"
  "$TMP_VENV_ROOT/venv/bin/python" setup.py sdist bdist_wheel
)

python3 -m compileall \
  "$REPO_ROOT/backend/engines/py/ops-recorder/work-signals/api" \
  "$REPO_ROOT/backend/engines/py/ops-recorder/work-signals/detectors" \
  "$REPO_ROOT/backend/engines/py/ops-recorder/work-signals/handoff" \
  "$REPO_ROOT/backend/engines/py/ops-recorder/work-signals/integrations" \
  "$REPO_ROOT/backend/engines/py/ops-recorder/work-signals/models" \
  "$REPO_ROOT/backend/engines/py/ops-recorder/work-signals/normalizers" \
  "$REPO_ROOT/backend/engines/py/ops-recorder/work-signals/query" \
  "$REPO_ROOT/backend/engines/py/ops-recorder/work-signals/storage" \
  "$REPO_ROOT/backend/engines/py/mem0/server/alembic" \
  "$REPO_ROOT/backend/engines/py/mem0/server/routers" \
  "$REPO_ROOT/backend/engines/py/mem0/server/scripts"
