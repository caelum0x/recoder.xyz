#!/usr/bin/env bash
set -euo pipefail

# Preflight check for local iOS verification prerequisites.
# Exit codes:
# 0 = ready
# 2 = missing required command/tooling
# 3 = missing iOS simulator SDK/runtime/device

if ! command -v xcodegen >/dev/null 2>&1; then
  echo "PRECHECK_FAIL: xcodegen not found."
  echo "Fix: brew install xcodegen"
  exit 2
fi

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "PRECHECK_FAIL: xcodebuild not found (Xcode CLI tools required)."
  echo "Fix: install Xcode and run 'xcode-select --install' if needed."
  exit 2
fi

if ! xcodebuild -showsdks 2>/dev/null | grep -q "iphonesimulator"; then
  echo "PRECHECK_FAIL: iOS Simulator SDK/runtime is not installed."
  echo "Fix: Xcode -> Settings -> Components -> install latest iOS platform/simulator runtime."
  exit 3
fi

if ! xcrun simctl list runtimes available 2>/dev/null | grep -qE "iOS .*\\(available\\)"; then
  echo "PRECHECK_FAIL: no available iOS Simulator runtime found."
  echo "Fix: Xcode -> Settings -> Components -> install at least one iOS runtime."
  exit 3
fi

if ! xcrun simctl list devices available 2>/dev/null | grep -q "iPhone"; then
  echo "PRECHECK_FAIL: no available iPhone simulator device found."
  echo "Fix: Xcode -> Window -> Devices and Simulators -> create an iPhone simulator."
  exit 3
fi

echo "PRECHECK_OK: iOS simulator runtime and device are available."
