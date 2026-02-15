#!/usr/bin/env python3
"""Fail if DBConnection is used outside the allowed compatibility layer."""

from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]

# Only these files may directly import/construct DBConnection.
ALLOWED = {
    Path("core/utils/db_helpers.py"),
}

# Search runtime backend code only (exclude tests/scripts/evals/supabase migrations).
INCLUDE_ROOTS = [Path("api.py"), Path("core")]
EXCLUDE_PARTS = {"tests", "scripts", "evals", "supabase", "__pycache__"}

PATTERNS = [
    re.compile(r"from\s+core\.services\.supabase\s+import\s+DBConnection"),
    re.compile(r"from\s+core\.utils\.db_helpers\s+import\b"),
    re.compile(r"import\s+core\.utils\.db_helpers\b"),
    re.compile(r"\bDBConnection\s*\("),
    re.compile(r"\bget_db_client\s*\("),
    re.compile(r"await\s+db\.client\b"),
    re.compile(r"await\s+_db\.client\b"),
    re.compile(r"await\s+self\.db\.client\b"),
    re.compile(r"await\s+self\._db\.client\b"),
    re.compile(r"await\s+self\.thread_manager\.db\.client\b"),
    re.compile(r"await\s+thread_manager\.db\.client\b"),
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
            if line.lstrip().startswith("#"):
                continue
            if any(p.search(line) for p in PATTERNS):
                violations.append((rel, idx, line.strip()))

    if violations:
        print("DBConnection/client guard failed. Use core.services.db SQL helpers instead.")
        for rel, line_no, line in violations:
            print(f"- {rel}:{line_no}: {line}")
        return 1

    print("DBConnection usage guard passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
