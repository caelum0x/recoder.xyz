// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { getRecoderBackendUrl } from "../recoder/recoder-endpoints";
import { readErrorReason, readFetchError } from "../recoder/recoder-errors";
import { RecoderDiffView } from "./recoder-diff";

type RecoderWorkspace = {
    workspaceId: string;
    branch: string;
    state: string;
    runtimeId: string;
};

const WorkspaceIdMetaKey = "recoder:workspaceid";

// The clicked workspace is threaded in via the block's meta so Review opens the
// same workspace the hub launched from, not workspaces[0]. Absent → "" → the
// refresh() auto-select path takes over, so the seed is always harmless.
function readWorkspaceId(block: Block): string {
    const meta = (block?.meta ?? {}) as Record<string, unknown>;
    const raw = meta[WorkspaceIdMetaKey];
    return typeof raw === "string" ? raw.trim() : "";
}

// Shape of GET /api/conductor/workspaces/:id/diff → data (see conductor review.ts
// WorkspaceDiff). `patch` is a raw unified git diff; the view renders it line-by-line.
type RecoderWorkspaceDiff = {
    workspaceId: string;
    baseRef: string;
    branch: string;
    stat: string;
    patch: string;
    untracked: string[];
    changedFiles: number;
};

type RecoderCheckRow = {
    name: string;
    status: string;
    conclusion: string;
};

// Shape of GET /api/conductor/workspaces/:id/checks → data (see conductor
// pr-checks.service.ts WorkspaceChecksView). available:false is a NORMAL state
// (local-only repo, no PR yet, no gh) with a truthful reason, never an error.
type RecoderWorkspaceChecks = {
    available: boolean;
    reason?: string;
    mergeable?: string;
    reviewDecision?: string;
    checks?: RecoderCheckRow[];
};

// Coerce the checks payload into the view shape without ever trusting it.
// Anything that isn't the documented shape degrades to a truthful
// unavailable-with-reason, never a crash or a fabricated green.
function parseChecksData(data: unknown): RecoderWorkspaceChecks {
    if (data == null || typeof data != "object") {
        return { available: false, reason: "checks unavailable" };
    }
    const d = data as Record<string, unknown>;
    if (d.available !== true) {
        const reason = typeof d.reason == "string" && d.reason.trim() != "" ? d.reason : "checks unavailable";
        return { available: false, reason };
    }
    const rawChecks = Array.isArray(d.checks) ? d.checks : [];
    const checks: RecoderCheckRow[] = [];
    for (const entry of rawChecks) {
        if (entry == null || typeof entry != "object") {
            continue;
        }
        const e = entry as Record<string, unknown>;
        if (typeof e.name != "string" || e.name == "") {
            continue;
        }
        checks.push({
            name: e.name,
            status: typeof e.status == "string" ? e.status : "",
            conclusion: typeof e.conclusion == "string" ? e.conclusion : "",
        });
    }
    return {
        available: true,
        mergeable: typeof d.mergeable == "string" ? d.mergeable : "",
        reviewDecision: typeof d.reviewDecision == "string" ? d.reviewDecision : "",
        checks,
    };
}

class RecoderDiffViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;
    blockAtom: Atom<Block>;
    workspacesAtom: PrimitiveAtom<RecoderWorkspace[]>;
    selectedIdAtom: PrimitiveAtom<string>;
    diffAtom: PrimitiveAtom<RecoderWorkspaceDiff>;
    // False once a workspace-list fetch fails (backend down) → "not connected".
    connectedAtom: PrimitiveAtom<boolean>;
    loadingAtom: PrimitiveAtom<boolean>;
    diffLoadingAtom: PrimitiveAtom<boolean>;
    // Neutral, human diff status ("no diff", "diff endpoint not available", …).
    diffStatusAtom: PrimitiveAtom<string>;
    mergingAtom: PrimitiveAtom<boolean>;
    // Human result of the last merge action ("Merged.", approval reason, …).
    mergeStatusAtom: PrimitiveAtom<string>;
    prCreatingAtom: PrimitiveAtom<boolean>;
    // Human result of the last PR action ("PR created: <url>", approval reason, …).
    prStatusAtom: PrimitiveAtom<string>;
    checksAtom: PrimitiveAtom<RecoderWorkspaceChecks>;
    checksLoadingAtom: PrimitiveAtom<boolean>;
    // Which workspace checksAtom describes — lets the 6s refresh poll skip
    // re-probing gh (the checks edge shells out per call) unless the selection
    // actually changed.
    checksWorkspaceId: string;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder-diff";
        this.viewIcon = atom("code-compare");
        this.viewName = atom("Review");
        this.blockAtom = initOpts.waveEnv.wos.getWaveObjectAtom<Block>(`block:${initOpts.blockId}`);
        this.workspacesAtom = atom([]) as PrimitiveAtom<RecoderWorkspace[]>;
        this.selectedIdAtom = atom("") as PrimitiveAtom<string>;
        this.diffAtom = atom(null) as PrimitiveAtom<RecoderWorkspaceDiff>;
        this.connectedAtom = atom(true) as PrimitiveAtom<boolean>;
        this.loadingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.diffLoadingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.diffStatusAtom = atom("") as PrimitiveAtom<string>;
        this.mergingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.mergeStatusAtom = atom("") as PrimitiveAtom<string>;
        this.prCreatingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.prStatusAtom = atom("") as PrimitiveAtom<string>;
        this.checksAtom = atom(null) as PrimitiveAtom<RecoderWorkspaceChecks>;
        this.checksLoadingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.checksWorkspaceId = "";
    }

    get viewComponent(): ViewComponent {
        return RecoderDiffView;
    }

    // Fetch the workspace list, keep/auto-pick a selection, then load its diff.
    // Degrade-safe: a failed list fetch flips connectedAtom off (neutral "not
    // connected" state) and never throws.
    async refresh() {
        globalStore.set(this.loadingAtom, true);
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/conductor/workspaces`);
            const body = await res.json();
            // The conductor wraps the list as { data: { workspaces: [...] } };
            // tolerate a bare { data: [...] } too so an older embedded backend
            // still renders. Never assume a shape we didn't see.
            const data = body?.data;
            const list = Array.isArray(data?.workspaces) ? data.workspaces : Array.isArray(data) ? data : [];
            const workspaces = (list as RecoderWorkspace[]).filter((w) => w.state != "archived");
            globalStore.set(this.workspacesAtom, workspaces);
            globalStore.set(this.connectedAtom, true);
            const current = globalStore.get(this.selectedIdAtom);
            const stillValid = workspaces.some((w) => w.workspaceId === current);
            if (!stillValid) {
                // Prefer the workspace the hub clicked into (block meta) when it's
                // present in the live list, else auto-select the first one.
                const seed = readWorkspaceId(globalStore.get(this.blockAtom));
                const seeded = seed != "" && workspaces.some((w) => w.workspaceId === seed) ? seed : "";
                globalStore.set(this.selectedIdAtom, seeded || workspaces[0]?.workspaceId || "");
            }
        } catch {
            globalStore.set(this.connectedAtom, false);
            globalStore.set(this.workspacesAtom, []);
            globalStore.set(this.selectedIdAtom, "");
        } finally {
            globalStore.set(this.loadingAtom, false);
        }
        const selected = globalStore.get(this.selectedIdAtom);
        if (!selected) {
            globalStore.set(this.diffAtom, null);
            globalStore.set(this.diffStatusAtom, "");
            globalStore.set(this.checksAtom, null);
            this.checksWorkspaceId = "";
            return;
        }
        const checksStale = this.checksWorkspaceId != selected;
        await Promise.all([this.loadDiff(selected), checksStale ? this.fetchChecks(selected) : Promise.resolve()]);
    }

    async selectWorkspace(workspaceId: string) {
        globalStore.set(this.selectedIdAtom, workspaceId);
        if (!workspaceId) {
            globalStore.set(this.diffAtom, null);
            globalStore.set(this.diffStatusAtom, "");
            globalStore.set(this.checksAtom, null);
            this.checksWorkspaceId = "";
            return;
        }
        await Promise.all([this.loadDiff(workspaceId), this.fetchChecks(workspaceId)]);
    }

    // Degrade-safe: 404 → "no diff", other non-2xx → "diff unavailable", thrown
    // (backend unreachable) → "diff endpoint not available". Never a crash or a
    // fabricated diff.
    async loadDiff(workspaceId: string) {
        globalStore.set(this.diffLoadingAtom, true);
        globalStore.set(this.diffStatusAtom, "");
        try {
            const res = await fetch(
                `${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(workspaceId)}/diff`
            );
            if (!res.ok) {
                globalStore.set(this.diffAtom, null);
                if (res.status == 404) {
                    globalStore.set(this.diffStatusAtom, "no diff");
                    return;
                }
                const detail = await readFetchError(res);
                globalStore.set(this.diffStatusAtom, detail || `Diff unavailable (${res.status})`);
                return;
            }
            const body = await res.json();
            const data = body?.data;
            const valid = data != null && typeof data == "object";
            globalStore.set(this.diffAtom, valid ? (data as RecoderWorkspaceDiff) : null);
            if (!valid) {
                globalStore.set(this.diffStatusAtom, "no diff");
            }
        } catch {
            globalStore.set(this.diffAtom, null);
            globalStore.set(this.diffStatusAtom, "diff endpoint not available");
        } finally {
            globalStore.set(this.diffLoadingAtom, false);
        }
    }

    // PR checks / merge-readiness for the selected workspace. Unavailability is
    // a NORMAL state here (local-only repo, no PR, no gh) — every failure path
    // lands on available:false with a truthful reason, never a thrown error.
    async fetchChecks(workspaceId: string) {
        this.checksWorkspaceId = workspaceId;
        globalStore.set(this.checksAtom, null);
        globalStore.set(this.checksLoadingAtom, true);
        // A newer fetch supersedes this one by overwriting checksWorkspaceId;
        // stale resolvers must not write atoms the newer call now owns.
        const current = () => this.checksWorkspaceId == workspaceId;
        try {
            const res = await fetch(
                `${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(workspaceId)}/checks`
            );
            if (!current()) {
                return;
            }
            if (!res.ok) {
                if (res.status == 404) {
                    globalStore.set(this.checksAtom, { available: false, reason: "checks endpoint not available" });
                    return;
                }
                const detail = await readFetchError(res);
                if (!current()) {
                    return;
                }
                // transient server failure: drop the poll-skip latch so the
                // next refresh retries instead of sticking on the error
                this.checksWorkspaceId = "";
                globalStore.set(this.checksAtom, {
                    available: false,
                    reason: detail || `checks unavailable (${res.status})`,
                });
                return;
            }
            const body = await res.json();
            if (!current()) {
                return;
            }
            globalStore.set(this.checksAtom, parseChecksData(body?.data));
        } catch {
            if (!current()) {
                return;
            }
            this.checksWorkspaceId = "";
            globalStore.set(this.checksAtom, { available: false, reason: "checks endpoint not available" });
        } finally {
            if (current() || this.checksWorkspaceId == "") {
                globalStore.set(this.checksLoadingAtom, false);
            }
        }
    }

    // Merge the selected workspace — the "review → merge" close. Degrade-safe:
    // 403 (blocked / needs approval) and 503 (failed / illegal transition) each
    // surface the backend's truthful reason; other non-2xx → truthful failure;
    // success → "Merged." then refresh. In a solo desktop the merge click IS the
    // approval (server-side). Never fabricates.
    async mergeSelected() {
        const workspaceId = globalStore.get(this.selectedIdAtom);
        if (!workspaceId) {
            return;
        }
        globalStore.set(this.mergingAtom, true);
        globalStore.set(this.mergeStatusAtom, "");
        try {
            const res = await fetch(
                `${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(workspaceId)}/merge`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({}),
                }
            );
            const body = await res.json().catch(() => null);
            if (res.ok) {
                globalStore.set(this.mergeStatusAtom, "Merged.");
                await this.refresh();
                return;
            }
            const reason = readErrorReason(body);
            if (res.status == 403) {
                globalStore.set(this.mergeStatusAtom, reason || "Merge blocked — needs approval.");
                return;
            }
            if (res.status == 503) {
                globalStore.set(this.mergeStatusAtom, `Merge could not complete — ${reason || "operation failed"}.`);
                return;
            }
            globalStore.set(this.mergeStatusAtom, reason || `Merge failed (${res.status}).`);
        } catch {
            globalStore.set(this.mergeStatusAtom, "Merge unavailable — Recoder isn’t reachable.");
        } finally {
            globalStore.set(this.mergingAtom, false);
        }
    }

    // Open a PR for the selected workspace branch. Degrade-safe: 403 (blocked /
    // needs approval) and 503 (failed) each surface the backend's truthful reason;
    // other non-2xx → truthful failure; success → "PR created: <url>" (or "PR
    // created." when the backend returns no url). Never fabricates a PR.
    async createPr() {
        const workspaceId = globalStore.get(this.selectedIdAtom);
        if (!workspaceId) {
            return;
        }
        // The PR route requires a non-empty title; derive it from the workspace's
        // branch (falling back to its id) so the call never 400s on a missing title.
        const ws = globalStore.get(this.workspacesAtom).find((w) => w.workspaceId == workspaceId);
        const title = (ws?.branch || workspaceId).trim();
        globalStore.set(this.prCreatingAtom, true);
        globalStore.set(this.prStatusAtom, "");
        try {
            const res = await fetch(
                `${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(workspaceId)}/pr`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ title }),
                }
            );
            const body = await res.json().catch(() => null);
            if (res.ok) {
                const url = body?.data && typeof body.data.url == "string" ? body.data.url : "";
                globalStore.set(this.prStatusAtom, url ? `PR created: ${url}` : "PR created.");
                await this.refresh();
                return;
            }
            const reason = readErrorReason(body);
            if (res.status == 403) {
                globalStore.set(this.prStatusAtom, reason || "PR blocked — needs approval.");
                return;
            }
            if (res.status == 503) {
                globalStore.set(this.prStatusAtom, `PR could not complete — ${reason || "operation failed"}.`);
                return;
            }
            globalStore.set(this.prStatusAtom, reason || `PR failed (${res.status}).`);
        } catch {
            globalStore.set(this.prStatusAtom, "PR unavailable — Recoder isn’t reachable.");
        } finally {
            globalStore.set(this.prCreatingAtom, false);
        }
    }
}

export {
    parseChecksData,
    RecoderDiffViewModel,
    type RecoderCheckRow,
    type RecoderWorkspace,
    type RecoderWorkspaceChecks,
    type RecoderWorkspaceDiff,
};
