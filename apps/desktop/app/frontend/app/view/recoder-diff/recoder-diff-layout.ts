// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Pure hierarchy decisions for the Review surface. The screen used to stack the
// checks strip, both PR/merge actions, the evidence panel and the diff all at
// equal weight, so nothing read as the star. These helpers pick the ONE header
// action and decide whether the secondary panels start tucked — so the diff can
// lead — WITHOUT ever removing a capability (the non-primary action stays
// reachable in the tucked details area) or hiding a real blocker.

import type { RecoderReviewSuggestion } from "./recoder-diff-model";

// The single loud action the Review header promotes for the current state.
// "none" means the state is blocked (waiting / changes-requested / conflicts):
// the header stays quiet and the narration line states the lever instead of
// promising a button that can't finish the review.
type ReviewPrimaryAction = "create-pr" | "merge" | "none";

// Precedence follows the checks-driven suggestion, then falls back to Merge as
// the review→merge close so the header never looks unowned. Create-PR is only
// promoted when there is genuinely no PR yet AND the repo can open one; otherwise
// the header would offer an action it cannot take.
function reviewPrimaryAction(args: {
    hasSelection: boolean;
    suggestion: RecoderReviewSuggestion | null;
    hasPr: boolean;
    canCreatePr: boolean;
}): ReviewPrimaryAction {
    if (!args.hasSelection) {
        return "none";
    }
    const action = args.suggestion?.action ?? null;
    if (action == "create-pr" && !args.hasPr && args.canCreatePr) {
        return "create-pr";
    }
    if (action == "merge") {
        return "merge";
    }
    // A blocking suggestion (address-feedback / resolve-conflicts / wait) earns no
    // loud button — the narration line carries the lever, and Merge stays reachable
    // in the tucked details area for a reviewer who wants to force it.
    if (action == "address-feedback" || action == "resolve-conflicts" || action == "wait") {
        return "none";
    }
    // No suggestion at all (checks not loaded, or a benign local-only repo): Merge
    // is the default primary so the review→merge close is always one click away.
    return "merge";
}

// The tucked details disclosure (checks · evidence · secondary PR/merge actions)
// is collapsed by default so the diff is the star. A blocking condition is the
// one exception: a failing/conflicting/changes-requested state auto-opens it so
// the reviewer sees the failing check rows in context — a real blocker must never
// hide behind a collapsed panel (truthful degrade). "wait" (checks still running)
// is NOT a blocker, so it stays calmly collapsed.
function reviewDetailsDefaultOpen(suggestion: RecoderReviewSuggestion | null): boolean {
    if (suggestion == null) {
        return false;
    }
    return suggestion.action == "address-feedback" || suggestion.action == "resolve-conflicts";
}

export { reviewDetailsDefaultOpen, reviewPrimaryAction, type ReviewPrimaryAction };
