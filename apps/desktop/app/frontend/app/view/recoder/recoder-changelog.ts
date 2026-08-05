// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { WhatsNewEntry } from "./recoder-whats-new";

// The named-feature changelog shown by the in-app "what's new" surface, newest
// first. Keep entries short and user-facing (the named feature, not the commit).
// This is the living-product signal — add an entry when a release ships a feature
// a user would notice. The public changelog rhythm lives at CHANGELOG_URL.
const CHANGELOG_ENTRIES: readonly WhatsNewEntry[] = [
    {
        version: "0.16.1",
        title: "Faster, keyboard-first, and it tidies up after itself",
        notes: [
            "Drive the whole board from the keyboard — move, open, launch a task, and converge without the mouse (press ? for the shortcuts).",
            "See at a glance how much your agents diverged before you open a single diff.",
            "Once you merge a winner, clear the other agents from the board in one click.",
            "Land review decisions faster with a keyboard shortcut for the primary action.",
        ],
    },
    {
        version: "0.16.0",
        title: "Clearer, calmer, and it remembers",
        notes: [
            "Give one task to several agents at once, then merge the best result — the core loop is front and center.",
            "Converge agents you launched separately, not just ones started together.",
            "A calmer workspace: de-crowded cards, lifecycle columns, and a unified Session · Review detail.",
            "Agents now share what they learn across runs, and remember it.",
            "Sign in with GitHub, Google, or Apple.",
        ],
    },
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
