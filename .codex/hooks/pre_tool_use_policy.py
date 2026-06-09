#!/usr/bin/env python3
"""Compatibility wrapper for Codex pre-tool policy hooks."""

import subprocess
import sys

sys.exit(subprocess.call(["node", "--import", "tsx", ".codex/hooks/pre-tool-use.ts"]))
