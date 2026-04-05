#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
DOCKER_BACKEND_DIR="${REPO_ROOT}/docker-backend"
SRC_DIR="${DOCKER_BACKEND_DIR}/src"
DIST_DIR="${DOCKER_BACKEND_DIR}/dist"

run_backend_build() {
  echo "docker-backend-dist-parity: rebuilding docker-backend dist"

  if command -v pnpm >/dev/null 2>&1; then
    pnpm --dir "${DOCKER_BACKEND_DIR}" run build
    return
  fi

  if command -v corepack >/dev/null 2>&1; then
    corepack pnpm --dir "${DOCKER_BACKEND_DIR}" run build
    return
  fi

  echo "docker-backend-dist-parity: FAIL (pnpm not found; cannot rebuild dist)"
  exit 1
}

run_parity_check() {
python3 - "${SRC_DIR}" "${DIST_DIR}" <<'PY'
import pathlib
import re
import sys

src_dir = pathlib.Path(sys.argv[1]).resolve()
dist_dir = pathlib.Path(sys.argv[2]).resolve()

patterns = [
    re.compile(r"""^\s*(?:import|export)\b.*?\bfrom\s+['"](?P<spec>\.{1,2}/[^'"]+\.js)['"]""", re.MULTILINE),
    re.compile(r"""^\s*[^/\n]*\bimport\(\s*['"](?P<spec>\.{1,2}/[^'"]+\.js)['"]\s*\)""", re.MULTILINE),
    re.compile(r"""^\s*[^/\n]*\brequire\(\s*['"](?P<spec>\.{1,2}/[^'"]+\.js)['"]\s*\)""", re.MULTILINE),
]

source_suffixes = [".ts", ".tsx", ".js", ".mjs", ".cjs"]

missing = []

for source_file in src_dir.rglob("*"):
    if source_file.suffix not in {".ts", ".tsx", ".js", ".mjs", ".cjs"}:
        continue
    if source_file.name.endswith(".d.ts"):
        continue
    if any(source_file.name.endswith(suffix) for suffix in (".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx")):
        continue

    try:
        text = source_file.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        text = source_file.read_text(encoding="utf-8", errors="ignore")

    specs = set()
    for pattern in patterns:
        for match in pattern.finditer(text):
            specs.add(match.group("spec"))

    for spec in sorted(specs):
        spec_without_js = spec[:-3] if spec.endswith(".js") else spec
        resolved_no_ext = (source_file.parent / spec_without_js).resolve()

        candidate_sources = []
        for suffix in source_suffixes:
            candidate_sources.append(pathlib.Path(f"{resolved_no_ext}{suffix}"))
        for suffix in source_suffixes:
            candidate_sources.append(pathlib.Path(f"{resolved_no_ext}/index{suffix}"))

        existing_source = next((candidate for candidate in candidate_sources if candidate.exists()), None)
        if existing_source is None:
            missing.append(
                f"{source_file.relative_to(src_dir)} imports {spec} but no matching source file exists"
            )
            continue

        try:
            rel_from_src = existing_source.relative_to(src_dir)
        except ValueError:
            continue

        expected_dist = dist_dir / rel_from_src.with_suffix(".js")
        if not expected_dist.exists():
            missing.append(
                f"{source_file.relative_to(src_dir)} imports {spec} -> missing dist artifact {expected_dist.relative_to(dist_dir.parent)}"
            )

if missing:
    print("docker-backend-dist-parity: FAIL")
    for item in missing:
        print(f"  {item}")
    sys.exit(1)

print("docker-backend-dist-parity: PASS")
PY
}

echo "== docker-backend Dist Parity Check =="
echo "repo: ${REPO_ROOT}"

if [[ ! -d "${SRC_DIR}" ]]; then
  echo "docker-backend-dist-parity: FAIL (missing src dir: ${SRC_DIR})"
  exit 1
fi

if [[ ! -f "${DIST_DIR}/server.js" ]]; then
  run_backend_build
fi

set +e
PARITY_OUTPUT="$(run_parity_check 2>&1)"
PARITY_STATUS=$?
set -e

if [[ ${PARITY_STATUS} -eq 0 ]]; then
  printf '%s\n' "${PARITY_OUTPUT}"
  exit 0
fi

printf '%s\n' "${PARITY_OUTPUT}"

if [[ "${DOCKER_BACKEND_DIST_AUTO_BUILD:-1}" != "1" ]]; then
  exit ${PARITY_STATUS}
fi

run_backend_build
run_parity_check
