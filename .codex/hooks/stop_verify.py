#!/usr/bin/env python3
"""Compatibility wrapper for Codex stop verification hooks."""

import subprocess
import sys

sys.exit(subprocess.call(["node", "--import", "tsx", ".codex/hooks/stop.ts"]))
