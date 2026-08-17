// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// The CONSOLIDATED "Checks" rollup — one at-a-glance merge-readiness verdict per
// sibling, folded from the two already-probed views (readiness + mergeability) the
// compare panel renders in detail below it. It answers "can I merge this?" in one
// line before the reviewer expands the per-signal badges. PURE + degrade-truthful:
// no probe here, no I/O; a view that could not be judged yields a quiet
// "incomplete" rollup, never a fabricated "ready".

import type { ReadinessView, MergeabilityView } from "./recoder-board-logic";

// The rollup tone drives the ONE muted attention colour the design allows: a hard
// BLOCKED merge reads error/crimson; everything else stays quiet/graphite (a soft
// "discouraged" is quiet — it does not hard-block).
export type ChecksSummary = {
    // A short, reviewer-facing headline (e.g. "blocked — 2 to resolve").
    headline: string;
    tone: "ready" | "blocked" | "discouraged" | "quiet";
    // A longer breakdown for the tooltip (counts across the checks).
    detail: string;
};

function cleanList(v: unknown): string[] {
    return Array.isArray(v) ? v.filter((s): s is string => typeof s == "string" && s.trim() != "") : [];
}

// Fold readiness + mergeability into ONE rollup, or null when neither could be
// probed (the caller renders nothing rather than a fabricated status). Priority:
// merged (delivered) → blocked (hard) → discouraged (soft open work) → ready →
// incomplete (unknown/unprobed). The counts drive the headline and the tooltip.
export function summarizeChecks(
    readiness: ReadinessView | null | undefined,
    mergeability: MergeabilityView | null | undefined,
): ChecksSummary | null {
    if (readiness == null && mergeability == null) {
        return null;
    }
    const verdict = readiness?.verdict;
    const blockers = cleanList(readiness?.blockers);
    const advisories = cleanList(readiness?.advisories);
    const conflicts =
        mergeability != null && mergeability.available && mergeability.verdict == "conflicting"
            ? mergeability.conflicts?.length ?? 0
            : 0;
    // Readiness already folds merge conflicts into its blockers; fall back to the
    // mergeability conflict count only when readiness carried no blockers (e.g. the
    // readiness probe was absent but mergeability judged a conflict).
    const hardCount = blockers.length > 0 ? blockers.length : conflicts;
    const softCount = advisories.length;
    const detail = `${hardCount} blocker(s), ${softCount} to review`;

    if (verdict == "delivered") {
        return { headline: "merged", tone: "quiet", detail: "merged — nothing left to check" };
    }
    if (verdict == "blocked" || hardCount > 0) {
        return { headline: `blocked — ${hardCount} to resolve`, tone: "blocked", detail };
    }
    if (verdict == "not_ready" || softCount > 0) {
        const head = softCount > 0 ? `discouraged — ${softCount} to review` : "not ready";
        return { headline: head, tone: "discouraged", detail };
    }
    if (verdict == "ready") {
        return { headline: "ready to merge", tone: "ready", detail };
    }
    // 'unknown' / 'terminal' / absent verdict — we could not fully judge; say so.
    return { headline: "checks incomplete", tone: "quiet", detail };
}

// One row of the consolidated "Checks" table — a sibling's identity plus its rolled-up
// merge verdict and the itemized hard blockers / soft advisories behind it.
export type ChecksRow = {
    workspaceId: string;
    agent: string;
    branch: string;
    // null when neither readiness nor mergeability could be probed for this sibling.
    summary: ChecksSummary | null;
    blockers: string[];
    advisories: string[];
};

// The already-probed merge-decision views for one sibling (the readinessAtom entry shape).
type SiblingReadiness = { readiness?: ReadinessView | null; mergeability?: MergeabilityView | null };

// Build the dedicated Checks table: ONE consolidated row per sibling, folding each
// sibling's readiness + mergeability into a verdict + itemized blockers/advisories.
// PURE + degrade-truthful: a sibling with no probed views yields a null summary +
// empty lists (rendered as "—"), never a fabricated status.
export function buildChecksTable(
    siblings: readonly { workspaceId: string; agent: string; branch: string }[],
    readinessMap: Record<string, SiblingReadiness>,
): ChecksRow[] {
    return siblings.map((sibling) => {
        const entry = readinessMap[sibling.workspaceId];
        const readiness = entry?.readiness ?? null;
        const mergeability = entry?.mergeability ?? null;
        return {
            workspaceId: sibling.workspaceId,
            agent: sibling.agent,
            branch: sibling.branch,
            summary: summarizeChecks(readiness, mergeability),
            blockers: cleanList(readiness?.blockers),
            advisories: cleanList(readiness?.advisories),
        };
    });
}
