#!/usr/bin/env bash
# Validate the Recoder self-host artifacts WITHOUT bringing anything up.
#
#   deploy/validate-selfhost.sh
#
# Runs the cheapest, most truthful static checks over the self-host machine-image
# surface so a broken artifact is caught before a Packer build or a boot:
#
#   1. `docker compose ... config -q`  — the compose file is well-formed AND every
#      ${VAR:?required} interpolation resolves. We feed a TEMPORARY env-file of
#      throwaway placeholder values (never real secrets, never written to the repo)
#      so the required-var guards pass deterministically in CI.
#   2. `bash -n` on every self-host shell script — they parse.
#   3. YAML parse of both Envoy bootstraps (PyYAML if present, else skipped+reported).
#   4. `packer validate` of the AMI template IF packer is installed (else skip+report).
#   5. `packer fmt -check` and HCL sanity IF packer is installed (advisory).
#
# Exit non-zero on the FIRST hard failure. Skips are reported, never silently
# passed. No stubs, no faked success.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.selfhost.yml"
PACKER_FILE="$ROOT_DIR/deploy/packer/recoder.pkr.hcl"
ENVOY_XDS="$ROOT_DIR/deploy/envoy/envoy.xds.yaml"
ENVOY_STATIC="$ROOT_DIR/deploy/envoy/envoy.selfhost.yaml"

SCRIPTS=(
  "$ROOT_DIR/scripts/selfhost-up.sh"
  "$ROOT_DIR/scripts/selfhost-down.sh"
  "$ROOT_DIR/deploy/packer/provision.sh"
  "$ROOT_DIR/deploy/postgres/init-databases.sh"
  "$SCRIPT_DIR/validate-selfhost.sh"
)

pass() { echo "PASS  $*"; }
skip() { echo "SKIP  $*"; }
fail() { echo "FAIL  $*" >&2; exit 1; }
info() { echo "==>   $*"; }

# Resolve the docker compose command (v2 plugin or legacy).
DC=()
if docker compose version >/dev/null 2>&1; then
  DC=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  DC=(docker-compose)
fi

# --- A temporary env-file of throwaway placeholders (NOT real secrets) ---
# Satisfies the ${VAR:?required} guards so `config -q` validates structure. These
# values never leave this run: the file is created with mktemp and rm'd on exit.
TMP_ENV=""
cleanup() { [ -n "$TMP_ENV" ] && rm -f "$TMP_ENV"; }
trap cleanup EXIT

make_tmp_env() {
  TMP_ENV="$(mktemp)"
  cat > "$TMP_ENV" <<'EOF'
# Throwaway placeholders for `compose config -q` validation ONLY. Not secrets.
POSTGRES_USER=validate
POSTGRES_PASSWORD=validate-placeholder
INTERNAL_SERVICE_KEY=0000000000000000000000000000000000000000000000000000000000000000
RECODER_GOVERNANCE_SIGNING_KEY=0000000000000000000000000000000000000000000000000000000000000000
BETTER_AUTH_SECRET=0000000000000000000000000000000000000000000000000000000000000000
EOF
}

# === 1. docker compose config -q ===========================================
info "validating compose file: $COMPOSE_FILE"
[ -f "$COMPOSE_FILE" ] || fail "compose file not found: $COMPOSE_FILE"
if [ "${#DC[@]}" -eq 0 ]; then
  skip "docker compose not installed — cannot run 'config -q'"
elif ! docker info >/dev/null 2>&1; then
  # `config -q` does not need a running daemon for parsing, but some compose
  # builds probe it. Try anyway; only treat a genuine config error as fatal.
  make_tmp_env
  if "${DC[@]}" --env-file "$TMP_ENV" -f "$COMPOSE_FILE" config -q 2>/tmp/compose-config.err; then
    pass "compose config -q valid (docker daemon not running, parse-only)"
  else
    sed 's/^/      /' /tmp/compose-config.err >&2 || true
    fail "compose config -q reported an error"
  fi
else
  make_tmp_env
  if "${DC[@]}" --env-file "$TMP_ENV" -f "$COMPOSE_FILE" config -q; then
    pass "compose config -q valid"
  else
    fail "compose config -q reported an error"
  fi
fi

# === 2. bash -n on every self-host script ==================================
info "syntax-checking shell scripts (bash -n)"
for s in "${SCRIPTS[@]}"; do
  [ -f "$s" ] || fail "expected script missing: $s"
  if bash -n "$s"; then
    pass "bash -n ${s#"$ROOT_DIR"/}"
  else
    fail "bash -n failed: ${s#"$ROOT_DIR"/}"
  fi
done

# === 3. YAML parse of the Envoy bootstraps =================================
info "parsing Envoy bootstraps as YAML"
if command -v python3 >/dev/null 2>&1 && python3 -c 'import yaml' >/dev/null 2>&1; then
  for y in "$ENVOY_XDS" "$ENVOY_STATIC"; do
    [ -f "$y" ] || fail "envoy config missing: $y"
    if python3 -c "import sys,yaml; yaml.safe_load(open(sys.argv[1]))" "$y"; then
      pass "yaml parse ${y#"$ROOT_DIR"/}"
    else
      fail "yaml parse failed: ${y#"$ROOT_DIR"/}"
    fi
  done
  # Truthfulness check: the static fallback path must carry the ext_authz filter
  # (the governance gate). Assert it is present so we never ship an ungoverned edge.
  for y in "$ENVOY_XDS" "$ENVOY_STATIC"; do
    if python3 -c "import sys,yaml; d=yaml.safe_load(open(sys.argv[1])); raw=open(sys.argv[1]).read(); sys.exit(0 if 'ext_authz' in raw and 'recoder_ext_authz' in raw else 1)" "$y"; then
      pass "ext_authz->governance wired in ${y#"$ROOT_DIR"/}"
    else
      fail "ext_authz/recoder_ext_authz NOT wired in ${y#"$ROOT_DIR"/} (ungoverned edge)"
    fi
  done
else
  skip "python3+PyYAML not available — Envoy YAML parse skipped (compose config still validated the compose YAML)"
fi

# === 4. packer validate (if installed) =====================================
info "validating Packer template (if packer is installed)"
if command -v packer >/dev/null 2>&1; then
  [ -f "$PACKER_FILE" ] || fail "packer template missing: $PACKER_FILE"
  # `packer validate` requires `packer init` first to install the amazon plugin.
  if packer init "$PACKER_FILE" >/dev/null 2>&1; then
    pass "packer init (plugins installed)"
  else
    skip "packer init could not fetch plugins (no network?) — validate may be partial"
  fi
  if packer validate "$PACKER_FILE"; then
    pass "packer validate"
  else
    fail "packer validate reported an error"
  fi
  # Advisory: formatting check (non-fatal).
  if packer fmt -check "$PACKER_FILE" >/dev/null 2>&1; then
    pass "packer fmt -check (formatted)"
  else
    skip "packer fmt -check: template not canonically formatted (advisory, non-fatal)"
  fi
else
  skip "packer not installed — 'packer validate' skipped (gated: needs a host with packer to build the AMI)"
fi

echo
info "self-host validation complete"
