// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// The workspace PR-status chip's data seam: build the pr-status URL, fold the
// backend's degrade-truthful PrStatusView (GET /workspaces/:id/pr-status, read
// through the `gh` CLI server-side) into a small chip model, and gate the 6s
// board poll's fan-out. null always means "no chip" — gh absent, no worktree,
// no PR, or a failed probe — never a fabricated pull request.

import type { RecoderWorkspace } from "./recoder-board-logic";

type RecoderPrChipState = "draft" | "open" | "merged" | "closed";
type RecoderPrChecks = "passing" | "failing" | "pending" | "none";

type RecoderPrChip = {
    number: number;
    state: RecoderPrChipState;
    url: string;
    checks: RecoderPrChecks;
};

// What the gate remembers about a row's last probe: its control-plane revision
// key and when the probe ran.
type PrFetchMeta = { key: string; at: number };

// A PR's state/checks move on GitHub without the local workspace row changing,
// so an unchanged row is still re-asked — but only this often. Each probe is a
// real `gh` (GitHub API) call on the backend, so the 6s poll must never fan one
// out per tick.
const PrStatusRefreshMs = 60_000;

function workspacePrStatusUrl(baseUrl: string, workspaceId: string): string {
    return `${baseUrl}/api/conductor/workspaces/${encodeURIComponent(workspaceId)}/pr-status`;
}

// Fold the { data: PrStatusView } envelope into the chip model. Only a payload
// that truthfully says "gh was consulted AND a PR exists" yields a chip; the
// backend's `draft` flag folds into the state (an open draft reads "draft"), and
// anything unrecognized degrades (state → open, rollup → none) instead of breaking.
function parsePrStatusEnvelope(body: unknown): RecoderPrChip {
    if (body == null || typeof body != "object") return null;
    const data = (body as { data?: unknown }).data;
    if (data == null || typeof data != "object") return null;
    const d = data as Record<string, unknown>;
    if (d.available != true || d.hasPr != true) return null;
    if (typeof d.number != "number") return null;
    const rawState: RecoderPrChipState = d.state == "merged" ? "merged" : d.state == "closed" ? "closed" : "open";
    const state: RecoderPrChipState = rawState == "open" && d.draft == true ? "draft" : rawState;
    const checksObj = d.checks != null && typeof d.checks == "object" ? (d.checks as Record<string, unknown>) : null;
    const rollup = checksObj?.rollup;
    const checks: RecoderPrChecks =
        rollup == "passing" ? "passing" : rollup == "failing" ? "failing" : rollup == "pending" ? "pending" : "none";
    return { number: d.number, state, url: typeof d.url == "string" ? d.url : "", checks };
}

// The full truthful pr-status view — what the chip is derived FROM. Unlike the
// chip (a PR that truthfully exists, else null), this preserves the degrade
// reason so the Review surface can DISABLE "Create PR" with the real cause (no
// gh / no pushable remote) instead of silently hiding the action.
type RecoderPrStatus = {
    available: boolean;
    hasPr: boolean;
    reason: string;
    // Non-null only when gh was consulted AND a parseable PR exists.
    chip: RecoderPrChip;
};

// Fold the { data: PrStatusView } envelope into the full view. null means the
// body wasn't a usable envelope at all (never a fabricated status); a benign
// available:false / hasPr:false lands as a truthful view carrying its reason.
function parsePrStatusView(body: unknown): RecoderPrStatus {
    if (body == null || typeof body != "object") return null;
    const data = (body as { data?: unknown }).data;
    if (data == null || typeof data != "object") return null;
    const d = data as Record<string, unknown>;
    return {
        available: d.available == true,
        hasPr: d.hasPr == true,
        reason: typeof d.reason == "string" ? d.reason : "",
        chip: parsePrStatusEnvelope(body),
    };
}

async function fetchWorkspacePrStatusView(baseUrl: string, workspaceId: string): Promise<RecoderPrStatus> {
    if (workspaceId == "") return null;
    try {
        const res = await fetch(workspacePrStatusUrl(baseUrl, workspaceId));
        if (!res.ok) return null;
        const body = await res.json().catch(() => null);
        return parsePrStatusView(body);
    } catch {
        return null;
    }
}

// The board's chip-only seam, now derived from the full view so both surfaces
// share one fetch/parse path.
async function fetchWorkspacePrStatus(baseUrl: string, workspaceId: string): Promise<RecoderPrChip> {
    const view = await fetchWorkspacePrStatusView(baseUrl, workspaceId);
    return view?.chip ?? null;
}

// Can this workspace open a NEW pull request right now, and if not, the truthful
// reason to show on the disabled action. A PR needs gh on PATH and a pushable
// GitHub remote — exactly what pr-status already probes — so the gate is a pure
// read of that view, never a fabricated "ready".
type RecoderPrCreateGate = {
    canCreate: boolean;
    // Truthful reason the action is disabled; "" when it's enabled.
    reason: string;
};

function prCreateGate(status: RecoderPrStatus): RecoderPrCreateGate {
    // Undetermined (not probed yet / pr-status unreachable): don't assert the
    // action is impossible — leave it enabled and let the create call surface any
    // real failure itself.
    if (status == null) return { canCreate: true, reason: "" };
    // A PR already exists for the branch — the chip shows it; creating again would
    // just fail, so the action is disabled with that truth (never hidden).
    if (status.available && status.hasPr) {
        return { canCreate: false, reason: "A pull request already exists for this branch." };
    }
    // gh could not be consulted: no gh on PATH, no worktree/branch, or no pushable
    // GitHub remote. A PR can't be opened, so disable with gh's own truthful reason.
    if (!status.available) {
        return {
            canCreate: false,
            reason: status.reason || "A pushable GitHub remote is required to open a pull request.",
        };
    }
    // available && !hasPr → gh + remote present, the branch simply has no PR yet.
    return { canCreate: true, reason: "" };
}

// Same revision key the diff-summary gate uses: state + updatedAt.
function prStatusFetchKey(ws: RecoderWorkspace): string {
    return `${ws.state}|${ws.updatedAt ?? ""}`;
}

// First sight and an advanced revision always fetch; an unchanged row re-asks
// only once PrStatusRefreshMs has elapsed since its last probe.
function shouldRefetchPrStatus(ws: RecoderWorkspace, prev: PrFetchMeta, nowMs: number): boolean {
    if (prev == null) return true;
    if (prev.key != prStatusFetchKey(ws)) return true;
    return nowMs - prev.at >= PrStatusRefreshMs;
}

function prChipLabel(chip: RecoderPrChip): string {
    const base = `PR #${chip.number} ${chip.state}`;
    return chip.checks == "none" ? base : `${base} · checks ${chip.checks}`;
}

// Graphite-only tones: an open PR is the live/actionable state (the one accent);
// draft and merged are settled/neutral (the label carries the full truth); only a
// truly closed PR earns the single muted crimson. No decorative emerald/purple.
const PrChipTones: Record<RecoderPrChipState, string> = {
    open: "border-accent/50 bg-accent/20 text-accent",
    draft: "border-white/15 bg-white/[0.06] text-secondary",
    merged: "border-border bg-white/[0.04] text-secondary",
    closed: "border-error/40 bg-error/15 text-error",
};

// Failing checks are the actionable failure regardless of PR state, so they take
// the crimson closed/alert tone; the label still carries the full truth.
function prChipTone(chip: RecoderPrChip): string {
    return chip.checks == "failing" ? PrChipTones.closed : PrChipTones[chip.state];
}

export {
    fetchWorkspacePrStatus,
    fetchWorkspacePrStatusView,
    parsePrStatusEnvelope,
    parsePrStatusView,
    prChipLabel,
    prChipTone,
    prCreateGate,
    prStatusFetchKey,
    shouldRefetchPrStatus,
    workspacePrStatusUrl,
    PrStatusRefreshMs,
    type PrFetchMeta,
    type RecoderPrChip,
    type RecoderPrCreateGate,
    type RecoderPrStatus,
};
