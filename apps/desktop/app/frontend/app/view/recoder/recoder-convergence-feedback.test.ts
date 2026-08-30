import { describe, expect, it } from "vitest";
import {
    dispositionForConvergenceFlag,
    normalizeConvergenceFlag,
    parseConvergenceFeedbackProfile,
} from "./recoder-convergence-feedback";

describe("convergence feedback projection", () => {
    it("parses active decisions defensively and matches normalized exact flags", () => {
        const profile = parseConvergenceFeedbackProfile({
            durable: true,
            totalFlagFeedbackDecisions: 4,
            acceptedFlagRules: 1,
            dismissedFlagRules: 1,
            flagDispositions: [
                {
                    key: "a",
                    flag: "Review the picked file: src/pay.ts",
                    disposition: "accepted",
                    actorId: "user-1",
                    workspaceId: "ws-1",
                    updatedAt: "2026-08-30T20:00:00.000Z",
                },
                { key: "bad", flag: 42, disposition: "dismissed" },
            ],
        });
        expect(profile).toMatchObject({ durable: true, totalFlagFeedbackDecisions: 4 });
        expect(profile?.flagDispositions).toHaveLength(1);
        expect(dispositionForConvergenceFlag(profile, " review  the picked file: SRC/pay.ts ")).toBe("accepted");
        expect(dispositionForConvergenceFlag(profile, "different flag")).toBeNull();
    });

    it("does not turn malformed or absent profiles into fabricated decisions", () => {
        expect(parseConvergenceFeedbackProfile(null)).toBeNull();
        expect(parseConvergenceFeedbackProfile("bad")).toBeNull();
        expect(normalizeConvergenceFlag(" A   B ")).toBe("a b");
    });
});
