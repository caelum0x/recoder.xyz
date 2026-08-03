// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { WhatsNewEntry } from "./recoder-whats-new";

// The named-feature changelog shown by the in-app "what's new" surface, newest
// first. Keep entries short and user-facing (the named feature, not the commit).
// This is the living-product signal — add an entry when a release ships a feature
// a user would notice. The public changelog rhythm lives at CHANGELOG_URL.
const CHANGELOG_ENTRIES: readonly WhatsNewEntry[] = [
    {
        version: "0.15.0",
        title: "Auto-update and a truthful changelog",
        notes: [
            "Auto-update is enabled — the app now keeps itself current.",
            "This in-app changelog now reflects what actually shipped.",
            "The recodergit engine is unbundled pending licensing review.",
            "Cleaned up website claims to match the shipped product.",
        ],
    },
    {
        version: "0.14.5",
        title: "Recoder Terminal",
        notes: [
            "Signed macOS arm64 desktop build.",
            "Run coding agents in parallel isolated git worktree workspaces.",
            "Compare and converge parallel runs side by side.",
            "Governed merge with an evidence trail.",
        ],
    },
];

/** Where the full public changelog lives (opened from the "what's new" card). */
const CHANGELOG_URL = "https://recoder.xyz/changelog";

export { CHANGELOG_ENTRIES, CHANGELOG_URL };
