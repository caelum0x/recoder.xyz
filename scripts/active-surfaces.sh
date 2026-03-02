#!/usr/bin/env bash

# Shared surface registry for root scripts.
# Source this file from shell scripts that need to iterate active platforms.

ACTIVE_SURFACES=(
  "app"
  "docker-backend"
  "recoder-web"
  "recoder-frontend"
  "apps/mobile"
  "apps/desktop"
  "recoder-studio"
  "recoder-pm"
  "recoder-agency"
  "packages/shared"
  "packages/cli"
)

LEGACY_SURFACES=(
  "production-engine"
  "recoder-chat"
  "recoder-chat-mobile"
  "recoder-desktop"
  "recoder-extension"
  "browser-extension"
)
