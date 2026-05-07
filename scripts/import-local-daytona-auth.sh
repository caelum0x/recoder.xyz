#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_ENV="${ROOT_ENV:-$REPO_ROOT/.env.production}"
DAYTONA_CONFIG_PATH="${DAYTONA_CONFIG_PATH:-${HOME}/.config/daytona/config.json}"
WRITE_MODE="${WRITE_MODE:-false}"

usage() {
  cat <<'EOF'
Import local Daytona auth/profile state into Recoder root env.

Usage:
  bash scripts/import-local-daytona-auth.sh [--write]

Behavior:
  - Reads active Daytona CLI profile from ~/.config/daytona/config.json
  - Extracts either:
      DAYTONA_API_KEY
    or
      DAYTONA_JWT_TOKEN + DAYTONA_ORGANIZATION_ID
  - Normalizes the local Daytona API URL for Recoder docker-backend usage
  - Prints the values or writes them into .env.production via scripts/set-production-vars.sh

Notes:
  - This script does not invent secrets.
  - It imports auth that already exists in the local Daytona CLI profile.
  - If no CLI profile exists yet, start the local Daytona stack and authenticate first.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --write)
      WRITE_MODE=true
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

if [[ ! -f "$DAYTONA_CONFIG_PATH" ]]; then
  cat >&2 <<EOF
No Daytona CLI config found at:
  $DAYTONA_CONFIG_PATH

Local Daytona repo evidence exists in:
  $REPO_ROOT/daytona-projects/daytona

Bootstrap path:
  1. Start local Daytona:
     cd "$REPO_ROOT/daytona-projects/daytona"
     docker compose -f docker/docker-compose.yaml up -d
  2. Log in through Daytona CLI or otherwise create a local profile.
  3. Re-run this script.

Local dev credentials documented in the fork:
  dashboard: http://localhost:3000
  user:      dev@daytona.io
  password:  password
EOF
  exit 1
fi

python3 - "$DAYTONA_CONFIG_PATH" "$WRITE_MODE" "$ROOT_ENV" "$REPO_ROOT" <<'PY'
import json
import os
import subprocess
import sys
from pathlib import Path

config_path = Path(sys.argv[1])
write_mode = sys.argv[2].lower() == "true"
root_env = Path(sys.argv[3])
repo_root = Path(sys.argv[4])

with config_path.open() as f:
    cfg = json.load(f)

active_id = cfg.get("activeProfile")
profiles = cfg.get("profiles") or []
active = next((p for p in profiles if p.get("id") == active_id), None)

if not active:
    raise SystemExit(f"Active Daytona profile not found in {config_path}")

api = active.get("api") or {}
api_url = api.get("url") or "http://localhost:3000/api"
api_key = api.get("key")
token = (api.get("token") or {}).get("accessToken")
org_id = active.get("activeOrganizationId")

if not api_key and not (token and org_id):
    raise SystemExit(
        "Active Daytona profile has neither api.key nor token.accessToken + activeOrganizationId"
    )

normalized_api_url = api_url.replace("http://localhost:", "http://host.docker.internal:")
normalized_api_url = normalized_api_url.replace("https://localhost:", "http://host.docker.internal:")

pairs = [
    f"DAYTONA_API_URL={normalized_api_url}",
    f"DAYTONA_SERVER_URL={normalized_api_url}",
]

if api_key:
    pairs.append(f"DAYTONA_API_KEY={api_key}")
else:
    pairs.append("DAYTONA_API_KEY=")
    pairs.append(f"DAYTONA_JWT_TOKEN={token}")
    pairs.append(f"DAYTONA_ORGANIZATION_ID={org_id}")

print("Local Daytona profile imported:")
print(f"  source: {config_path}")
print(f"  apiUrl: {normalized_api_url}")
print(f"  auth:   {'api-key' if api_key else 'jwt'}")
if not api_key:
    print(f"  orgId:  {org_id}")

if not write_mode:
    print("\nDry run values:")
    for pair in pairs:
        print(f"  {pair}")
    raise SystemExit(0)

cmd = [
    "bash",
    str(repo_root / "scripts" / "set-production-vars.sh"),
    "--write",
]
for pair in pairs:
    cmd.extend(["--root", pair])

subprocess.check_call(cmd, cwd=repo_root)
print(f"\nApplied to {root_env}")
PY
