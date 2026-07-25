// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { getRecoderBackendUrl } from "../recoder/recoder-endpoints";
import { RecoderDiffView } from "./recoder-diff";

type RecoderWorkspace = {
    workspaceId: string;
    branch: string;
    state: string;
    runtimeId: string;
};

// Shape of GET /api/conductor/workspaces/:id/diff â data (see conductor review.ts
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

class RecoderDiffViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;
    workspacesAtom: PrimitiveAtom<RecoderWorkspace[]>;
    selectedIdAtom: PrimitiveAtom<string>;
    diffAtom: PrimitiveAtom<RecoderWorkspaceDiff>;
    // False once a workspace-list fetch fails (backend down) â "not connected".
    connectedAtom: PrimitiveAtom<boolean>;
    loadingAtom: PrimitiveAtom<boolean>;
    diffLoadingAtom: PrimitiveAtom<boolean>;
    // Neutral, human diff status ("no diff", "diff endpoint not available", â¦).
    diffStatusAtom: PrimitiveAtom<string>;
    mergingAtom: PrimitiveAtom<boolean>;
    // Human result of the last merge action ("Merged.", approval reason, â¦).
    mergeStatusAtom: PrimitiveAtom<string>;
    prCreatingAtom: PrimitiveAtom<boolean>;
    // Human result of the last PR action ("PR created: <url>", approval reason, â¦).
    prStatusAtom: PrimitiveAtom<string>;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder-diff";
        this.viewIcon = atom("code-compare");
        this.viewName = atom("Review");
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
            const list = body?.data ?? [];
            const workspaces = (Array.isArray(list) ? list : []) as RecoderWorkspace[];
            globalStore.set(this.workspacesAtom, workspaces);
            globalStore.set(this.connectedAtom, true);
            const current = globalStore.get(this.selectedIdAtom);
            const stillValid = workspaces.some((w) => w.workspaceId === current);
            if (!stillValid) {
                globalStore.set(this.selectedIdAtom, workspaces[0]?.workspaceId ?? "");
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
            return;
        }
        await this.loadDiff(selected);
    }

    async selectWorkspace(workspaceId: string) {
        globalStore.set(this.selectedIdAtom, workspaceId);
        if (!workspaceId) {
            globalStore.set(this.diffAtom, null);
            globalStore.set(this.diffStatusAtom, "");
            return;
        }
        await this.loadDiff(workspaceId);
    }

    // Degrade-safe: 404 â "no diff", other non-2xx â "diff unavailable", thrown
    // (backend unreachable) â "diff endpoint not available". Never a crash or a
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
                globalStore.set(this.diffStatusAtom, res.status == 404 ? "no diff" : `diff unavailable (${res.status})`);
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

    // Merge the selected workspace â the "review â merge" close. Degrade-safe:
    // 409 (delivery gate / awaiting approval) â the backend's truthful reason;
    // other non-2xx â truthful failure; success â "Merged." then refresh. In a
    // solo desktop the merge click IS the approval (server-side). Never fabricates.
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
            const reason = (body && typeof body.error == "string" && body.error) || "";
            if (res.status == 409) {
                globalStore.set(this.mergeStatusAtom, reason || "Merge needs approval.");
                return;
            }
            globalStore.set(this.mergeStatusAtom, reason || `Merge failed (${res.status}).`);
        } catch {
            globalStore.set(this.mergeStatusAtom, "Merge unavailable â Recoder isn’t reachable.");
        } finally {
            globalStore.set(this.mergingAtom, false);
        }
    }

    // Open a PR for the selected workspace branch. Degrade-safe: 409 (delivery
    // gate / awaiting approval) â the backend's truthful reason; other non-2xx â
    // truthful failure; success â "PR created: <url>" (or "PR created." when the
    // backend returns no url). Never fabricates a PR.
    async createPr() {
        const workspaceId = globalStore.get(this.selectedIdAtom);
        if (!workspaceId) {
            return;
        }
        globalStore.set(this.prCreatingAtom, true);
        globalStore.set(this.prStatusAtom, "");
        try {
            const res = await fetch(
                `${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(workspaceId)}/pr`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({}),
                }
            );
            const body = await res.json().catch(() => null);
            if (res.ok) {
                const url = body?.data && typeof body.data.url == "string" ? body.data.url : "";
                globalStore.set(this.prStatusAtom, url ? `PR created: ${url}` : "PR created.");
                await this.refresh();
                return;
            }
            const reason = (body && typeof body.error == "string" && body.error) || "";
            if (res.status == 409) {
                globalStore.set(this.prStatusAtom, reason || "PR needs approval.");
                return;
            }
            globalStore.set(this.prStatusAtom, reason || `PR failed (${res.status}).`);
        } catch {
            globalStore.set(this.prStatusAtom, "PR unavailable â Recoder isn’t reachable.");
        } finally {
            globalStore.set(this.prCreatingAtom, false);
        }
    }
}

export { RecoderDiffViewModel, type RecoderWorkspace, type RecoderWorkspaceDiff };
