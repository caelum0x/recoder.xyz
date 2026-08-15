// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { createBlock, globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { RecoderConnectionModel } from "../recoder/recoder-connection-model";
import { getRecoderBackendUrl } from "../recoder/recoder-endpoints";
import { workspaceDetailMeta } from "../recoder/recoder-detail-open";
import { readErrorReason } from "../recoder/recoder-errors";
import { RecoderNeedsYouView } from "./recoder-needs-you";

// The attention state the queue ranks HIGHEST — the one row the panel reserves its
// single crimson accent for. Kept as data so the tsx never re-derives urgency; the
// backend already ranked, this is only the render cue for the top-priority state.
const TopPriorityState = "awaiting_approval";

// One projected Needs-You queue entry — the caller's pane that needs a human, RANKED by
// the backend (awaiting_approval highest). Projected defensively from the untrusted
// snapshot wire: `state` (the classified AttentionState) falls to "unknown" (shown, never
// counted); `nativeStatus` is the raw Loom AgentStatus STRING (idle/working/blocked/done/
// unknown) — "unknown" means Loom gave no native signal for the pane, never faked. The
// order is PRESERVED from the wire — the backend ranks, the panel never re-sorts.
type NeedsYouEntry = {
    workspaceId: string;
    agentKind: string;
    state: string;
    rank: number;
    nativeStatus: string;
    needsYou: boolean;
    seen: boolean;
};

// The one projected Needs-You snapshot the terminal renders — the ranked entries plus the
// truthful counts and the degrade flag/reason. A degraded snapshot keeps its last-known
// entries (never cleared to a look-alike empty) AND carries the reason, so a dead stream
// is surfaced explicitly, never masked as an all-clear.
type NeedsYouView = {
    entries: NeedsYouEntry[];
    count: number;
    total: number;
    degraded: boolean;
    reason: string;
};

// The normalized outcome of ONE governed queue read, decoupled from the wire so the caller
// sets snapshot + notice atomically. A null snapshot with a notice = a truthful miss / gate
// degrade / denial (no fabricated queue); a snapshot with a notice = a degraded-but-truthful
// snapshot (last-known entries preserved + the backend's reason).
type NeedsYouOutcome = {
    snapshot: NeedsYouView | null;
    notice: string;
};

class RecoderNeedsYouViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;
    ownerAtom: PrimitiveAtom<string>;
    taskGroupAtom: PrimitiveAtom<string>;
    snapshotAtom: PrimitiveAtom<NeedsYouView | null>;
    noticeAtom: PrimitiveAtom<string>;
    errorAtom: PrimitiveAtom<string>;
    loadingAtom: PrimitiveAtom<boolean>;
    connectedAtom: PrimitiveAtom<boolean>;

    topPriorityState: string;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder-needs-you";
        this.viewIcon = atom("bell");
        this.viewName = atom("Needs You");
        this.ownerAtom = atom("") as PrimitiveAtom<string>;
        this.taskGroupAtom = atom("") as PrimitiveAtom<string>;
        this.snapshotAtom = atom(null) as PrimitiveAtom<NeedsYouView | null>;
        this.noticeAtom = atom("") as PrimitiveAtom<string>;
        this.errorAtom = atom("") as PrimitiveAtom<string>;
        this.loadingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.connectedAtom = atom(false) as PrimitiveAtom<boolean>;

        this.topPriorityState = TopPriorityState;
    }

    get viewComponent(): ViewComponent {
        return RecoderNeedsYouView;
    }

    setOwner(value: string) {
        globalStore.set(this.ownerAtom, value);
    }

    setTaskGroup(value: string) {
        globalStore.set(this.taskGroupAtom, value);
    }

    // Read the LIVE Needs-You queue for the caller's panes over the governed MCP edge. The
    // read is owner-scoped by the backend (no filter reads the caller's OWN panes); an
    // optional `owner` (admin/internal only) / `taskGroup` narrows it. Degrade-truthful: a
    // non-2xx / denied gate / SERVICE_UNAVAILABLE each surface an explicit honest notice with
    // NO fabricated queue; a degraded-but-connected snapshot keeps its last-known entries + the
    // backend's reason (never a fake all-clear); a transport throw surfaces "Not connected.".
    async load(opts?: { owner?: string; taskGroup?: string }) {
        const owner = (opts?.owner ?? globalStore.get(this.ownerAtom)).trim();
        const taskGroup = (opts?.taskGroup ?? globalStore.get(this.taskGroupAtom)).trim();
        globalStore.set(this.loadingAtom, true);
        globalStore.set(this.errorAtom, "");
        globalStore.set(this.noticeAtom, "");
        try {
            const outcome = await fetchNeedsYou(getRecoderBackendUrl(), { owner, taskGroup });
            globalStore.set(this.snapshotAtom, outcome.snapshot);
            globalStore.set(this.noticeAtom, outcome.notice);
            globalStore.set(this.connectedAtom, true);
            RecoderConnectionModel.getInstance().noteRefresh(true);
        } catch {
            globalStore.set(this.snapshotAtom, null);
            globalStore.set(this.errorAtom, "Not connected.");
            globalStore.set(this.connectedAtom, false);
            RecoderConnectionModel.getInstance().noteRefresh(false);
        } finally {
            globalStore.set(this.loadingAtom, false);
        }
    }

    // Jump to a pane's live terminal session by opening its workspace block — the SAME view
    // meta the runs hub uses to focus a workspace. Fire-and-forget from event handlers: an
    // empty id is a no-op and a failed open never takes down the queue view.
    async focusWorkspace(workspaceId: string) {
        const ws = workspaceId.trim();
        if (ws == "") {
            return;
        }
        const meta = workspaceDetailMeta("session", ws);
        try {
            await createBlock({ meta });
        } catch {
            // degrade-safe: opening a block must never take down the needs-you view
        }
    }
}

// --- needs-you projection ----------------------------------------------------

// Run ONE governed queue read. A non-2xx yields a truthful notice; otherwise the wire is
// branched by gate status and projected. Throws only on transport failure so the caller
// renders "Not connected.". The args are FLAT ({ taskGroup?, userId? }) — the tool re-derives
// the owner scope from the authorized caller, so `userId` is honoured only for admin callers.
async function fetchNeedsYou(base: string, args: { owner: string; taskGroup: string }): Promise<NeedsYouOutcome> {
    const body: Record<string, unknown> = {
        ...(args.taskGroup == "" ? {} : { taskGroup: args.taskGroup }),
        ...(args.owner == "" ? {} : { userId: args.owner }),
    };
    const res = await fetch(`${base}/api/mcp/tools/conductor/recoder_needs_you/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ args: body }),
    });
    const resBody = await res.json().catch(() => null);
    if (!res.ok) {
        return { snapshot: null, notice: readErrorReason(resBody) || `Needs-You unavailable (${res.status})` };
    }
    return projectNeedsYouWire(resBody);
}

// Branch on the governed edge's `data.status` (completed vs denied/needs_approval/failed).
// A denial/approval/failed reason is surfaced VERBATIM (a SERVICE_UNAVAILABLE from an unwired
// queue is shown, never hidden); a completed snapshot is projected (a degraded snapshot keeps
// its last-known entries + the backend's reason, never a fabricated all-clear).
function projectNeedsYouWire(body: unknown): NeedsYouOutcome {
    const data = asRecord((body as { data?: unknown } | null)?.data);
    const status = typeof data.status == "string" ? data.status : "";
    if (status != "completed") {
        return { snapshot: null, notice: gateDegradeNotice(status, data.reason) };
    }
    const snapshot = projectSnapshot(data.result);
    return { snapshot, notice: snapshot.degraded ? snapshot.reason : "" };
}

// Project the (untrusted) snapshot wire into the terminal view model. Counts are read as
// finite numbers or 0 — NEVER fabricated or recomputed (the backend already counted only the
// panes needing you). A missing `degraded` flag reads false. Entry order is PRESERVED.
function projectSnapshot(value: unknown): NeedsYouView {
    const s = asRecord(value);
    return {
        entries: projectEntries(s.entries),
        count: num(s.count),
        total: num(s.total),
        degraded: s.degraded === true,
        reason: typeof s.reason == "string" ? s.reason : "",
    };
}

// Project the (untrusted) ranked entries in RECEIVED ORDER — the backend ranked them
// (awaiting_approval highest), so a client re-sort would be a second, competing authority.
// An entry with no workspaceId AND no agentKind is dropped (nothing to key or focus).
function projectEntries(value: unknown): NeedsYouEntry[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const out: NeedsYouEntry[] = [];
    for (const raw of value) {
        const a = asRecord(raw);
        const workspaceId = typeof a.workspaceId == "string" ? a.workspaceId : "";
        const agentKind = typeof a.agentKind == "string" ? a.agentKind : "";
        if (workspaceId == "" && agentKind == "") {
            continue;
        }
        out.push({
            workspaceId,
            agentKind,
            state: typeof a.state == "string" ? a.state : "unknown",
            rank: num(a.rank),
            nativeStatus: typeof a.nativeStatus == "string" ? a.nativeStatus : "unknown",
            needsYou: a.needsYou === true,
            seen: a.seen === true,
        });
    }
    return out;
}

// --- helpers -----------------------------------------------------------------

// A non-completed gate outcome: surface the backend's reason VERBATIM (an unwired
// SERVICE_UNAVAILABLE / failed reason is shown, never hidden), falling back to a truthful
// capability-scoped line only when the gate carried no reason.
function gateDegradeNotice(status: string, reason: unknown): string {
    const r = typeof reason == "string" ? reason : "";
    if (status == "needs_approval") {
        return r || "Needs-You read is pending approval.";
    }
    if (status == "denied") {
        return r || "Needs-You read was not permitted by policy.";
    }
    return r || "Needs-You queue unavailable.";
}

function asRecord(value: unknown): Record<string, unknown> {
    return value != null && typeof value == "object" ? (value as Record<string, unknown>) : {};
}

function num(value: unknown): number {
    return typeof value == "number" && Number.isFinite(value) ? value : 0;
}

export {
    RecoderNeedsYouViewModel,
    TopPriorityState,
    type NeedsYouEntry,
    type NeedsYouOutcome,
    type NeedsYouView,
};
