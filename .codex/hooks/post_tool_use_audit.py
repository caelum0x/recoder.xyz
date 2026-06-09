#!/usr/bin/env python3
"""Compatibility wrapper for Codex post-tool audit hooks."""

import subprocess
import sys

sys.exit(subprocess.call(["node", "--import", "tsx", ".codex/hooks/post-tool-use.ts"]))
