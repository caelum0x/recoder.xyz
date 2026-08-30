import { describe, expect, it } from "vitest";
import { recommendPrReviewEvent } from "./recoder-pr-review-recommendation";

const clearEvidence = {
    reportedReviewers: 2,
    totalReviewers: 2,
    findings: [],
    validator: {
        status: "reported" as const,
        intent: { verdict: "aligned" as const },
        rules: [{ level: "required" as const, assessment: { verdict: "pass" as const } }],
    },
};

describe("PR review recommendation", () => {
    it("requests changes when a required named-check rule fails", () => {
        expect(recommendPrReviewEvent({
            ...clearEvidence,
            validator: {
                ...clearEvidence.validator,
                rules: [{ level: "required", assessment: { verdict: "fail" } }],
            },
        })).toMatchObject({ event: "request_changes" });
    });

    it("approves only complete aligned evidence with passing required rules", () => {
        expect(recommendPrReviewEvent(clearEvidence)).toMatchObject({ event: "approve" });
        expect(recommendPrReviewEvent({
            ...clearEvidence,
            validator: {
                ...clearEvidence.validator,
                rules: [{ level: "required", assessment: { verdict: "unknown" } }],
            },
        })).toMatchObject({ event: "comment" });
    });
});
