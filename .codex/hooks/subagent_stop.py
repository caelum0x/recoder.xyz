#!/usr/bin/env python3
"""Compatibility wrapper for Codex subagent-stop hooks."""

import subprocess
import sys

sys.exit(subprocess.call(["node", "--import", "tsx", ".codex/hooks/subagent-stop.ts"]))
