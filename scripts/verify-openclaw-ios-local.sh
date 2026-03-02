#!/usr/bin/env bash
set -euo pipefail

# Local verification for OpenClaw iOS build after deployment-target changes.
# Requires: xcodegen, xcodebuild

IOS_DIR="${IOS_DIR:-openclaw/apps/ios}"
SCHEME="${SCHEME:-OpenClaw}"
DESTINATION="${DESTINATION:-}"
PREFLIGHT_SCRIPT="${PREFLIGHT_SCRIPT:-scripts/check-ios-simulator-runtime.sh}"
ALLOW_SKIP_MISSING_IOS_RUNTIME="${ALLOW_SKIP_MISSING_IOS_RUNTIME:-${CI:-0}}"

echo "== OpenClaw iOS local verify =="
echo "dir: $IOS_DIR"
echo "scheme: $SCHEME"

set +e
"$PREFLIGHT_SCRIPT"
preflight_exit=$?
set -e
if [[ $preflight_exit -ne 0 ]]; then
  if [[ "$ALLOW_SKIP_MISSING_IOS_RUNTIME" == "1" || "$ALLOW_SKIP_MISSING_IOS_RUNTIME" == "true" ]]; then
    echo "SKIP: iOS preflight failed (exit=$preflight_exit), skipping local verify due to ALLOW_SKIP_MISSING_IOS_RUNTIME=$ALLOW_SKIP_MISSING_IOS_RUNTIME"
    exit 0
  fi
  echo "FAIL: iOS preflight failed (exit=$preflight_exit)."
  echo "Hint: set ALLOW_SKIP_MISSING_IOS_RUNTIME=1 for CI/non-mac runners."
  exit $preflight_exit
fi

if [[ -z "$DESTINATION" ]]; then
  # Avoid silent exits under `set -euo pipefail` when no iPhone simulators exist.
  sim_device="$(xcrun simctl list devices available 2>/dev/null \
    | grep -E "iPhone" \
    | head -n 1 \
    | sed -E 's/^[[:space:]]*([^()]+) .*/\1/' \
    | sed 's/[[:space:]]*$//' || true)"
  if [[ -n "$sim_device" ]]; then
    DESTINATION="platform=iOS Simulator,name=${sim_device}"
  else
    echo "WARN: no iOS simulator device found; using generic iOS Simulator destination." >&2
    DESTINATION="generic/platform=iOS Simulator"
  fi
fi

echo "destination: $DESTINATION"

echo "[1/3] Generate Xcode project"
(
  cd "$IOS_DIR"
  xcodegen generate
)

echo "[2/3] Build (unsigned simulator)"
(
  cd "$IOS_DIR"
  xcodebuild build \
    -project OpenClaw.xcodeproj \
    -scheme "$SCHEME" \
    -destination "$DESTINATION" \
    CODE_SIGN_IDENTITY="" \
    CODE_SIGNING_REQUIRED=NO
)

echo "[3/3] PASS: OpenClaw iOS verification completed"
