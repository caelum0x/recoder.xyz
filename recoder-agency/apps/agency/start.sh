#!/usr/bin/env python3
import os
import shlex
from pathlib import Path


def load_env(path: str) -> None:
    env_path = Path(path)
    if not env_path.exists():
        return

    for raw_line in env_path.read_text().splitlines():
      line = raw_line.strip()
      if not line or line.startswith("#") or "=" not in line:
        continue

      key, value = line.split("=", 1)
      key = key.strip()
      if not key or key in {"PORT", "HOSTNAME"}:
        continue

      value = value.strip()
      try:
        parsed = shlex.split(value, comments=False, posix=True)
        value = parsed[0] if parsed else ""
      except ValueError:
        value = value.strip('"').strip("'")

      os.environ[key] = value


for candidate in [
    "/root/recoder.xyz/.env.production",
    "/root/recoder.xyz/recoder-agency/apps/agency/.env.production",
    "/root/recoder.xyz/recoder-agency/apps/agency/.env.local",
]:
    load_env(candidate)

os.execvp("node", ["node", ".next/standalone/apps/agency/server.js"])
