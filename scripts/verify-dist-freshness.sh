#!/usr/bin/env bash
set -euo pipefail

# verify-dist-freshness.sh — deterministic build-freshness gate for workspace packages.
#
# Backend (and contract tests) consume packages/* through package.json exports that
# point at dist/, so a stale dist silently changes runtime behavior (recoder-mr9o;
# the a2a-sdk validateTaskHistory bite in recoder-1pv6). This gate compares the
# newest non-test src/**/*.ts(x) mtime against the newest dist artifact per package
# whose main/module/types/exports point at dist/, and fails on stale or missing dist.
#
# DIST_FRESHNESS_AUTO_BUILD=1 (default): rebuild stale packages via
#   `pnpm --filter <name> run build`, then re-check.
# DIST_FRESHNESS_AUTO_BUILD=0: report-only (exit 1 on stale).

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
PACKAGES_DIR="${REPO_ROOT}/packages"
AUTO_BUILD="${DIST_FRESHNESS_AUTO_BUILD:-1}"
# Allow a small clock/copy skew before calling a package stale.
TOLERANCE_SECONDS="${DIST_FRESHNESS_TOLERANCE_SECONDS:-2}"

run_freshness_check() {
python3 - "${PACKAGES_DIR}" "${TOLERANCE_SECONDS}" <<'PY'
import json
import pathlib
import sys
import time

packages_dir = pathlib.Path(sys.argv[1]).resolve()
tolerance = float(sys.argv[2])

SRC_SUFFIXES = {".ts", ".tsx"}
DIST_SUFFIXES = {".js", ".cjs", ".mjs", ".d.ts", ".d.cts", ".d.mts", ".json"}


def is_test_path(path: pathlib.Path) -> bool:
    name = path.name
    if ".test." in name or ".spec." in name:
        return True
    return "__tests__" in path.parts or "__mocks__" in path.parts


def newest_mtime(directory: pathlib.Path, suffixes, skip_tests: bool):
    newest = None
    newest_file = None
    if not directory.is_dir():
        return None, None
    for f in directory.rglob("*"):
        if not f.is_file():
            continue
        if not any(f.name.endswith(suffix) for suffix in suffixes):
            continue
        if skip_tests and is_test_path(f):
            continue
        mtime = f.stat().st_mtime
        if newest is None or mtime > newest:
            newest = mtime
            newest_file = f
    return newest, newest_file


def fmt(ts):
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ts))


def declared_dist_entries(manifest):
    """Every dist/ file the manifest promises consumers (main/module/types +
    exports leaves). A partial/interrupted build can leave dist mtime-fresh but
    missing one of these (e.g. tsup killed before the DTS step) — mtime alone
    calls that 'fresh' while tsc fails with TS7016."""
    entries = []

    def add(value):
        if isinstance(value, str) and value.startswith("./dist/"):
            entries.append(value[2:])
        elif isinstance(value, str) and value.startswith("dist/"):
            entries.append(value)

    for key in ("main", "module", "types"):
        add(manifest.get(key))

    def walk(node):
        if isinstance(node, dict):
            for child in node.values():
                walk(child)
        else:
            add(node)

    walk(manifest.get("exports"))
    return entries


stale = []
checked = 0

for pkg_dir in sorted(packages_dir.iterdir()):
    manifest_path = pkg_dir / "package.json"
    if not manifest_path.is_file():
        continue
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        continue

    entry_fields = json.dumps(
        {key: manifest.get(key) for key in ("main", "module", "types", "exports")}
    )
    if "dist/" not in entry_fields:
        continue
    if "build" not in manifest.get("scripts", {}):
        continue

    src_dir = pkg_dir / "src"
    dist_dir = pkg_dir / "dist"
    src_mtime, src_file = newest_mtime(src_dir, SRC_SUFFIXES, skip_tests=True)
    if src_mtime is None:
        continue

    checked += 1
    dist_mtime, _ = newest_mtime(dist_dir, DIST_SUFFIXES, skip_tests=False)

    if dist_mtime is None:
        stale.append(
            {
                "name": manifest.get("name", pkg_dir.name),
                "dir": pkg_dir.name,
                "reason": f"no dist artifacts (exports point at dist/; newest src {src_file.relative_to(pkg_dir)} {fmt(src_mtime)})",
            }
        )
    elif src_mtime - dist_mtime > tolerance:
        stale.append(
            {
                "name": manifest.get("name", pkg_dir.name),
                "dir": pkg_dir.name,
                "reason": (
                    f"src newer than dist by {int(src_mtime - dist_mtime)}s "
                    f"(src {src_file.relative_to(pkg_dir)} {fmt(src_mtime)} > dist {fmt(dist_mtime)})"
                ),
            }
        )
    else:
        def entry_missing(entry):
            if "*" in entry:
                return not any(pkg_dir.glob(entry))
            return not (pkg_dir / entry).is_file()

        missing = [e for e in dict.fromkeys(declared_dist_entries(manifest)) if entry_missing(e)]
        if missing:
            stale.append(
                {
                    "name": manifest.get("name", pkg_dir.name),
                    "dir": pkg_dir.name,
                    "reason": f"dist mtime-fresh but declared entries missing (partial build?): {', '.join(missing)}",
                }
            )

if stale:
    print(f"dist-freshness: FAIL ({len(stale)}/{checked} dist-pointing packages stale)")
    for item in stale:
        print(f"  packages/{item['dir']} ({item['name']}): {item['reason']}")
    print("dist-freshness: rebuild with:")
    names = " ".join(f"--filter {item['name']}" for item in stale)
    print(f"  pnpm {names} run build")
    sys.exit(1)

print(f"dist-freshness: PASS ({checked} dist-pointing packages fresh)")
PY
}

stale_package_names() {
  # Extract "(name)" package names from the FAIL report lines.
  printf '%s\n' "${CHECK_OUTPUT}" | sed -n 's/^  packages\/[^ ]* (\([^)]*\)):.*$/\1/p'
}

echo "== Workspace Dist Freshness Gate =="
echo "repo: ${REPO_ROOT}"

if [[ ! -d "${PACKAGES_DIR}" ]]; then
  echo "dist-freshness: FAIL (missing packages dir: ${PACKAGES_DIR})"
  exit 1
fi

set +e
CHECK_OUTPUT="$(run_freshness_check 2>&1)"
CHECK_STATUS=$?
set -e

printf '%s\n' "${CHECK_OUTPUT}"

if [[ ${CHECK_STATUS} -eq 0 ]]; then
  exit 0
fi

if [[ "${AUTO_BUILD}" != "1" ]]; then
  exit ${CHECK_STATUS}
fi

PNPM_BIN="pnpm"
if ! command -v pnpm >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    PNPM_BIN="corepack pnpm"
  else
    echo "dist-freshness: FAIL (pnpm not found; cannot rebuild stale dist)"
    exit 1
  fi
fi

echo "dist-freshness: rebuilding stale packages"
FILTERS=()
while IFS= read -r name; do
  [[ -n "${name}" ]] && FILTERS+=(--filter "${name}")
done < <(stale_package_names)

if [[ ${#FILTERS[@]} -eq 0 ]]; then
  echo "dist-freshness: FAIL (could not extract stale package names from report)"
  exit 1
fi

${PNPM_BIN} -C "${REPO_ROOT}" "${FILTERS[@]}" run build

run_freshness_check
