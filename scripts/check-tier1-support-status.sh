#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_FILE="${TARGET_FILE:-$REPO_ROOT/SUPPORTED_CONNECTORS.md}"
PHASE3_ARTIFACT="${PHASE3_ARTIFACT:-}"
RELEASE_ARTIFACT="${RELEASE_ARTIFACT:-}"
MAX_AGE_HOURS="${MAX_AGE_HOURS:-48}"

if ! [[ "$MAX_AGE_HOURS" =~ ^[0-9]+$ ]]; then
  echo "Invalid MAX_AGE_HOURS='$MAX_AGE_HOURS' (expected non-negative integer)." >&2
  exit 1
fi

resolve_latest_artifact() {
  local explicit="$1"
  local dir="$2"
  if [[ -n "$explicit" ]]; then
    echo "$explicit"
    return
  fi
  ls -1t "$dir"/*-connectors-support.json 2>/dev/null | head -n1 || true
}

artifact_path="$(resolve_latest_artifact "$PHASE3_ARTIFACT" "$REPO_ROOT/logs/phase3-gates")"
source_name="phase3-gates"
if [[ -z "$artifact_path" || ! -f "$artifact_path" ]]; then
  artifact_path="$(resolve_latest_artifact "$RELEASE_ARTIFACT" "$REPO_ROOT/logs/release-evidence")"
  source_name="release-evidence"
fi

if [[ -z "$artifact_path" || ! -f "$artifact_path" ]]; then
  echo "No connectors-support artifact found. Run phase3 gates/release evidence first." >&2
  exit 1
fi

if [[ ! -f "$TARGET_FILE" ]]; then
  echo "Target ledger not found: $TARGET_FILE" >&2
  exit 1
fi

parsed="$(node -e '
const fs = require("fs");

const target = process.argv[1];
const artifactPath = process.argv[2];
const maxAgeHours = Number(process.argv[3]);
const markerStart = "<!-- AUTO-PUBLISHED:TIER1-STATUS:START -->";
const markerEnd = "<!-- AUTO-PUBLISHED:TIER1-STATUS:END -->";

const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
const connectors = Array.isArray(artifact.connectors) ? artifact.connectors : [];
const wanted = ["codex", "claude"];

const artifactStatus = Object.fromEntries(
  wanted.map((id) => {
    const row = connectors.find((r) => String(r?.id || "") === id);
    return [id, String(row?.status || "")];
  }),
);

const content = fs.readFileSync(target, "utf8");
const s = content.indexOf(markerStart);
const e = content.indexOf(markerEnd);
if (s === -1 || e === -1 || e <= s) {
  console.log(["FAIL", "managed_block_missing"].join("|"));
  process.exit(0);
}

const block = content.slice(s, e + markerEnd.length);
const lines = block.split(/\r?\n/);
const generatedLine = lines.find((line) => line.startsWith("Generated at: ")) || "";
const generatedAt = generatedLine.replace(/^Generated at:\s*/, "").trim();
let freshness = "unknown";
if (generatedAt) {
  const ts = Date.parse(generatedAt);
  if (!Number.isNaN(ts)) {
    const ageHours = (Date.now() - ts) / 36e5;
    freshness = ageHours <= maxAgeHours ? "fresh" : "stale";
  } else {
    freshness = "invalid_timestamp";
  }
}

const ledgerStatus = {};
for (const id of wanted) {
  const line = lines.find((l) => l.startsWith(`| \`${id}\` |`)) || "";
  const cols = line.split("|").map((x) => x.trim()).filter(Boolean);
  // expected cols: [`id`, tier, status, reason]
  ledgerStatus[id] = cols[2] || "";
}

const mismatches = wanted.filter((id) => artifactStatus[id] !== ledgerStatus[id]);
const ok =
  freshness === "fresh" &&
  wanted.every((id) => artifactStatus[id] && ledgerStatus[id]) &&
  mismatches.length === 0;

console.log([
  ok ? "PASS" : "FAIL",
  freshness,
  generatedAt || "missing",
  artifactStatus.codex || "missing",
  ledgerStatus.codex || "missing",
  artifactStatus.claude || "missing",
  ledgerStatus.claude || "missing",
  mismatches.join(",") || "none",
].join("|"));
' "$TARGET_FILE" "$artifact_path" "$MAX_AGE_HOURS")"

IFS='|' read -r result freshness generated_at codex_artifact codex_ledger claude_artifact claude_ledger mismatches <<< "$parsed"

echo "== Tier-1 Support Status Check =="
echo "source: $source_name"
echo "artifact: $artifact_path"
echo "target: $TARGET_FILE"
echo "freshness: $freshness"
echo "generated_at: $generated_at"
echo "codex artifact=$codex_artifact ledger=$codex_ledger"
echo "claude artifact=$claude_artifact ledger=$claude_ledger"
echo "mismatches: $mismatches"

if [[ "$result" != "PASS" ]]; then
  echo "FAIL: Tier-1 support status ledger is stale or mismatched." >&2
  exit 1
fi

echo "PASS: Tier-1 support status ledger is fresh and synchronized."
