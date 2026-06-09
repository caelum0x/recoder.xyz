#!/usr/bin/env python3
"""Compatibility wrapper for Codex before-compact hooks."""

import subprocess
import sys

sys.exit(subprocess.call(["node", "--import", "tsx", ".codex/hooks/before-compact.ts"]))
