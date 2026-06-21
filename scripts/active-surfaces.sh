#!/usr/bin/env bash

# Shared surface registry for root scripts.
# Source this file from shell scripts that need to iterate active platforms.

ACTIVE_SURFACES=(
  "app"
  "docker-backend"
  "recoder-agents"
  "apps/mobile"
  "apps/desktop"
  "recoder-pm"
  "recoder-agency"
  "packages/shared"
  "packages/cli"
)

# Retired/removed surfaces — see docs/direction.md (2026-06-21):
# recoder-studio: abandoned, removed from tree.
# recoder-web: retired (bd recoder-26j7).
# openclaw: demoted to runtime-adapter source, not a deployed product.
LEGACY_SURFACES=(
  "production-engine"
  "recoder-chat"
  "recoder-chat-mobile"
  "recoder-desktop"
  "recoder-extension"
  "browser-extension"
  "recoder-web"
  "recoder-studio"
  "openclaw"
)
