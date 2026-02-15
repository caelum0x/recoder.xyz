#!/usr/bin/env python3
"""Fail if backend runtime code introduces raw supabase imports."""

from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]

# Temporary explicit allowlist while cutover completes.
ALLOWED = {
    Path("core/utils/migrate_thread.py"),
    Path("core/utils/scripts/migrate_project_to_staging.py"),
}

INCLUDE_ROOTS = [Path("api.py"), Path("core")]
EXCLUDE_PARTS = {"tests", "scripts", "evals", "__pycache__"}

PATTERNS = [
    re.compile(r"^\s*import\s+supabase\b"),
    re.compile(r"^\s*from\s+supabase\b"),
    re.compile(r"^\s*from\s+core\.services\.supabase\b"),
    re.compile(r"^\s*import\s+core\.services\.supabase\b"),
]


def should_scan(path: Path) -> bool:
    if path.suffix != ".py":
        return False
    rel = path.relative_to(ROOT)
    if rel in ALLOWED:
        return False
    return not any(part in EXCLUDE_PARTS for part in rel.parts)


def iter_targets() -> list[Path]:
    out: list[Path] = []
    for root in INCLUDE_ROOTS:
        p = ROOT / root
        if p.is_file():
            out.append(p)
            continue
        if p.is_dir():
            out.extend(p.rglob("*.py"))
    return out


def main() -> int:
    violations: list[tuple[Path, int, str]] = []
    for path in iter_targets():
        if not should_scan(path):
            continue
        rel = path.relative_to(ROOT)
        lines = path.read_text(encoding="utf-8").splitlines()
        for idx, line in enumerate(lines, start=1):
            if any(p.search(line) for p in PATTERNS):
                violations.append((rel, idx, line.strip()))

    if violations:
        print("Supabase import guard failed. Use SQL helpers in core.services.db instead.")
        for rel, line_no, line in violations:
            print(f"- {rel}:{line_no}: {line}")
        return 1

    print("Supabase import guard passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
