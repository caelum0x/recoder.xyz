// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { WhatsNewEntry } from "./recoder-whats-new";

// The named-feature changelog shown by the in-app "what's new" surface, newest
// first. Keep entries short and user-facing (the named feature, not the commit).
// This is the living-product signal — add an entry when a release ships a feature
// a user would notice. The public changelog rhythm lives at CHANGELOG_URL.
const CHANGELOG_ENTRIES: readonly WhatsNewEntry[] = [
    {
        version: "1.1.0",
        title: "Review, run, and search — sharpened",
        notes: [
            "Review shows suggested next actions and keeps CI checks fresh (bounded re-poll + manual refresh).",
            "Comment on changed lines and send the batch straight to the agent.",
            "⌘K now finds workspaces by project, branch, task, or state.",
            "First-run onboarding detects your git identity, agent configs, gh, and shell.",
        ],
    },
    {
        version: "1.0.0",
        title: "Recoder Terminal",
        notes: [
            "Run coding agents in parallel isolated git worktrees, then review and merge.",
            "The Board turns a picked issue into a launched agent.",
        ],
    },
];

/** Where the full public changelog lives (opened from the "what's new" card). */
const CHANGELOG_URL = "https://recoder.xyz/changelog";

export { CHANGELOG_ENTRIES, CHANGELOG_URL };
