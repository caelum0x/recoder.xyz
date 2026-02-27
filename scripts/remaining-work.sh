#!/usr/bin/env bash
set -euo pipefail

cat <<'TXT'
Recoder Remaining Work (Budget-Constrained Mode)

P0: Credential Rotation (manual)
- Follow: docs/CREDENTIAL_ROTATION_RUNBOOK.md
- Verify: bash scripts/post-rotation-verify.sh
- Optional alert proof: RUN_ALERT_TEST_FIRE=true bash scripts/post-rotation-verify.sh

P2: Native/Desktop/Mobile closeout
- Desktop verify: bash scripts/verify-desktop-release.sh [tag]
- Mobile verify: bash scripts/verify-mobile-release.sh [ref]
- Combined: bash scripts/verify-native-release-closeout.sh [desktop_tag] [mobile_ref]

iOS-specific mode (active)
- Local verification gate: bash scripts/verify-openclaw-ios-local.sh
- GitHub iOS workflow: manual-only + disabled (budget constrained)

Manual/External dependencies
- Apple Developer cert for Desktop + macOS notarization
- Play Store keystore + keystore.properties for Android signing
- App Store Connect API key for iOS Fastlane
- EXPO_TOKEN secret for mobile EAS builds
- GitHub Actions billing/spending limit restoration (optional for cloud CI)

Canonical docs
- plan.md
- ECOSYSTEM_PRODUCTION_BLUEPRINT.md
TXT
