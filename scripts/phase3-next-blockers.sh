#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCORE_DIR="$REPO_ROOT/logs/phase3-gates"
scorecard=""
if [[ "${1:-}" == "--" ]]; then
  scorecard="${2:-}"
else
  scorecard="${1:-}"
fi

if [[ -z "$scorecard" ]]; then
  scorecard="$(ls -1t "$SCORE_DIR"/*-scorecard.json 2>/dev/null | head -n1 || true)"
fi

if [[ -z "$scorecard" || ! -f "$scorecard" ]]; then
  echo "No phase3 scorecard found. Run: pnpm run phase3:gates" >&2
  exit 1
fi

echo "Phase 3 blocker report"
echo "scorecard: $scorecard"

node -e '
const fs = require("fs");
const p = process.argv[1];
const j = JSON.parse(fs.readFileSync(p, "utf8"));
const blockers = Array.isArray(j.blockers) ? j.blockers : [];
const warnings = Array.isArray(j.warnings) ? j.warnings : [];
const subsystems = j.subsystems || {};
const skippedSubsystems = Object.entries(subsystems)
  .filter(([, status]) => String(status).toUpperCase() === "SKIP")
  .map(([name]) => name);
console.log(`overall: ${j.overall}`);
console.log(`ga_ready: ${Boolean(j.ga_ready)}`);
console.log(`mode: ${j.mode ?? "unknown"}`);
console.log(`dry_run: ${Boolean(j.dry_run)}`);
console.log(`blockers: ${blockers.length}`);
console.log(`warnings: ${warnings.length}`);
console.log("");
console.log("Blockers:");
if (!blockers.length) console.log("- none");
for (const b of blockers) console.log(`- ${b}`);
console.log("");
console.log("Recommended next actions:");
const has = (s) => blockers.some((b) => b.includes(s));
if (has("P3.1") || has("P3.2")) {
  console.log("1. Fill required production env vars in recoder-agency/.env.docker and recoder-pm/.env.docker (POLAR_* + RECODER_WEB_API_KEY). ");
}
if (has("P3.3")) {
  console.log("2. Fix apps/frontend typecheck errors, then rerun pnpm -C apps/frontend run typecheck.");
}
if (has("P3.4") || has("P3.5") || has("P3.6")) {
  console.log("3. Ensure network/DNS reachability for web.recoder.xyz, docker.recoder.xyz, recoder.xyz from runner host.");
}
if (has("P3.7")) {
  console.log("4. Set RECODER_A2A_SHARED_SECRET and rerun pnpm run a2a:smoke:codex-claude.");
}
if (!blockers.length && !Boolean(j.ga_ready)) {
  console.log("5. Run a strict production closeout (no skips, no dry-run) to achieve ga_ready=true.");
  if (Boolean(j.dry_run)) {
    console.log("   - Current run used DRY_RUN=true, so network smoke checks were not fully validated.");
  }
  if (skippedSubsystems.length) {
    console.log(`   - Skipped subsystems: ${skippedSubsystems.join(", ")}`);
  }
}
if (!blockers.length && Boolean(j.ga_ready)) {
  console.log("1. Run pnpm run phase3:assert-ga-ready");
  console.log("2. Run pnpm run phase3:evidence-pack");
}
' "$scorecard"

if grep -q "P3.1 ecosystem readiness gate\\|P3.2 production env gate" "$scorecard" 2>/dev/null || true; then
  :
fi

if node -e 'const fs=require("fs");const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const b=Array.isArray(j.blockers)?j.blockers:[];process.exit(b.some((x)=>x.includes("P3.1")||x.includes("P3.2"))?0:1);' "$scorecard"; then
  echo ""
  echo "Env diagnostics:"
  if pnpm -C "$REPO_ROOT" run check:prod-env-missing 2>/dev/null; then
    :
  else
    pnpm -C "$REPO_ROOT" run check:prod-env-missing || true
  fi
fi

if node -e 'const fs=require("fs");const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const b=Array.isArray(j.blockers)?j.blockers:[];process.exit(b.some((x)=>x.includes("P3.4")||x.includes("P3.5")||x.includes("P3.6"))?0:1);' "$scorecard"; then
  echo ""
  echo "Network diagnostics:"
  for u in "${RECODER_WEB_URL:-https://web.recoder.xyz}" "${BACKEND_URL:-https://docker.recoder.xyz}" "${BASE_URL:-https://recoder.xyz}"; do
    code="$(curl -s -o /tmp/phase3_net.out -w "%{http_code}" "$u" || true)"
    [[ -z "$code" ]] && code="000"
    echo "  - $u -> $code"
  done
fi

if node -e 'const fs=require("fs");const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const b=Array.isArray(j.blockers)?j.blockers:[];process.exit(b.some((x)=>x.includes("P3.7"))?0:1);' "$scorecard"; then
  echo ""
  echo "A2A diagnostics:"
  if [[ -n "${RECODER_A2A_SHARED_SECRET:-}" ]]; then
    echo "  - RECODER_A2A_SHARED_SECRET is set in current shell."
  else
    echo "  - RECODER_A2A_SHARED_SECRET is missing in current shell."
    echo "  - Suggested: export RECODER_A2A_SHARED_SECRET='<shared secret>'"
  fi
fi
