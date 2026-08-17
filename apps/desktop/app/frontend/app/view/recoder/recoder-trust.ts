// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// The CONVERGENCE TRUST read-model + presentation — the "should I trust this merge?"
// signal at the review→merge decision point. Fetches the server's pure fold over the
// sealed convergence evidence (GET /api/conductor/workspaces/:id/convergence-trust)
// and formats it for a calm, colour-free badge (graphite by default, ONE muted crimson
// only for a LOW-trust merge — per the design constraints). Degrade-safe: an unmerged
// / evidence-less workspace or any transport fault yields `null` — the badge simply
// does not render, never a fabricated score.

import { getRecoderBackendUrl } from "./recoder-endpoints";

// One weighted contributor to the score (server-computed), for the expandable breakdown.
export type TrustFactor = {
    label: string;
    impact: "positive" | "caution" | "negative";
    delta: number;
    detail: string;
};

// The folded trust view the server returns. Every field is projected defensively from
// the (untrusted) wire; a malformed payload degrades to null at the fetch boundary.
export type TrustView = {
    score: number;
    tier: "high" | "medium" | "low";
    factors: TrustFactor[];
    reviewFlags: string[];
    summary: string;
};

// The calm badge projection: a short label + the ONE tone the design allows for state
// (only a low-trust merge is toned crimson; high/medium stay graphite/quiet).
export type TrustBadge = {
    label: string;
    tone: "quiet" | "crimson";
    // True when there are review flags the reviewer should expand before merging.
    hasFlags: boolean;
};

function asString(v: unknown): string {
    return typeof v == "string" ? v : "";
}

function asNumber(v: unknown): number {
    return typeof v == "number" && Number.isFinite(v) ? v : 0;
}

function asTier(v: unknown): TrustView["tier"] {
    return v == "high" || v == "medium" || v == "low" ? (v as TrustView["tier"]) : "low";
}

// Project the (untrusted) trust wire into a TrustView, or null when the shape is not a
// recognizable trust object. Never throws.
export function projectTrust(raw: unknown): TrustView | null {
    if (raw == null || typeof raw != "object") {
        return null;
    }
    const r = raw as Record<string, unknown>;
    if (typeof r.tier != "string" || typeof r.score != "number") {
        return null;
    }
    const factors = Array.isArray(r.factors)
        ? r.factors
              .map((f): TrustFactor => {
                  const o = (f ?? {}) as Record<string, unknown>;
                  const impact: TrustFactor["impact"] =
                      o.impact == "positive" || o.impact == "negative" ? (o.impact as "positive" | "negative") : "caution";
                  return { label: asString(o.label), impact, delta: asNumber(o.delta), detail: asString(o.detail) };
              })
              .filter((f) => f.label != "")
        : [];
    const reviewFlags = Array.isArray(r.reviewFlags) ? r.reviewFlags.filter((x): x is string => typeof x == "string") : [];
    return { score: asNumber(r.score), tier: asTier(r.tier), factors, reviewFlags, summary: asString(r.summary) };
}

// PURE badge projection: the short label + the single allowed tone. Only a LOW tier is
// crimson (the one muted attention colour); high/medium read quiet/graphite.
export function formatTrustBadge(trust: TrustView): TrustBadge {
    const label = `Trust ${trust.score}/100 · ${trust.tier}`;
    return {
        label,
        tone: trust.tier == "low" ? "crimson" : "quiet",
        hasFlags: trust.reviewFlags.length > 0,
    };
}

// Fetch the convergence trust for a workspace. Read-only. A 404 (unmerged / no evidence)
// or any non-2xx / transport fault yields null — the badge does not render, never faked.
export async function fetchConvergenceTrust(workspaceId: string): Promise<TrustView | null> {
    const id = typeof workspaceId == "string" ? workspaceId.trim() : "";
    if (id == "") {
        return null;
    }
    try {
        const res = await fetch(`${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(id)}/convergence-trust`);
        if (!res.ok) {
            return null;
        }
        const body = await res.json().catch(() => null);
        return projectTrust((body as { data?: { trust?: unknown } } | null)?.data?.trust);
    } catch {
        return null;
    }
}
