import { describe, expect, it } from "vitest";
import { buildPrReviewControlBody, type PrReviewLaunchProfile } from "./recoder-pr-review-control";

const pinned: PrReviewLaunchProfile = {
    repoPath: "/repos/pinned",
    spaceId: "default",
    projectId: "pinned",
    runtimeId: "codex",
};
const selected: PrReviewLaunchProfile = {
    repoPath: "/repos/elsewhere",
    spaceId: "default",
    projectId: "elsewhere",
    runtimeId: "claude_code",
};

describe("PR review watcher control contract", () => {
    it("does not repin a standing watcher on scan or pause", () => {
        for (const action of ["scan", "pause"] as const) {
            expect(buildPrReviewControlBody({
                action,
                includeDrafts: false,
                pinnedProfile: pinned,
                selectedProfile: selected,
                reviewerRuntimeIds: ["claude_code"],
            })).toEqual({ action });
        }
    });

    it("changes only the draft option when configuring a standing watcher", () => {
        expect(buildPrReviewControlBody({
            action: "configure",
            includeDrafts: true,
            pinnedProfile: pinned,
            selectedProfile: selected,
            reviewerRuntimeIds: ["claude_code"],
        })).toEqual({ action: "configure", includeDrafts: true });
    });

    it("repins target and cohort on explicit start", () => {
        expect(buildPrReviewControlBody({
            action: "start",
            includeDrafts: true,
            pinnedProfile: pinned,
            selectedProfile: selected,
            reviewerRuntimeIds: ["claude_code", "codex"],
        })).toEqual({
            action: "start",
            includeDrafts: true,
            profile: selected,
            reviewerRuntimeIds: ["claude_code", "codex"],
        });
    });

    it("pins the initial target when a first scan has no standing watcher", () => {
        expect(buildPrReviewControlBody({
            action: "scan",
            includeDrafts: false,
            pinnedProfile: null,
            selectedProfile: selected,
            reviewerRuntimeIds: ["claude_code"],
        })).toEqual({
            action: "scan",
            includeDrafts: false,
            profile: selected,
            reviewerRuntimeIds: ["claude_code"],
        });
    });
});
