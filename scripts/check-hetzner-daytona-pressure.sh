#!/usr/bin/env bash
set -euo pipefail

SSH_HOST="${SSH_HOST:-77.42.23.19}"
SSH_USER="${SSH_USER:-root}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_hetzner}"
REMOTE_REPO="${REMOTE_REPO:-/root/recoder.xyz}"
DAYTONA_SAMPLE_LIMIT="${DAYTONA_SAMPLE_LIMIT:-8}"

SSH_OPTS=(
  -i "$SSH_KEY"
  -o BatchMode=yes
  -o StrictHostKeyChecking=no
)

echo
echo "=== Daytona Pressure Check ==="
echo "Host: ${SSH_USER}@${SSH_HOST}"
echo "Repo: ${REMOTE_REPO}"
echo "Sample sandboxes: ${DAYTONA_SAMPLE_LIMIT}"
echo

ssh "${SSH_OPTS[@]}" "${SSH_USER}@${SSH_HOST}" \
  "REMOTE_REPO='${REMOTE_REPO}' DAYTONA_SAMPLE_LIMIT='${DAYTONA_SAMPLE_LIMIT}' bash -s" <<'REMOTE'
set -euo pipefail

REMOTE_REPO="${REMOTE_REPO:-/root/recoder.xyz}"
DAYTONA_SAMPLE_LIMIT="${DAYTONA_SAMPLE_LIMIT:-8}"

echo "--- Host volume ---"
df -h /mnt/HC_Volume_105319792 || true
df -i /mnt/HC_Volume_105319792 || true
echo

echo "--- Runner docker volume ---"
docker exec daytona-runner-1 sh -lc 'df -h /var/lib/docker && echo && df -i /var/lib/docker && echo && docker system df' || true
echo

echo "--- Daytona sandbox summary ---"
cd "${REMOTE_REPO}/backend"
PYTHONPATH=. .venv/bin/python - <<'PY'
import asyncio
import json
from collections import Counter
from datetime import datetime, timezone

from dotenv import dotenv_values
from daytona_sdk import AsyncDaytona, DaytonaConfig

cfg = dotenv_values("/root/recoder.xyz/backend/.env")
limit = int(__import__("os").environ.get("DAYTONA_SAMPLE_LIMIT", "8"))
daytona = AsyncDaytona(
    DaytonaConfig(
        api_key=cfg["DAYTONA_API_KEY"],
        api_url=cfg.get("DAYTONA_SERVER_URL"),
        target=cfg.get("DAYTONA_TARGET"),
    )
)


def coerce_ts(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except Exception:
            return None
    return None


async def inspect_started_sandbox(sandbox):
    info = {
        "id": sandbox.id,
        "state": str(getattr(getattr(sandbox, "state", None), "value", getattr(sandbox, "state", None))),
    }
    timestamp = (
        getattr(sandbox, "updated_at", None)
        or getattr(sandbox, "updatedAt", None)
        or getattr(sandbox, "created_at", None)
        or getattr(sandbox, "createdAt", None)
    )
    ts = coerce_ts(timestamp)
    if ts is not None:
        info["age_minutes"] = round((datetime.now(timezone.utc) - ts).total_seconds() / 60, 1)

    try:
        full = await daytona.get(sandbox.id)
        session_count = await full.process.exec(
            "find /home/daytona/.daytona/sessions -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l",
            timeout=10,
        )
        disk = await full.process.exec("df -h /home/daytona | tail -n 1", timeout=10)
        inode = await full.process.exec("df -i /home/daytona | tail -n 1", timeout=10)
        info["session_dirs"] = (session_count.result or "").strip()
        info["disk"] = (disk.result or "").strip()
        info["inode"] = (inode.result or "").strip()
    except Exception as exc:
        info["inspect_error"] = str(exc)

    return info


async def main():
    page = await daytona.list(limit=200)
    items = list(getattr(page, "items", []) or [])
    state_counter = Counter()
    for item in items:
        state = str(getattr(getattr(item, "state", None), "value", getattr(item, "state", None))).lower()
        state_counter[state] += 1

    print(json.dumps({
        "total": len(items),
        "states": dict(state_counter),
    }, indent=2))

    started = [
        item for item in items
        if str(getattr(getattr(item, "state", None), "value", getattr(item, "state", None))).lower() == "started"
    ]
    started.sort(
        key=lambda item: coerce_ts(
            getattr(item, "updated_at", None)
            or getattr(item, "updatedAt", None)
            or getattr(item, "created_at", None)
            or getattr(item, "createdAt", None)
        ) or datetime.fromtimestamp(0, tz=timezone.utc),
        reverse=True,
    )

    sample = started[:limit]
    details = []
    for item in sample:
        details.append(await inspect_started_sandbox(item))

    print()
    print(json.dumps({"started_sample": details}, indent=2))

asyncio.run(main())
PY
REMOTE
