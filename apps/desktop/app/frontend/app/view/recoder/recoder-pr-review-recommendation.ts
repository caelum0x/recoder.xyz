export type PrReviewRecommendationEvent = "comment" | "approve" | "request_changes";

type RecommendationEvidence = {
    reportedReviewers: number;
    totalReviewers: number;
    findings: readonly {
        lifecycle: "new" | "persisting" | "fixed";
        severity: string;
        validation?: { verdict: "confirmed" | "rejected" | "uncertain" };
    }[];
    validator?: {
        status: "waiting" | "not_needed" | "running" | "reported" | "unavailable";
        intent?: { verdict: "aligned" | "partial" | "misaligned" | "unknown" };
        rules: readonly {
            level: "required" | "advisory";
            assessment?: { verdict: "pass" | "fail" | "unknown" };
        }[];
    };
};

export type PrReviewRecommendation = {
    event: PrReviewRecommendationEvent;
    reason: string;
};

/** Evidence-derived starting point only. The operator remains free to change it. */
export function recommendPrReviewEvent(evidence: RecommendationEvidence | undefined): PrReviewRecommendation {
    if (!evidence) return { event: "comment", reason: "Review evidence is not loaded." };

    const requiredFailure = evidence.validator?.rules.find((rule) =>
        rule.level === "required" && rule.assessment?.verdict === "fail");
    if (requiredFailure) {
        return { event: "request_changes", reason: "A required repository rule failed." };
    }
    if (evidence.validator?.intent?.verdict === "misaligned") {
        return { event: "request_changes", reason: "The independent validator found the change misaligned with its intent." };
    }
    const blockingFinding = evidence.findings.find((finding) =>
        finding.lifecycle !== "fixed" &&
        (finding.severity === "critical" || finding.severity === "high") &&
        finding.validation?.verdict !== "rejected");
    if (blockingFinding) {
        return { event: "request_changes", reason: "A current high-severity finding has not been rejected." };
    }

    const currentFindings = evidence.findings.filter((finding) => finding.lifecycle !== "fixed");
    const requiredRules = evidence.validator?.rules.filter((rule) => rule.level === "required") ?? [];
    const requiredRulesPass = requiredRules.every((rule) => rule.assessment?.verdict === "pass");
    const complete = evidence.totalReviewers > 0 && evidence.reportedReviewers === evidence.totalReviewers;
    if (
        complete &&
        evidence.validator?.status === "reported" &&
        evidence.validator.intent?.verdict === "aligned" &&
        currentFindings.length === 0 &&
        requiredRulesPass
    ) {
        return { event: "approve", reason: "The cohort is complete, intent is aligned, and every required rule passed." };
    }
    return { event: "comment", reason: "The evidence is informative but does not justify a stronger default." };
}
