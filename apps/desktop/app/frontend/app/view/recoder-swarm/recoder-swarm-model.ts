// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { RecoderConnectionModel } from "../recoder/recoder-connection-model";
import { getRecoderBackendUrl } from "../recoder/recoder-endpoints";
import { readErrorReason } from "../recoder/recoder-errors";
import { RecoderSwarmView } from "./recoder-swarm";

// The "needs a human" attention states the cockpit reports for a Loom pane: an idle
// prompt (the agent stopped and is waiting on an answer) or an approval wait. These
// are exactly the panes `recoder_swarm_unblock` acts on, so the swarm panel filters
// the cockpit snapshot to them. `working`/`review_ready`/`unknown`/`error` are NOT
// blocked — a pane is only listed here when its live state truthfully says so.
const BlockedAttentionStates: readonly string[] = ["agent_idle_prompt", "awaiting_approval"];

// Truthful line when the cockpit read succeeds but resolves no group (unknown /
// unowned / no siblings yet) — a miss, never a fabricated cockpit.
const NoGroupNotice = "No convergence group found — fan a task out to N agents to open the cockpit.";

// Truthful line when the group is live but no pane is currently blocked.
const NoBlockedNotice = "No blocked panes — every agent is running or settled.";

// Truthful line when the unblock tool reports an unknown workspace (the tool returns
// { workspace: null } for a workspace it cannot resolve; an unowned one is a 403).
const WorkspaceMissNotice = "Workspace not found.";

// One blocked pane the operator can act on — its owning workspace, the agent kind
// that ran it, its live blocking status, and whether Loom drove it with NATIVE status
// (raw-pane fallbacks forfeit it, reported nativeStatus:false, never faked). Projected
// defensively from the untrusted cockpit wire. The blocking QUESTION is not carried by
// the cockpit snapshot (reading each pane's tail per tick is too costly) — it surfaces
// only in the governed unblock outcome, which reads it via agent.read on demand.
type BlockedAgent = {
    workspaceId: string;
    agentKind: string;
    status: string;
    nativeStatus: boolean;
};

// The truthful outcome of ONE governed unblock. `escalated` carries the real approval
// `requestId`; `answered` carries the delivered answer + its provenance source. Both
// come straight from the tool — an answer/requestId is NEVER fabricated by the model.
type UnblockResultView =
    | { action: "escalated"; requestId: string; question: string | null; reason: string }
    | { action: "answered"; answer: string; source: string; question: string };

// The normalized outcome of ONE governed unblock, decoupled from the wire so the row
// sets result + notice atomically. A null result with a notice = a truthful miss /
// degrade / denial; a result = a real escalation or answer.
type UnblockOutcome = {
    result: UnblockResultView | null;
    notice: string;
};

// The normalized outcome of ONE governed cockpit read, projected to the blocked panes.
// A null list = a miss / degrade / denial (no snapshot); an empty list = a live group
// with nothing blocked; a populated list = the panes awaiting a human.
type BlockedOutcome = {
    blocked: BlockedAgent[] | null;
    notice: string;
};

class RecoderSwarmViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;
    taskGroupAtom: PrimitiveAtom<string>;
    blockedAtom: PrimitiveAtom<BlockedAgent[] | null>;
    noticeAtom: PrimitiveAtom<string>;
    errorAtom: PrimitiveAtom<string>;
    loadingAtom: PrimitiveAtom<boolean>;
    connectedAtom: PrimitiveAtom<boolean>;

    // ESCALATE BY DEFAULT: auto-answer is an explicit opt-in the operator toggles on.
    autoAnswerAtom: PrimitiveAtom<boolean>;
    // Per-workspace in-flight flags + last outcomes, so each row acts independently.
    unblockingAtom: PrimitiveAtom<Record<string, boolean>>;
    outcomeAtom: PrimitiveAtom<Record<string, UnblockOutcome>>;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder-swarm";
        this.viewIcon = atom("hand-holding-hand");
        this.viewName = atom("Swarm Unblock");
        this.taskGroupAtom = atom("") as PrimitiveAtom<string>;
        this.blockedAtom = atom(null) as PrimitiveAtom<BlockedAgent[] | null>;
        this.noticeAtom = atom("") as PrimitiveAtom<string>;
        this.errorAtom = atom("") as PrimitiveAtom<string>;
        this.loadingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.connectedAtom = atom(false) as PrimitiveAtom<boolean>;

        this.autoAnswerAtom = atom(false) as PrimitiveAtom<boolean>;
        this.unblockingAtom = atom({}) as PrimitiveAtom<Record<string, boolean>>;
        this.outcomeAtom = atom({}) as PrimitiveAtom<Record<string, UnblockOutcome>>;
    }

    get viewComponent(): ViewComponent {
        return RecoderSwarmView;
    }

    setTaskGroup(value: string) {
        globalStore.set(this.taskGroupAtom, value);
    }

    setAutoAnswer(value: boolean) {
        globalStore.set(this.autoAnswerAtom, value);
    }

    toggleAutoAnswer() {
        globalStore.set(this.autoAnswerAtom, !globalStore.get(this.autoAnswerAtom));
    }

    // Load the LIVE blocked panes for a taskGroup by REUSING the governed cockpit read
    // (never a new backend edge). Empty group clears the panel without a request.
    // Degrade-truthful: a non-2xx / denied gate / miss each surface an explicit honest
    // notice with NO fabricated list; a transport throw surfaces "Not connected.".
    async loadBlocked(taskGroup?: string) {
        const group = (taskGroup ?? globalStore.get(this.taskGroupAtom)).trim();
        if (group == "") {
            globalStore.set(this.blockedAtom, null);
            globalStore.set(this.noticeAtom, "");
            globalStore.set(this.errorAtom, "");
            return;
        }
        globalStore.set(this.loadingAtom, true);
        globalStore.set(this.errorAtom, "");
        globalStore.set(this.noticeAtom, "");
        try {
            const outcome = await fetchBlocked(getRecoderBackendUrl(), group);
            globalStore.set(this.blockedAtom, outcome.blocked);
            globalStore.set(this.noticeAtom, outcome.notice);
            globalStore.set(this.connectedAtom, true);
            RecoderConnectionModel.getInstance().noteRefresh(true);
        } catch {
            globalStore.set(this.blockedAtom, null);
            globalStore.set(this.errorAtom, "Not connected.");
            globalStore.set(this.connectedAtom, false);
            RecoderConnectionModel.getInstance().noteRefresh(false);
        } finally {
            globalStore.set(this.loadingAtom, false);
        }
    }

    // Unblock ONE pane over the governed MCP edge. `autoAnswer` DEFAULTS to the panel
    // toggle (escalate-by-default); a caller may override it. The shared `taskGroup`
    // rides the args when present so the tool's sibling-decision source is enabled.
    // Truthful: an escalation shows its real requestId; an answer shows its source; a
    // denied/needs_approval/failed gate surfaces the reason verbatim (SERVICE_UNAVAILABLE
    // is NOT hidden — the feature may be unwired); a transport throw shows "Not connected.".
    async unblock(workspaceId: string, opts?: { autoAnswer?: boolean }) {
        const ws = workspaceId.trim();
        if (ws == "") {
            return;
        }
        const autoAnswer = opts?.autoAnswer ?? globalStore.get(this.autoAnswerAtom);
        const taskGroup = globalStore.get(this.taskGroupAtom).trim();
        this.setRowBusy(ws, true);
        try {
            const outcome = await fetchUnblock(getRecoderBackendUrl(), { workspaceId: ws, autoAnswer, taskGroup });
            this.setRowOutcome(ws, outcome);
            globalStore.set(this.connectedAtom, true);
        } catch {
            this.setRowOutcome(ws, { result: null, notice: "Not connected." });
            globalStore.set(this.connectedAtom, false);
        } finally {
            this.setRowBusy(ws, false);
        }
    }

    setRowBusy(workspaceId: string, busy: boolean) {
        const current = globalStore.get(this.unblockingAtom);
        globalStore.set(this.unblockingAtom, { ...current, [workspaceId]: busy });
    }

    setRowOutcome(workspaceId: string, outcome: UnblockOutcome) {
        const current = globalStore.get(this.outcomeAtom);
        globalStore.set(this.outcomeAtom, { ...current, [workspaceId]: outcome });
    }
}

// --- cockpit → blocked projection --------------------------------------------

// Run ONE governed cockpit read and project it to the blocked panes. A non-2xx yields
// a truthful notice; otherwise the wire is branched by gate status and by the tool
// payload's own truthful shape ({ snapshot } / { error }). Throws only on transport
// failure so the caller renders "Not connected.".
async function fetchBlocked(base: string, taskGroup: string): Promise<BlockedOutcome> {
    const res = await fetch(`${base}/api/mcp/tools/conductor/recoder_converge_cockpit/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ args: { taskGroup } }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
        return { blocked: null, notice: readErrorReason(body) || `Cockpit unavailable (${res.status})` };
    }
    return projectCockpitBlocked(body);
}

function projectCockpitBlocked(body: unknown): BlockedOutcome {
    const data = asRecord((body as { data?: unknown } | null)?.data);
    const status = typeof data.status == "string" ? data.status : "";
    if (status != "completed") {
        return { blocked: null, notice: gateDegradeNotice(status, data.reason) };
    }
    const result = asRecord(data.result);
    if (typeof result.error == "string" && result.error != "") {
        return { blocked: null, notice: result.error };
    }
    if (result.snapshot == null) {
        return { blocked: null, notice: NoGroupNotice };
    }
    const snapshot = asRecord(result.snapshot);
    const blocked = projectBlockedAgents(snapshot.agents);
    const reason = snapshot.degraded === true && typeof snapshot.reason == "string" ? snapshot.reason : "";
    const notice = reason != "" ? reason : blocked.length == 0 ? NoBlockedNotice : "";
    return { blocked, notice };
}

// Project the (untrusted) cockpit agents into the blocked list. Only panes whose live
// state is a blocked attention state are kept.
function projectBlockedAgents(value: unknown): BlockedAgent[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const out: BlockedAgent[] = [];
    for (const raw of value) {
        const a = asRecord(raw);
        const state = typeof a.state == "string" ? a.state : "unknown";
        if (!BlockedAttentionStates.includes(state)) {
            continue;
        }
        const workspaceId = typeof a.workspaceId == "string" ? a.workspaceId : "";
        const kind = typeof a.kind == "string" ? a.kind : "";
        if (workspaceId == "" && kind == "") {
            continue;
        }
        out.push({
            workspaceId,
            agentKind: kind,
            status: state,
            nativeStatus: a.nativeStatus === true,
        });
    }
    return out;
}

// --- unblock projection ------------------------------------------------------

// Run ONE governed unblock. A non-2xx yields a truthful notice; otherwise the wire is
// branched by gate status and by the tool's own truthful result shape. Throws only on
// transport failure. The args are FLAT ({ workspaceId, taskGroup?, autoAnswer }) — the
// tool composes the policy from them (autoAnswer:false ⇒ escalate by default).
async function fetchUnblock(
    base: string,
    args: { workspaceId: string; autoAnswer: boolean; taskGroup: string }
): Promise<UnblockOutcome> {
    const body = {
        workspaceId: args.workspaceId,
        ...(args.taskGroup == "" ? {} : { taskGroup: args.taskGroup }),
        autoAnswer: args.autoAnswer,
    };
    const res = await fetch(`${base}/api/mcp/tools/conductor/recoder_swarm_unblock/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ args: body }),
    });
    const resBody = await res.json().catch(() => null);
    if (!res.ok) {
        return { result: null, notice: readErrorReason(resBody) || `Unblock unavailable (${res.status})` };
    }
    return projectUnblockWire(resBody);
}

// Branch on the governed edge's `data.status` AND on the tool's own truthful result
// shape. A denial/approval/failed reason is surfaced verbatim; a completed result is
// projected to an escalation or an answer — an escalation with no requestId, or an
// answer with no answer text, is treated as a truthful "unrecognized" notice rather
// than a fabricated success.
function projectUnblockWire(body: unknown): UnblockOutcome {
    const data = asRecord((body as { data?: unknown } | null)?.data);
    const status = typeof data.status == "string" ? data.status : "";
    if (status != "completed") {
        return { result: null, notice: gateDegradeNotice(status, data.reason) };
    }
    const result = asRecord(data.result);
    // The tool fails input validation with { error } (no unblock attempted).
    if (typeof result.error == "string" && result.error != "") {
        return { result: null, notice: result.error };
    }
    // An unknown workspace is a truthful miss ({ workspace: null }), not an action.
    if ("workspace" in result && result.workspace == null && !("action" in result)) {
        return { result: null, notice: WorkspaceMissNotice };
    }
    const action = typeof result.action == "string" ? result.action : "";
    if (action == "answered") {
        const answer = typeof result.answer == "string" ? result.answer : "";
        if (answer == "") {
            return { result: null, notice: "Unblock reported an answer with no text." };
        }
        return {
            result: {
                action: "answered",
                answer,
                source: typeof result.source == "string" ? result.source : "",
                question: typeof result.question == "string" ? result.question : "",
            },
            notice: "",
        };
    }
    if (action == "escalated") {
        const requestId = typeof result.requestId == "string" ? result.requestId : "";
        if (requestId == "") {
            return { result: null, notice: "Unblock escalated without a request id." };
        }
        return {
            result: {
                action: "escalated",
                requestId,
                question: typeof result.question == "string" ? result.question : null,
                reason: typeof result.reason == "string" ? result.reason : "",
            },
            notice: "",
        };
    }
    return { result: null, notice: "Unblock returned an unrecognized result." };
}

// --- helpers -----------------------------------------------------------------

// A non-completed gate outcome: surface the backend's reason VERBATIM (an unwired
// SERVICE_UNAVAILABLE / failed reason is shown, never hidden), falling back to a
// truthful capability-scoped line only when the gate carried no reason.
function gateDegradeNotice(status: string, reason: unknown): string {
    const r = typeof reason == "string" ? reason : "";
    if (status == "needs_approval") {
        return r || "Unblock is pending approval.";
    }
    if (status == "denied") {
        return r || "Unblock was not permitted by policy.";
    }
    return r || "Swarm unblock unavailable.";
}

function asRecord(value: unknown): Record<string, unknown> {
    return value != null && typeof value == "object" ? (value as Record<string, unknown>) : {};
}

export {
    RecoderSwarmViewModel,
    BlockedAttentionStates,
    NoBlockedNotice,
    NoGroupNotice,
    WorkspaceMissNotice,
    type BlockedAgent,
    type BlockedOutcome,
    type UnblockOutcome,
    type UnblockResultView,
};
