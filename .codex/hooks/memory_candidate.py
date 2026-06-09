#!/usr/bin/env python3
"""Compatibility wrapper for Codex memory candidate hooks."""

import subprocess
import sys

sys.exit(subprocess.call(["node", "--import", "tsx", ".codex/hooks/memory-candidate.ts"]))
