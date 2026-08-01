#!/usr/bin/env bash
#
# bundle-py-sidecars.sh — package the backend Python engine sidecars into
# RELOCATABLE, self-contained bundles the desktop app can ship in Resources.
#
# Each bundle is a uv-created relocatable venv backed by a standalone CPython, with
# the sidecar + its deps installed. Relocatable means the venv works after being
# copied into Recoder.app/Contents/Resources — it does not hardcode this machine's
# paths. The desktop packaging (electron-builder.config.cjs extraResources) then
# copies backend/engines/py/<name>/.bundle → Resources, and the backend points the
# sidecar at the bundled interpreter.
#
# HONEST SCOPE / caveats (why this needs an owner + a Mac boot-test):
#   - Native-heavy sidecars are OPT-IN: colbert pulls torch (multi-GB) and
#     browser-use pulls playwright browsers. They stay unbundled by default; the
#     runtime already degrades truthfully to not_configured without them.
#   - For a NOTARIZED app, every .dylib/.so inside a bundle must be signed
#     inside-out with the same Developer ID before `xcrun notarytool`. That signing
#     pass runs on the owner's Mac (see docs/OWNER-RUNBOOK.md §3), not here.
#   - This script produces the bundles; it does NOT sign or notarize them.
#
# Usage:
#   scripts/bundle-py-sidecars.sh            # light sidecars (mem0, pal-mcp, ops-recorder)
#   SIDECARS="mem0 colbert" scripts/bundle-py-sidecars.sh   # explicit set
#   INCLUDE_HEAVY=1 scripts/bundle-py-sidecars.sh           # + colbert + browser-use
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY_DIR="$REPO_ROOT/backend/engines/py"
PYTHON_VERSION="${RECODER_SIDECAR_PYTHON:-3.11}"

LIGHT_SIDECARS=(mem0 pal-mcp-server ops-recorder)
HEAVY_SIDECARS=(colbert browser-use)

# Resolve the set to build.
if [[ -n "${SIDECARS:-}" ]]; then
  read -r -a TARGETS <<< "$SIDECARS"
elif [[ "${INCLUDE_HEAVY:-0}" == "1" ]]; then
  TARGETS=("${LIGHT_SIDECARS[@]}" "${HEAVY_SIDECARS[@]}")
else
  TARGETS=("${LIGHT_SIDECARS[@]}")
fi

command -v uv >/dev/null 2>&1 || { echo "FATAL: uv not found (https://docs.astral.sh/uv/)"; exit 1; }

echo "== Bundle Python sidecars =="
echo "root:    $REPO_ROOT"
echo "python:  $PYTHON_VERSION (standalone, via uv)"
echo "targets: ${TARGETS[*]}"
echo

# Ensure a standalone CPython is available for a relocatable venv.
uv python install "$PYTHON_VERSION" >/dev/null 2>&1 || true

built=() failed=() skipped=()
for name in "${TARGETS[@]}"; do
  src="$PY_DIR/$name"
  if [[ ! -d "$src" ]]; then
    echo "SKIP $name — no such sidecar dir ($src)"; skipped+=("$name"); continue
  fi
  if [[ ! -f "$src/pyproject.toml" && ! -f "$src/setup.py" && ! -f "$src/requirements.txt" ]]; then
    echo "SKIP $name — no pyproject.toml / setup.py / requirements.txt to install from"; skipped+=("$name"); continue
  fi

  out="$src/.bundle"
  echo "-- $name → $out"
  rm -rf "$out"
  # Relocatable venv backed by the standalone interpreter.
  if ! uv venv --python "$PYTHON_VERSION" --relocatable "$out" >/dev/null 2>&1; then
    echo "   FAIL: could not create relocatable venv"; failed+=("$name"); continue
  fi
  # Install the sidecar into the bundle. Prefer the package (pyproject/setup);
  # fall back to requirements.txt for bare-script sidecars.
  install_ok=0
  if [[ -f "$src/pyproject.toml" || -f "$src/setup.py" ]]; then
    if (cd "$src" && uv pip install --python "$out" . >/dev/null 2>&1); then install_ok=1; fi
  fi
  if [[ "$install_ok" -eq 0 && -f "$src/requirements.txt" ]]; then
    if uv pip install --python "$out" -r "$src/requirements.txt" >/dev/null 2>&1; then install_ok=1; fi
  fi
  if [[ "$install_ok" -eq 0 ]]; then
    echo "   FAIL: dependency install failed (native deps may need a Mac toolchain)"; failed+=("$name"); continue
  fi
  echo "   OK ($(du -sh "$out" 2>/dev/null | cut -f1))"
  built+=("$name")
done

echo
echo "built:   ${built[*]:-(none)}"
echo "skipped: ${skipped[*]:-(none)}"
echo "failed:  ${failed[*]:-(none)}"
echo
echo "Next (owner, on the signing Mac):"
echo "  1. Sign every .dylib/.so inside each .bundle inside-out with the Developer ID."
echo "  2. The desktop build copies backend/engines/py/<name>/.bundle → Resources"
echo "     (electron-builder extraResources, OPTIONAL entries — see config)."
echo "  3. Rebuild + notarize + staple, then boot-test that the sidecars report ready."
[[ ${#failed[@]} -eq 0 ]] || exit 1
