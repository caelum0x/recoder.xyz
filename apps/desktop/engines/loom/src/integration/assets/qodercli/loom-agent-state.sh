#!/bin/sh
# managed by loom; reinstalling the integration replaces this file.
# LOOM_INTEGRATION_ID=qodercli
# LOOM_INTEGRATION_VERSION=2

[ "${1:-}" = "session" ] || exit 0
[ "${LOOM_ENV:-}" = "1" ] || exit 0
[ -n "${LOOM_SOCKET_PATH:-}" ] || exit 0
[ -n "${LOOM_PANE_ID:-}" ] || exit 0
command -v loom >/dev/null 2>&1 || exit 0
command -v python3 >/dev/null 2>&1 || exit 0

python3 -c '
import json
import os
import subprocess
import sys
import time

try:
    payload = json.load(sys.stdin)
    session_id = payload.get("session_id")
    if not isinstance(session_id, str) or not session_id:
        raise ValueError
    subprocess.run(
        [
            "loom", "pane", "report-agent-session", os.environ["LOOM_PANE_ID"],
            "--source", "loom:qodercli", "--agent", "qodercli",
            "--agent-session-id", session_id, "--seq", str(time.time_ns()),
        ],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=1,
        check=False,
    )
except Exception:
    pass
' 2>/dev/null || true
