// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export type ConvergenceFlagDispositionValue = "accepted" | "dismissed";
export type RequiredRuleTrustMode = "off" | "warn" | "block";

export type ConvergenceFlagDisposition = {
    key: string;
    flag: string;
    disposition: ConvergenceFlagDispositionValue;
    actorId: string;
    workspaceId: string;
    updatedAt: string;
};

export type ConvergenceFeedbackProfile = {
    durable: boolean;
    totalFlagFeedbackDecisions: number;
    acceptedFlagRules: number;
    dismissedFlagRules: number;
    flagDispositions: ConvergenceFlagDisposition[];
    requiredRulePolicy: {
        mode: RequiredRuleTrustMode;
        actorId?: string;
        updatedAt?: string;
    };
};

function record(value: unknown): Record<string, unknown> | null {
    return value != null && typeof value == "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

function count(value: unknown): number {
    return typeof value == "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function normalizeConvergenceFlag(flag: string): string {
    return flag.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function parseConvergenceFeedbackProfile(value: unknown): ConvergenceFeedbackProfile | null {
    const row = record(value);
    if (!row) return null;
    const policy = record(row.requiredRulePolicy);
    const flagDispositions = (Array.isArray(row.flagDispositions) ? row.flagDispositions : []).flatMap((value) => {
        const item = record(value);
        const disposition = item?.disposition;
        if (
            !item ||
            typeof item.key != "string" ||
            typeof item.flag != "string" ||
            typeof item.actorId != "string" ||
            typeof item.workspaceId != "string" ||
            typeof item.updatedAt != "string" ||
            (disposition != "accepted" && disposition != "dismissed")
        ) {
            return [];
        }
        const parsedDisposition = disposition as ConvergenceFlagDispositionValue;
        return [{
            key: item.key,
            flag: item.flag,
            disposition: parsedDisposition,
            actorId: item.actorId,
            workspaceId: item.workspaceId,
            updatedAt: item.updatedAt,
        } satisfies ConvergenceFlagDisposition];
    });
    return {
        durable: row.durable === true,
        totalFlagFeedbackDecisions: count(row.totalFlagFeedbackDecisions),
        acceptedFlagRules: count(row.acceptedFlagRules),
        dismissedFlagRules: count(row.dismissedFlagRules),
        flagDispositions,
        requiredRulePolicy: {
            mode:
                policy?.mode == "warn" || policy?.mode == "block"
                    ? (policy.mode as RequiredRuleTrustMode)
                    : "off",
            ...(typeof policy?.actorId == "string"
                ? { actorId: policy.actorId }
                : {}),
            ...(typeof policy?.updatedAt == "string"
                ? { updatedAt: policy.updatedAt }
                : {}),
        },
    };
}

export function dispositionForConvergenceFlag(
    profile: ConvergenceFeedbackProfile | null,
    flag: string,
): ConvergenceFlagDispositionValue | null {
    const normalized = normalizeConvergenceFlag(flag);
    return profile?.flagDispositions.find((item) => normalizeConvergenceFlag(item.flag) == normalized)?.disposition ?? null;
}
