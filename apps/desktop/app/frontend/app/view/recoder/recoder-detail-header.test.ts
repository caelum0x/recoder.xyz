// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
    detailSegments,
    detailRepoLabel,
    segmentTitle,
    shouldShowSwitcher,
    workspaceOptionLabel,
    type RecoderDetailFace,
    type RecoderDetailSegmentVM,
} from "./recoder-detail-header";

describe("detailRepoLabel", () => {
    it("renders a concrete project identity and hides blank/default values", () => {
        expect(detailRepoLabel("acme-api")).toBe("acme-api");
        expect(detailRepoLabel("  acme-api  ")).toBe("acme-api");
        expect(detailRepoLabel("default")).toBeNull();
        expect(detailRepoLabel("   ")).toBeNull();
        expect(detailRepoLabel()).toBeNull();
    });
});

function byId(segments: RecoderDetailSegmentVM[], id: string): RecoderDetailSegmentVM {
    const seg = segments.find((s) => s.id == id);
    if (seg == null) {
        throw new Error(`no segment ${id}`);
    }
    return seg;
}

describe("detailSegments", () => {
    it("always renders the three faces in a stable order", () => {
        const segments = detailSegments("session", true, true);
        expect(segments.map((s) => s.id)).toEqual(["session", "review", "terminal"]);
        expect(segments.map((s) => s.label)).toEqual(["Session", "Review", "Terminal"]);
    });

    it("marks the current face active and never navigable to itself", () => {
        for (const current of ["session", "review"] as const) {
            const segments = detailSegments(current, true, true);
            const active = byId(segments, current);
            expect(active.active).toBe(true);
            // The active face is not a navigation target — you are already here.
            expect(active.enabled).toBe(false);
        }
    });

    it("navigates to the OTHER face when a real workspace is bound", () => {
        const fromSession = detailSegments("session", true, false);
        expect(byId(fromSession, "review").active).toBe(false);
        expect(byId(fromSession, "review").enabled).toBe(true);

        const fromReview = detailSegments("review", true, false);
        expect(byId(fromReview, "session").active).toBe(false);
        expect(byId(fromReview, "session").enabled).toBe(true);
    });

    it("never fabricates a workspace: with no workspace, cross-nav is disabled", () => {
        const segments = detailSegments("session", false, true);
        expect(byId(segments, "review").enabled).toBe(false);
        // Even a resolvable terminal cannot open without a bound workspace.
        expect(byId(segments, "terminal").enabled).toBe(false);
    });

    it("enables the raw Terminal only when the caller can resolve a tmux session", () => {
        expect(byId(detailSegments("review", true, true), "terminal").enabled).toBe(true);
        expect(byId(detailSegments("review", true, false), "terminal").enabled).toBe(false);
    });

    it("keeps the raw Terminal out of the active set (it is an escape hatch, not a face)", () => {
        for (const current of ["session", "review"] as const) {
            expect(byId(detailSegments(current, true, true), "terminal").active).toBe(false);
        }
    });
});

describe("workspaceOptionLabel", () => {
    it("reads branch · state so both faces render an identical switcher label", () => {
        expect(workspaceOptionLabel("feat/x", "running")).toBe("feat/x · running");
    });

    it("drops the separator when state is blank", () => {
        expect(workspaceOptionLabel("feat/x", "")).toBe("feat/x");
        expect(workspaceOptionLabel("feat/x", "   ")).toBe("feat/x");
    });

    it("falls back to a placeholder branch rather than an empty label", () => {
        expect(workspaceOptionLabel("", "running")).toBe("(workspace) · running");
    });
});

describe("shouldShowSwitcher", () => {
    it("shows for one or more workspaces so the frame is identical across faces", () => {
        expect(shouldShowSwitcher([{ id: "a", label: "a" }])).toBe(true);
        expect(shouldShowSwitcher([{ id: "a", label: "a" }, { id: "b", label: "b" }])).toBe(true);
    });

    it("hides when there is nothing to switch to", () => {
        expect(shouldShowSwitcher([])).toBe(false);
    });
});

describe("segmentTitle", () => {
    function seg(id: RecoderDetailSegmentVM["id"], active: boolean, enabled: boolean): RecoderDetailSegmentVM {
        const label = id.charAt(0).toUpperCase() + id.slice(1);
        return { id, label, active, enabled };
    }

    it("names the current view for the active segment", () => {
        expect(segmentTitle(seg("session", true, false))).toBe("Session — current view");
    });

    it("states a truthful missing-source reason for a disabled cross-nav", () => {
        expect(segmentTitle(seg("review", false, false))).toBe("No workspace bound yet");
    });

    it("states why the raw terminal is unavailable", () => {
        expect(segmentTitle(seg("terminal", false, false))).toBe(
            "Live terminal unavailable — no attached tmux session"
        );
    });

    it("describes the open action for an enabled segment", () => {
        expect(segmentTitle(seg("review", false, true))).toBe("Open Review for this workspace");
        expect(segmentTitle(seg("terminal", false, true))).toBe("Open the raw tmux terminal for this workspace");
    });
});
