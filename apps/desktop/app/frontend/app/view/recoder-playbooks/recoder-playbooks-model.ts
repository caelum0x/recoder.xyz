// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import {
    KnownAgentKinds,
    MaxFanoutAgents,
    MinFanoutAgents,
} from "../recoder-fanout/recoder-fanout-model";
import { RecoderConnectionModel } from "../recoder/recoder-connection-model";
import { getRecoderBackendUrl } from "../recoder/recoder-endpoints";
import { readErrorReason } from "../recoder/recoder-errors";
import { RecoderPlaybooksView } from "./recoder-playbooks";

// One built-in orchestration recipe the picker offers — its stable id + human
// description, projected from `recoder_playbook_list` (the tool is the authority;
// this list is only the launch affordance, never fabricated).
type PlaybookListEntry = {
    id: string;
    description: string;
};

// How a single playbook step resolved — mirrors the backend PlaybookStepStatus. NEVER
// fabricated: a refused/degraded primitive keeps its real status + reason.
type PlaybookStepStatus = "ok" | "degraded" | "skipped";

// One BLOCKED pane an `unblock_blocked` step acted on. Truthful: a pane carries EITHER
// a real `action` (from the swarm-unblock result) OR a `faultReason` (the primitive
// faulted for this pane) — never both, and a fault is never dressed up as an action.
type UnblockPaneView = {
    workspaceId: string;
    action: string;
    faultReason: string;
};

// One projected step outcome for the run panel — its kind + REAL status + a truthful
// reason (empty on `ok`), plus the per-pane outcomes when it is an unblock step.
type PlaybookStepView = {
    kind: string;
    status: PlaybookStepStatus;
    reason: string;
    unblock: UnblockPaneView[];
};

// The composed convergence branch — present ONLY when a shipped compose actually built
// one; otherwise the run keeps `converged:null` + a truthful convergeReason.
type ConvergedBranch = {
    workspaceId: string;
    branch: string;
};

// The projected outcome of ONE governed playbook run — the shared taskGroup (or null
// when no fanout ran), the ordered steps with their real statuses, and the final
// converged branch (or null + a truthful reason). Mirrors the backend PlaybookRunResult.
type PlaybookRunView = {
    playbookId: string;
    taskGroup: string | null;
    steps: PlaybookStepView[];
    converged: ConvergedBranch | null;
    convergeReason: string;
};

// The normalized outcome of ONE governed list read, decoupled from the wire so the
// caller sets entries + notice atomically. Empty entries + a notice = a truthful miss.
type PlaybookListOutcome = {
    entries: PlaybookListEntry[];
    notice: string;
};

// The normalized outcome of ONE governed playbook run.
type PlaybookRunOutcome = {
    result: PlaybookRunView | null;
    notice: string;
};

// Truthful line when the run form is missing the governed context the tool requires.
const MissingContextNotice = "Repo path, space, and project are required to run a playbook.";

// Truthful line when no built-in recipe is selected — the run selector needs one.
const NoPlaybookNotice = "Pick a playbook to run.";

class RecoderPlaybooksViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;

    playbooksAtom: PrimitiveAtom<PlaybookListEntry[]>;
    selectedPlaybookAtom: PrimitiveAtom<string>;
    listLoadingAtom: PrimitiveAtom<boolean>;
    listNoticeAtom: PrimitiveAtom<string>;

    taskAtom: PrimitiveAtom<string>;
    kindsAtom: PrimitiveAtom<string[]>;
    followupTaskAtom: PrimitiveAtom<string>;
    repoPathAtom: PrimitiveAtom<string>;
    spaceIdAtom: PrimitiveAtom<string>;
    projectIdAtom: PrimitiveAtom<string>;

    runningAtom: PrimitiveAtom<boolean>;
    runNoticeAtom: PrimitiveAtom<string>;
    runResultAtom: PrimitiveAtom<PlaybookRunView | null>;
    taskGroupAtom: PrimitiveAtom<string>;

    errorAtom: PrimitiveAtom<string>;
    connectedAtom: PrimitiveAtom<boolean>;

    knownKinds: readonly string[];
    minAgents: number;
    maxAgents: number;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder-playbooks";
        this.viewIcon = atom("book");
        this.viewName = atom("Run Playbook");

        this.playbooksAtom = atom([]) as PrimitiveAtom<PlaybookListEntry[]>;
        this.selectedPlaybookAtom = atom("") as PrimitiveAtom<string>;
        this.listLoadingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.listNoticeAtom = atom("") as PrimitiveAtom<string>;

        this.taskAtom = atom("") as PrimitiveAtom<string>;
        this.kindsAtom = atom([]) as PrimitiveAtom<string[]>;
        this.followupTaskAtom = atom("") as PrimitiveAtom<string>;
        this.repoPathAtom = atom("") as PrimitiveAtom<string>;
        this.spaceIdAtom = atom("") as PrimitiveAtom<string>;
        this.projectIdAtom = atom("") as PrimitiveAtom<string>;

        this.runningAtom = atom(false) as PrimitiveAtom<boolean>;
        this.runNoticeAtom = atom("") as PrimitiveAtom<string>;
        this.runResultAtom = atom(null) as PrimitiveAtom<PlaybookRunView | null>;
        this.taskGroupAtom = atom("") as PrimitiveAtom<string>;

        this.errorAtom = atom("") as PrimitiveAtom<string>;
        this.connectedAtom = atom(false) as PrimitiveAtom<boolean>;

        this.knownKinds = KnownAgentKinds;
        this.minAgents = MinFanoutAgents;
        this.maxAgents = MaxFanoutAgents;
    }

    get viewComponent(): ViewComponent {
        return RecoderPlaybooksView;
    }

    setTask(value: string) {
        globalStore.set(this.taskAtom, value);
    }

    setFollowupTask(value: string) {
        globalStore.set(this.followupTaskAtom, value);
    }

    setRepoPath(value: string) {
        globalStore.set(this.repoPathAtom, value);
    }

    setSpaceId(value: string) {
        globalStore.set(this.spaceIdAtom, value);
    }

    setProjectId(value: string) {
        globalStore.set(this.projectIdAtom, value);
    }

    // Select which built-in recipe the run form will run (unknown ids are ignored so the
    // selector never posts a playbookId the backend will only reject).
    selectPlaybook(id: string) {
        const entries = globalStore.get(this.playbooksAtom);
        if (!entries.some((p) => p.id == id)) {
            return;
        }
        globalStore.set(this.selectedPlaybookAtom, id);
    }

    // Toggle one agent kind in the run set (kept ≤ maxAgents; unknown kinds ignored).
    toggleKind(kind: string) {
        if (!this.knownKinds.includes(kind)) {
            return;
        }
        const current = globalStore.get(this.kindsAtom);
        if (current.includes(kind)) {
            globalStore.set(this.kindsAtom, current.filter((k) => k != kind));
            return;
        }
        if (current.length >= this.maxAgents) {
            return;
        }
        globalStore.set(this.kindsAtom, [...current, kind]);
    }

    // Load the built-in playbook catalog over the governed MCP edge. Degrade-truthful: a
    // non-2xx / denied gate each surface an explicit honest notice with NO fabricated
    // entries; a transport throw surfaces "Not connected.".
    async loadList() {
        globalStore.set(this.listLoadingAtom, true);
        globalStore.set(this.errorAtom, "");
        globalStore.set(this.listNoticeAtom, "");
        try {
            const outcome = await fetchPlaybookList(getRecoderBackendUrl());
            globalStore.set(this.playbooksAtom, outcome.entries);
            globalStore.set(this.listNoticeAtom, outcome.notice);
            globalStore.set(this.connectedAtom, true);
            const selected = globalStore.get(this.selectedPlaybookAtom);
            if (selected == "" && outcome.entries.length > 0) {
                globalStore.set(this.selectedPlaybookAtom, outcome.entries[0].id);
            }
            RecoderConnectionModel.getInstance().noteRefresh(true);
        } catch {
            globalStore.set(this.playbooksAtom, []);
            globalStore.set(this.errorAtom, "Not connected.");
            globalStore.set(this.connectedAtom, false);
            RecoderConnectionModel.getInstance().noteRefresh(false);
        } finally {
            globalStore.set(this.listLoadingAtom, false);
        }
    }

    // Run ONE built-in playbook over the governed MCP edge. The governed context
    // (repoPath / spaceId / projectId) rides the form atoms. Fail-fast + truthful: an
    // unselected recipe, empty task, too-small kind set, or missing context each set a
    // notice and post NOTHING; a denied gate / validation refusal surfaces the reason
    // verbatim; a transport throw shows "Not connected."; the taskGroup of a real run is
    // pinned. Every projected step keeps its REAL status; a converged:null keeps its
    // reason — the branch is NEVER fabricated.
    async run(args: { playbookId: string; task: string; agentKinds: string[]; followupTask?: string }) {
        const playbookId = args.playbookId.trim();
        const trimmedTask = args.task.trim();
        const kinds = dedupeKinds(args.agentKinds, this.knownKinds);
        const followupTask = (args.followupTask ?? "").trim();
        globalStore.set(this.runNoticeAtom, "");
        globalStore.set(this.runResultAtom, null);
        if (playbookId == "") {
            globalStore.set(this.runNoticeAtom, NoPlaybookNotice);
            return;
        }
        if (trimmedTask == "") {
            globalStore.set(this.runNoticeAtom, "A task description is required to run a playbook.");
            return;
        }
        if (kinds.length < this.minAgents) {
            globalStore.set(this.runNoticeAtom, `Pick at least ${this.minAgents} distinct agents to run a playbook.`);
            return;
        }
        const repoPath = globalStore.get(this.repoPathAtom).trim();
        const spaceId = globalStore.get(this.spaceIdAtom).trim();
        const projectId = globalStore.get(this.projectIdAtom).trim();
        if (repoPath == "" || spaceId == "" || projectId == "") {
            globalStore.set(this.runNoticeAtom, MissingContextNotice);
            return;
        }
        globalStore.set(this.runningAtom, true);
        try {
            const outcome = await fetchPlaybookRun(getRecoderBackendUrl(), {
                playbookId,
                task: trimmedTask,
                agentKinds: kinds.slice(0, this.maxAgents),
                repoPath,
                spaceId,
                projectId,
                ...(followupTask == "" ? {} : { followupTask }),
            });
            globalStore.set(this.runResultAtom, outcome.result);
            globalStore.set(this.runNoticeAtom, outcome.notice);
            globalStore.set(this.connectedAtom, true);
            if (outcome.result != null && outcome.result.taskGroup != null && outcome.result.taskGroup != "") {
                globalStore.set(this.taskGroupAtom, outcome.result.taskGroup);
            }
        } catch {
            globalStore.set(this.runResultAtom, null);
            globalStore.set(this.runNoticeAtom, "Not connected.");
            globalStore.set(this.connectedAtom, false);
        } finally {
            globalStore.set(this.runningAtom, false);
        }
    }
}

// --- list projection ---------------------------------------------------------

// Run ONE governed list read. A non-2xx yields a truthful notice; otherwise the wire is
// branched by gate status and the built-in catalog is projected from the tool's array
// result. Throws only on transport failure so the caller renders "Not connected.".
async function fetchPlaybookList(base: string): Promise<PlaybookListOutcome> {
    const res = await fetch(`${base}/api/mcp/tools/conductor/recoder_playbook_list/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ args: {} }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
        return { entries: [], notice: readErrorReason(body) || `Playbooks unavailable (${res.status})` };
    }
    return projectListWire(body);
}

function projectListWire(body: unknown): PlaybookListOutcome {
    const data = asRecord((body as { data?: unknown } | null)?.data);
    const status = typeof data.status == "string" ? data.status : "";
    if (status != "completed") {
        return { entries: [], notice: gateDegradeNotice(status, data.reason) };
    }
    const entries = projectListEntries(data.result);
    const notice = entries.length == 0 ? "No built-in playbooks are available." : "";
    return { entries, notice };
}

// Project the (untrusted) list wire into the picker's entries. Only items carrying a
// real id are kept — a shapeless entry is dropped, never fabricated into a fake recipe.
function projectListEntries(value: unknown): PlaybookListEntry[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const out: PlaybookListEntry[] = [];
    for (const raw of value) {
        const p = asRecord(raw);
        const id = typeof p.id == "string" ? p.id : "";
        if (id == "") {
            continue;
        }
        out.push({ id, description: typeof p.description == "string" ? p.description : "" });
    }
    return out;
}

// --- run projection ----------------------------------------------------------

// Run ONE governed playbook run. A non-2xx yields a truthful notice; otherwise the wire
// is branched by gate status and by the tool's own input-error shape ({ ok:false, error }).
// Throws only on transport failure.
async function fetchPlaybookRun(
    base: string,
    args: {
        playbookId: string;
        task: string;
        agentKinds: string[];
        repoPath: string;
        spaceId: string;
        projectId: string;
        followupTask?: string;
    }
): Promise<PlaybookRunOutcome> {
    const res = await fetch(`${base}/api/mcp/tools/conductor/recoder_playbook_run/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ args }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
        return { result: null, notice: readErrorReason(body) || `Playbook run unavailable (${res.status})` };
    }
    return projectRunWire(body);
}

function projectRunWire(body: unknown): PlaybookRunOutcome {
    const data = asRecord((body as { data?: unknown } | null)?.data);
    const status = typeof data.status == "string" ? data.status : "";
    if (status != "completed") {
        return { result: null, notice: gateDegradeNotice(status, data.reason) };
    }
    const result = asRecord(data.result);
    // The tool fails input validation with { ok:false, error } (no run started).
    if (result.ok === false && typeof result.error == "string") {
        return { result: null, notice: result.error };
    }
    if (typeof result.playbookId != "string" || result.playbookId == "") {
        return { result: null, notice: "Playbook run returned no result." };
    }
    const view = projectRun(result);
    const notice = view.converged == null ? view.convergeReason || "Nothing was converged." : "";
    return { result: view, notice };
}

function projectRun(result: Record<string, unknown>): PlaybookRunView {
    const converged = asRecord(result.converged);
    const convergedView =
        typeof converged.workspaceId == "string" && typeof converged.branch == "string"
            ? { workspaceId: converged.workspaceId, branch: converged.branch }
            : null;
    return {
        playbookId: String(result.playbookId),
        taskGroup: typeof result.taskGroup == "string" ? result.taskGroup : null,
        steps: projectSteps(result.steps),
        converged: convergedView,
        convergeReason: typeof result.convergeReason == "string" ? result.convergeReason : "",
    };
}

function projectSteps(value: unknown): PlaybookStepView[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const out: PlaybookStepView[] = [];
    for (const raw of value) {
        const s = asRecord(raw);
        const kind = typeof s.kind == "string" ? s.kind : "";
        if (kind == "") {
            continue;
        }
        out.push({
            kind,
            status: projectStatus(s.status),
            reason: typeof s.reason == "string" ? s.reason : "",
            unblock: projectUnblockPanes(s.unblock),
        });
    }
    return out;
}

// Read the step status as one of the three REAL values — an unknown/missing status is
// never optimistically upgraded to `ok`; it degrades truthfully.
function projectStatus(value: unknown): PlaybookStepStatus {
    if (value == "ok" || value == "degraded" || value == "skipped") {
        return value as PlaybookStepStatus;
    }
    return "degraded";
}

// Project each BLOCKED pane truthfully: a pane with a real swarm-unblock result carries
// its `action`; a pane the primitive faulted for carries its `faultReason`. Never both,
// and a fault is never rendered as an action.
function projectUnblockPanes(value: unknown): UnblockPaneView[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const out: UnblockPaneView[] = [];
    for (const raw of value) {
        const p = asRecord(raw);
        const workspaceId = typeof p.workspaceId == "string" ? p.workspaceId : "";
        if (workspaceId == "") {
            continue;
        }
        const faultReason = typeof p.faultReason == "string" ? p.faultReason : "";
        const resultRecord = asRecord(p.result);
        const action = faultReason == "" && typeof resultRecord.action == "string" ? resultRecord.action : "";
        out.push({ workspaceId, action, faultReason });
    }
    return out;
}

// --- helpers -----------------------------------------------------------------

function gateDegradeNotice(status: string, reason: unknown): string {
    const r = typeof reason == "string" ? reason : "";
    if (status == "needs_approval") {
        return r || "Playbook run is pending approval.";
    }
    if (status == "denied") {
        return r || "Playbook run was not permitted by policy.";
    }
    return r || "Playbook run unavailable.";
}

function asRecord(value: unknown): Record<string, unknown> {
    return value != null && typeof value == "object" ? (value as Record<string, unknown>) : {};
}

// Dedupe (preserving order) + drop unknown kinds — mirrors the tool's own normalize so
// the form never posts a set the backend will only reject.
function dedupeKinds(kinds: readonly string[], known: readonly string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of kinds) {
        const k = typeof raw == "string" ? raw.trim() : "";
        if (k == "" || !known.includes(k) || seen.has(k)) {
            continue;
        }
        seen.add(k);
        out.push(k);
    }
    return out;
}

export {
    RecoderPlaybooksViewModel,
    type ConvergedBranch,
    type PlaybookListEntry,
    type PlaybookRunView,
    type PlaybookStepStatus,
    type PlaybookStepView,
    type UnblockPaneView,
};
