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

async function fetchWorkspacePrStatus(baseUrl: string, workspaceId: string): Promise<RecoderPrChip> {
    if (workspaceId == "") return null;
    try {
        const res = await fetch(workspacePrStatusUrl(baseUrl, workspaceId));
        if (!res.ok) return null;
        const body = await res.json().catch(() => null);
        return parsePrStatusEnvelope(body);
    } catch {
        return null;
    }
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

const PrChipTones: Record<RecoderPrChipState, string> = {
    open: "border-emerald-400/40 bg-emerald-400/15 text-emerald-300",
    draft: "border-white/15 bg-white/[0.06] text-secondary",
    merged: "border-purple-400/40 bg-purple-400/15 text-purple-300",
    closed: "border-red-400/40 bg-red-400/15 text-red-300",
};

// Failing checks are the actionable signal regardless of PR state, so they take
// the alert tone; the label still carries the full truth.
function prChipTone(chip: RecoderPrChip): string {
    return chip.checks == "failing" ? PrChipTones.closed : PrChipTones[chip.state];
}

export {
    fetchWorkspacePrStatus,
    parsePrStatusEnvelope,
    prChipLabel,
    prChipTone,
    prStatusFetchKey,
    shouldRefetchPrStatus,
    workspacePrStatusUrl,
    PrStatusRefreshMs,
    type PrFetchMeta,
    type RecoderPrChip,
};
