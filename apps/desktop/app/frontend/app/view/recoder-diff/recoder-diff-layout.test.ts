// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { reviewDetailsDefaultOpen, reviewPrimaryAction } from "./recoder-diff-layout";
import type { RecoderReviewSuggestion } from "./recoder-diff-model";

function suggest(action: RecoderReviewSuggestion["action"]): RecoderReviewSuggestion {
    return { action, label: `label:${action}` };
}

describe("reviewPrimaryAction", () => {
    it("promotes nothing when there is no selected workspace", () => {
        expect(
            reviewPrimaryAction({ hasSelection: false, suggestion: suggest("merge"), hasPr: true, canCreatePr: true })
        ).toBe("none");
    });

    it("promotes Create PR when the suggestion is create-pr and a PR can be opened", () => {
        expect(
            reviewPrimaryAction({ hasSelection: true, suggestion: suggest("create-pr"), hasPr: false, canCreatePr: true })
        ).toBe("create-pr");
    });

    it("does NOT promote Create PR when a PR already exists (the header would offer a stale action)", () => {
        expect(
            reviewPrimaryAction({ hasSelection: true, suggestion: suggest("create-pr"), hasPr: true, canCreatePr: true })
        ).toBe("merge");
    });

    it("does NOT promote Create PR when the repo cannot open one (no gh / no pushable remote)", () => {
        expect(
            reviewPrimaryAction({ hasSelection: true, suggestion: suggest("create-pr"), hasPr: false, canCreatePr: false })
        ).toBe("merge");
    });

    it("promotes Merge when the suggestion is merge", () => {
        expect(
            reviewPrimaryAction({ hasSelection: true, suggestion: suggest("merge"), hasPr: true, canCreatePr: false })
        ).toBe("merge");
    });

    it("stays quiet (no loud button) for every blocking suggestion", () => {
        for (const action of ["address-feedback", "resolve-conflicts", "wait"] as const) {
            expect(
                reviewPrimaryAction({ hasSelection: true, suggestion: suggest(action), hasPr: true, canCreatePr: false })
            ).toBe("none");
        }
    });

    it("falls back to Merge as the default primary when there is no suggestion", () => {
        expect(
            reviewPrimaryAction({ hasSelection: true, suggestion: null, hasPr: false, canCreatePr: false })
        ).toBe("merge");
    });
});

describe("reviewDetailsDefaultOpen", () => {
    it("stays collapsed with no suggestion (calm default — the diff leads)", () => {
        expect(reviewDetailsDefaultOpen(null)).toBe(false);
    });

    it("stays collapsed for the ready-to-merge and create-pr states", () => {
        expect(reviewDetailsDefaultOpen(suggest("merge"))).toBe(false);
        expect(reviewDetailsDefaultOpen(suggest("create-pr"))).toBe(false);
    });

    it("stays collapsed while checks are still running (wait is not a blocker)", () => {
        expect(reviewDetailsDefaultOpen(suggest("wait"))).toBe(false);
    });

    it("auto-opens on a real blocker so the failing rows are never hidden", () => {
        expect(reviewDetailsDefaultOpen(suggest("address-feedback"))).toBe(true);
        expect(reviewDetailsDefaultOpen(suggest("resolve-conflicts"))).toBe(true);
    });
});
