// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Auto-updates default ON in packaged builds (feed URL comes from the baked app-update.yml);
// RECODER_UPDATE_FEED=off|0 is the explicit opt-out for self-host/dev overrides.
export function updateFeedEnabled(env: NodeJS.ProcessEnv): boolean {
    const value = env.RECODER_UPDATE_FEED?.trim().toLowerCase();
    return value !== "off" && value !== "0";
}
