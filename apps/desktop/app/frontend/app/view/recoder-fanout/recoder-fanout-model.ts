// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { createBlock, globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { RecoderConnectionModel } from "../recoder/recoder-connection-model";
import { composeConvergence, SYNTHESIZE_VALUE } from "../recoder/recoder-converge-logic";
import { getRecoderBackendUrl } from "../recoder/recoder-endpoints";
import { readErrorReason } from "../recoder/recoder-errors";
import { RecoderFanoutView } from "./recoder-fanout";

// The agent kinds the fan-out launch offers. Loom drives the NATIVE set with real
// agent-status; the FALLBACK set is accepted but forfeits native status (reported
// nativeStatus:false, never faked). The backend `KNOWN_AGENT_KINDS` set is the
// authority — this local list is only the launch affordance; the tool re-validates.
const LoomNativeKinds: readonly string[] = ["claude", "codex", "cursor", "opencode", "pi", "gemini"];
const LoomFallbackKinds: readonly string[] = ["recoder_code", "qwen_code", "crush"];
const KnownAgentKinds: readonly string[] = [...LoomNativeKinds, ...LoomFallbackKinds];

// Fan-out N bounds — the tool clamps to [MIN, MAX]; the form pre-checks so the
// launch button never posts a set the backend will only reject.
const MinFanoutAgents = 2;
const MaxFanoutAgents = 6;

// One agent pane the cockpit folded — its live settle/native truthful flags. Mirrors
// the backend CockpitAgent, projected defensively from the (untrusted) wire.
type CockpitAgent = {
    workspaceId: string;
    kind: string;
    state: string;
    settled: boolean;
    nativeStatus: boolean;
};

// One contested file — who authored it + whether it auto-merges. Mirrors CockpitContested.
type CockpitContested = {
    path: string;
    agents: string[];
    synthesizable: boolean;
    reason?: string;
};

// One sibling's version of ONE contested path for the N-up columns. `content` is null
// (with a truthful reason) when the sibling deleted/never-created the path — NEVER faked.
type FileVersionEntry = {
    workspaceId: string;
    agent: string;
    content: string | null;
    reason?: string;
    truncated?: boolean;
};

// The N-up per-file version view — base + each sibling's version of ONE path.
type FileVersionsView = {
    path: string;
    base: string | null;
    baseTruncated?: boolean;
    versions: FileVersionEntry[];
};

// The one projected cockpit snapshot the terminal renders — the settle strip
// (K/N + contested/auto-mergeable/needs-pick) plus the N-up columns. Every field is
// projected from the backend CockpitSnapshot; a degraded snapshot keeps its truthful
// settle counts + a `reason`, with all convergence numbers hard-zeroed.
type CockpitView = {
    taskGroup: string | null;
    agents: CockpitAgent[];
    settledCount: number;
    totalCount: number;
    contested: CockpitContested[];
    autoMergeableCount: number;
    needsPickCount: number;
    cleanCount: number;
    fileVersions: FileVersionsView[];
    convergeReady: boolean;
    summaryLine: string;
    degraded: boolean;
    reason: string;
};

// One agent's truthful fan-out launch outcome. `workspaceId` is null when the governed
// create failed; `settled:false` means the pane never produced a reviewable diff.
type FanoutAgentResult = {
    kind: string;
    nativeStatus: boolean;
    workspaceId: string | null;
    settled: boolean;
    reason: string;
    state?: string;
};

// The projected fan-out launch result — the shared taskGroup, the created siblings,
// the composed branch (or null + a truthful convergeReason), and per-agent outcomes.
type FanoutView = {
    taskGroup: string;
    workspaceIds: string[];
    converged: { workspaceId: string; branch: string } | null;
    convergeReason: string;
    perAgent: FanoutAgentResult[];
};

// A truthfully-composed converged branch, surfaced ONLY after a real post-launch-settle
// compose succeeds (workspaceId from the governed compose edge — never fabricated).
type ConvergedBranch = {
    workspaceId: string;
    branch: string;
};

// The normalized outcome of ONE governed cockpit read, decoupled from the wire so the
// caller sets snapshot + notice atomically. A null snapshot with a notice = a truthful
// miss/degrade; a snapshot with a notice = a degraded-but-truthful-counts snapshot.
type CockpitOutcome = {
    snapshot: CockpitView | null;
    notice: string;
};

// The normalized outcome of ONE governed fan-out launch.
type FanoutOutcome = {
    result: FanoutView | null;
    notice: string;
};

// The compact, truthful link back to the round-1 provenance a re-fan iterated from —
// mirrors the backend ReFanProvenanceLink. `assistedPaths` is present only when round 1
// had LLM-assisted merges (never fabricated).
type ReFanProvenanceLink = {
    fromTaskGroup: string | null;
    sourceCount: number;
    fileCount: number;
    assistedPaths?: string[];
};

// The projected outcome of a SECOND-ROUND re-fan. `refused:true` means round 1 never
// converged — the reason is surfaced VERBATIM and `newTaskGroup`/`converged` stay null
// (no fabricated base or branch). A resolved re-fan carries the round-1 link plus the new
// second-round group + its own converge branch (or `converged:null` + a truthful reason).
type ReFanView = {
    refused: boolean;
    priorTaskGroup: string;
    newTaskGroup: string | null;
    converged: { workspaceId: string; branch: string } | null;
    convergeReason: string;
    reason: string;
    provenanceLink: ReFanProvenanceLink | null;
    perAgent: FanoutAgentResult[];
};

// The normalized outcome of ONE governed re-fan.
type ReFanOutcome = {
    result: ReFanView | null;
    notice: string;
};

// Truthful line when the cockpit read succeeds but resolves no group (unknown /
// unowned / no siblings yet) — a miss, never a fabricated cockpit.
const NoGroupNotice = "No convergence group found — fan a task out to N agents to open the cockpit.";

// Truthful line when the launch form is missing the governed context the tool requires.
const MissingContextNotice = "Repo path, space, and project are required to fan out.";

// Truthful line when a re-fan is attempted with no round-1 group pinned — a re-fan
// iterates a PRIOR convergence, so it has nothing to iterate from without one.
const NoPinnedGroupNotice = "Pin a round-1 task group first — re-fan iterates a prior convergence.";

class RecoderFanoutViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;
    taskGroupAtom: PrimitiveAtom<string>;
    snapshotAtom: PrimitiveAtom<CockpitView | null>;
    noticeAtom: PrimitiveAtom<string>;
    errorAtom: PrimitiveAtom<string>;
    loadingAtom: PrimitiveAtom<boolean>;
    connectedAtom: PrimitiveAtom<boolean>;

    launchTaskAtom: PrimitiveAtom<string>;
    launchKindsAtom: PrimitiveAtom<string[]>;
    repoPathAtom: PrimitiveAtom<string>;
    spaceIdAtom: PrimitiveAtom<string>;
    projectIdAtom: PrimitiveAtom<string>;
    launchingAtom: PrimitiveAtom<boolean>;
    launchNoticeAtom: PrimitiveAtom<string>;
    launchResultAtom: PrimitiveAtom<FanoutView | null>;

    refanTaskAtom: PrimitiveAtom<string>;
    refanKindsAtom: PrimitiveAtom<string[]>;
    refanningAtom: PrimitiveAtom<boolean>;
    refanNoticeAtom: PrimitiveAtom<string>;
    refanResultAtom: PrimitiveAtom<ReFanView | null>;

    convergingAtom: PrimitiveAtom<boolean>;
    convergeNoticeAtom: PrimitiveAtom<string>;
    convergedAtom: PrimitiveAtom<ConvergedBranch | null>;
    // The dev's per-contested-path pick: path → a sibling workspaceId (that whole
    // file wins), or the @synthesize / @assisted sentinel. Non-synthesizable
    // contested paths REQUIRE an entry here before converge can resolve them.
    contestedSelectionAtom: PrimitiveAtom<Record<string, string>>;

    knownKinds: readonly string[];
    minAgents: number;
    maxAgents: number;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder-fanout";
        this.viewIcon = atom("code-fork");
        this.viewName = atom("Converge Fan-out");
        this.taskGroupAtom = atom("") as PrimitiveAtom<string>;
        this.snapshotAtom = atom(null) as PrimitiveAtom<CockpitView | null>;
        this.noticeAtom = atom("") as PrimitiveAtom<string>;
        this.errorAtom = atom("") as PrimitiveAtom<string>;
        this.loadingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.connectedAtom = atom(false) as PrimitiveAtom<boolean>;

        this.launchTaskAtom = atom("") as PrimitiveAtom<string>;
        this.launchKindsAtom = atom([]) as PrimitiveAtom<string[]>;
        this.repoPathAtom = atom("") as PrimitiveAtom<string>;
        this.spaceIdAtom = atom("") as PrimitiveAtom<string>;
        this.projectIdAtom = atom("") as PrimitiveAtom<string>;
        this.launchingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.launchNoticeAtom = atom("") as PrimitiveAtom<string>;
        this.launchResultAtom = atom(null) as PrimitiveAtom<FanoutView | null>;

        this.refanTaskAtom = atom("") as PrimitiveAtom<string>;
        this.refanKindsAtom = atom([]) as PrimitiveAtom<string[]>;
        this.refanningAtom = atom(false) as PrimitiveAtom<boolean>;
        this.refanNoticeAtom = atom("") as PrimitiveAtom<string>;
        this.refanResultAtom = atom(null) as PrimitiveAtom<ReFanView | null>;

        this.convergingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.convergeNoticeAtom = atom("") as PrimitiveAtom<string>;
        this.convergedAtom = atom(null) as PrimitiveAtom<ConvergedBranch | null>;
        this.contestedSelectionAtom = atom({}) as PrimitiveAtom<Record<string, string>>;

        this.knownKinds = KnownAgentKinds;
        this.minAgents = MinFanoutAgents;
        this.maxAgents = MaxFanoutAgents;
    }

    get viewComponent(): ViewComponent {
        return RecoderFanoutView;
    }

    setTaskGroup(value: string) {
        globalStore.set(this.taskGroupAtom, value);
        this.resetConverge();
    }

    // Drop any post-launch-settle compose state — a new/switched group has NOT been
    // composed here, so the review affordance and pending/notice state must not carry over.
    resetConverge() {
        globalStore.set(this.convergedAtom, null);
        globalStore.set(this.convergeNoticeAtom, "");
        globalStore.set(this.convergingAtom, false);
        globalStore.set(this.contestedSelectionAtom, {});
    }

    // Record the dev's pick for ONE contested path — a sibling workspaceId (that
    // whole file wins), or the @synthesize / @assisted sentinel. An empty value
    // CLEARS the pick (back to "needs a decision"). Immutable update; an unknown
    // value is still stored (the server validates the selection), but the picker
    // only ever offers real sibling ids + the sentinels.
    setContestedSelection(path: string, value: string) {
        const key = typeof path == "string" ? path.trim() : "";
        if (key == "") {
            return;
        }
        const current = globalStore.get(this.contestedSelectionAtom);
        const next = { ...current };
        if (typeof value == "string" && value.trim() != "") {
            next[key] = value.trim();
        } else {
            delete next[key];
        }
        globalStore.set(this.contestedSelectionAtom, next);
    }

    setLaunchTask(value: string) {
        globalStore.set(this.launchTaskAtom, value);
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

    // Toggle one agent kind in the launch set (kept ≤ maxAgents; unknown kinds ignored).
    toggleKind(kind: string) {
        if (!this.knownKinds.includes(kind)) {
            return;
        }
        const current = globalStore.get(this.launchKindsAtom);
        if (current.includes(kind)) {
            globalStore.set(this.launchKindsAtom, current.filter((k) => k != kind));
            return;
        }
        if (current.length >= this.maxAgents) {
            return;
        }
        globalStore.set(this.launchKindsAtom, [...current, kind]);
    }

    // Load the LIVE cockpit for a taskGroup over the governed MCP edge. Empty group
    // clears the panel without a request. Degrade-truthful: a non-2xx / denied gate /
    // miss each surface an explicit honest notice with NO fabricated snapshot; a
    // transport throw surfaces "Not connected."; a degraded snapshot keeps its real
    // settle counts + the backend's reason.
    async loadCockpit(taskGroup?: string) {
        const group = (taskGroup ?? globalStore.get(this.taskGroupAtom)).trim();
        if (group == "") {
            globalStore.set(this.snapshotAtom, null);
            globalStore.set(this.noticeAtom, "");
            globalStore.set(this.errorAtom, "");
            return;
        }
        globalStore.set(this.loadingAtom, true);
        globalStore.set(this.errorAtom, "");
        globalStore.set(this.noticeAtom, "");
        try {
            const outcome = await fetchCockpit(getRecoderBackendUrl(), group);
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

    // Fan ONE task out to N agents over the governed MCP edge. The governed context
    // (repoPath / spaceId / projectId) rides the form atoms. Fail-fast + truthful: a
    // too-small kind set or missing context sets a notice and posts NOTHING; a denied
    // gate / validation refusal surfaces the reason verbatim; a transport throw shows
    // "Not connected."; the taskGroup of a real launch is pinned so the cockpit opens.
    async launch(task: string, agentKinds: string[]) {
        const trimmedTask = task.trim();
        const kinds = dedupeKinds(agentKinds, this.knownKinds);
        globalStore.set(this.launchNoticeAtom, "");
        globalStore.set(this.launchResultAtom, null);
        this.resetConverge();
        if (trimmedTask == "") {
            globalStore.set(this.launchNoticeAtom, "A task description is required to fan out.");
            return;
        }
        if (kinds.length < this.minAgents) {
            globalStore.set(this.launchNoticeAtom, `Pick at least ${this.minAgents} distinct agents to fan out.`);
            return;
        }
        const repoPath = globalStore.get(this.repoPathAtom).trim();
        const spaceId = globalStore.get(this.spaceIdAtom).trim();
        const projectId = globalStore.get(this.projectIdAtom).trim();
        if (repoPath == "" || spaceId == "" || projectId == "") {
            globalStore.set(this.launchNoticeAtom, MissingContextNotice);
            return;
        }
        globalStore.set(this.launchingAtom, true);
        try {
            const outcome = await fetchFanout(getRecoderBackendUrl(), {
                task: trimmedTask,
                agentKinds: kinds.slice(0, this.maxAgents),
                repoPath,
                spaceId,
                projectId,
            });
            globalStore.set(this.launchResultAtom, outcome.result);
            globalStore.set(this.launchNoticeAtom, outcome.notice);
            globalStore.set(this.connectedAtom, true);
            if (outcome.result != null && outcome.result.taskGroup != "") {
                globalStore.set(this.taskGroupAtom, outcome.result.taskGroup);
                await this.loadCockpit(outcome.result.taskGroup);
            }
        } catch {
            globalStore.set(this.launchResultAtom, null);
            globalStore.set(this.launchNoticeAtom, "Not connected.");
            globalStore.set(this.connectedAtom, false);
        } finally {
            globalStore.set(this.launchingAtom, false);
        }
    }

    setRefanTask(value: string) {
        globalStore.set(this.refanTaskAtom, value);
    }

    // Toggle one agent kind in the re-fan set (kept ≤ maxAgents; unknown kinds ignored).
    toggleRefanKind(kind: string) {
        if (!this.knownKinds.includes(kind)) {
            return;
        }
        const current = globalStore.get(this.refanKindsAtom);
        if (current.includes(kind)) {
            globalStore.set(this.refanKindsAtom, current.filter((k) => k != kind));
            return;
        }
        if (current.length >= this.maxAgents) {
            return;
        }
        globalStore.set(this.refanKindsAtom, [...current, kind]);
    }

    // Re-fan the CURRENTLY PINNED round-1 group: take its converged branch as the new base
    // and fan a NARROWED task to N fresh agents over the governed MCP edge. Fail-fast +
    // truthful, mirroring launch(): no pinned group / empty task / too-small kind set /
    // missing context each set a notice and post NOTHING; a no-prior-convergence refusal
    // surfaces the reason VERBATIM (never a fabricated branch); a denied gate / non-2xx /
    // validation refusal surfaces its reason; a transport throw shows "Not connected.". On
    // a resolved re-fan the NEW second-round group is pinned so the cockpit follows round 2.
    async reFan(narrowedTask: string, agentKinds: string[]) {
        const priorTaskGroup = globalStore.get(this.taskGroupAtom).trim();
        const trimmedTask = narrowedTask.trim();
        const kinds = dedupeKinds(agentKinds, this.knownKinds);
        globalStore.set(this.refanNoticeAtom, "");
        globalStore.set(this.refanResultAtom, null);
        this.resetConverge();
        if (priorTaskGroup == "") {
            globalStore.set(this.refanNoticeAtom, NoPinnedGroupNotice);
            return;
        }
        if (trimmedTask == "") {
            globalStore.set(this.refanNoticeAtom, "A narrowed task is required to re-fan.");
            return;
        }
        if (kinds.length < this.minAgents) {
            globalStore.set(this.refanNoticeAtom, `Pick at least ${this.minAgents} distinct agents to re-fan.`);
            return;
        }
        const repoPath = globalStore.get(this.repoPathAtom).trim();
        const spaceId = globalStore.get(this.spaceIdAtom).trim();
        const projectId = globalStore.get(this.projectIdAtom).trim();
        if (repoPath == "" || spaceId == "" || projectId == "") {
            globalStore.set(this.refanNoticeAtom, MissingContextNotice);
            return;
        }
        globalStore.set(this.refanningAtom, true);
        try {
            const outcome = await fetchReFan(getRecoderBackendUrl(), {
                taskGroup: priorTaskGroup,
                narrowedTask: trimmedTask,
                agentKinds: kinds.slice(0, this.maxAgents),
                repoPath,
                spaceId,
                projectId,
            });
            globalStore.set(this.refanResultAtom, outcome.result);
            globalStore.set(this.refanNoticeAtom, outcome.notice);
            globalStore.set(this.connectedAtom, true);
            if (
                outcome.result != null &&
                !outcome.result.refused &&
                outcome.result.newTaskGroup != null &&
                outcome.result.newTaskGroup != ""
            ) {
                globalStore.set(this.taskGroupAtom, outcome.result.newTaskGroup);
                await this.loadCockpit(outcome.result.newTaskGroup);
            }
        } catch {
            globalStore.set(this.refanResultAtom, null);
            globalStore.set(this.refanNoticeAtom, "Not connected.");
            globalStore.set(this.connectedAtom, false);
        } finally {
            globalStore.set(this.refanningAtom, false);
        }
    }

    // Compose the PINNED group's settled siblings into a reviewable converged branch —
    // the post-launch-settle case where agents settled AFTER the launch-time converge
    // window, so the cockpit flips to `convergeReady` but nothing has been composed yet.
    // No-op unless the live snapshot is `convergeReady` AND nothing has been composed here
    // (an already-converged group / a not-ready group posts NOTHING). The selection mirrors
    // the converge panel's auto-resolve: every synthesizable contested path is SYNTHESIZEd
    // (a convergeReady snapshot never carries a needs-pick path). Truthful: a real compose
    // pins the converged branch + review affordance; a refusal/denial/transport failure
    // surfaces the backend's verbatim reason and NEVER fabricates a branch.
    async converge() {
        const snapshot = globalStore.get(this.snapshotAtom);
        const taskGroup = globalStore.get(this.taskGroupAtom).trim();
        if (snapshot == null || !snapshot.convergeReady || taskGroup == "") {
            return;
        }
        if (globalStore.get(this.convergedAtom) != null || globalStore.get(this.convergingAtom)) {
            return;
        }
        const userSelection = globalStore.get(this.contestedSelectionAtom);
        const { selection, unresolved } = resolveConvergeSelection(snapshot.contested, userSelection);
        if (unresolved.length > 0) {
            // Truthful: never invent a winner. Tell the dev exactly which contested
            // files still need a pick instead of firing a converge that the server
            // would reject as UNRESOLVED.
            const shown = unresolved.slice(0, 3).join(", ");
            const more = unresolved.length > 3 ? ` (+${unresolved.length - 3} more)` : "";
            globalStore.set(
                this.convergeNoticeAtom,
                `${unresolved.length} contested file${unresolved.length == 1 ? "" : "s"} need a pick: ${shown}${more}`,
            );
            return;
        }
        globalStore.set(this.convergingAtom, true);
        globalStore.set(this.convergeNoticeAtom, "");
        try {
            const result = await composeConvergence(taskGroup, selection);
            if (result.ok && typeof result.workspaceId == "string" && result.workspaceId != "") {
                globalStore.set(this.convergedAtom, {
                    workspaceId: result.workspaceId,
                    branch: typeof result.branch == "string" ? result.branch : "",
                });
                globalStore.set(this.convergeNoticeAtom, "");
                globalStore.set(this.connectedAtom, true);
                return;
            }
            globalStore.set(this.convergeNoticeAtom, result.error || "Nothing was converged.");
        } finally {
            globalStore.set(this.convergingAtom, false);
        }
    }

    // Open the recoder-diff Review surface for a converged workspace — the SAME
    // createBlock affordance the hub's openReview uses, so the composed branch stops
    // dead-ending and flows into review + createPr. Fire-and-forget + degrade-safe:
    // an empty id opens nothing, a failed open never crashes the cockpit.
    openConvergedReview(workspaceId: string) {
        const id = typeof workspaceId == "string" ? workspaceId.trim() : "";
        if (id == "") {
            return;
        }
        const meta: Record<string, unknown> = { view: "recoder-diff", "recoder:workspaceid": id };
        void createBlock({ meta }).catch(() => {});
    }

    // The delay (ms) until the next cockpit poll, from the CURRENT snapshot/converged
    // state — fast while panes work, normal once settled, 0 (stop) once converged.
    nextCockpitPollDelay(): number {
        return cockpitPollDelayMs(globalStore.get(this.snapshotAtom), globalStore.get(this.convergedAtom));
    }
}

// Resolve the converge selection from the dev's per-path picks. A contested path
// resolves when the dev picked a winner/sentinel for it; else a SYNTHESIZABLE path
// falls back to an automatic 3-way merge (@synthesize); else it is UNRESOLVED — a
// truthful "you must decide", never an invented winner. Pure + order-stable so the
// caller can both post the selection and tell the dev what still needs a pick.
export function resolveConvergeSelection(
    contested: readonly CockpitContested[],
    userSelection: Record<string, string>,
): { selection: Record<string, string>; unresolved: string[] } {
    const selection: Record<string, string> = {};
    const unresolved: string[] = [];
    for (const c of contested) {
        const picked = userSelection[c.path];
        if (typeof picked == "string" && picked.trim() != "") {
            selection[c.path] = picked.trim();
        } else if (c.synthesizable) {
            selection[c.path] = SYNTHESIZE_VALUE;
        } else {
            unresolved.push(c.path);
        }
    }
    return { selection, unresolved };
}

// Poll cadence for the live cockpit. FAST while any pane is still working — a
// Blocked→Done flip is imminent, so the "never hunt for the stuck one" surface must
// feel live; NORMAL once every pane has settled; and STOP once the group converged
// (the composed branch is terminal — nothing changes after it, so we quit polling).
const COCKPIT_POLL_FAST_MS = 2500;
const COCKPIT_POLL_NORMAL_MS = 6000;

// Pure poll-delay decision so the cadence is unit-proven without React/timers. A
// delay of 0 means "stop polling".
export function cockpitPollDelayMs(snapshot: CockpitView | null, converged: ConvergedBranch | null): number {
    if (converged != null) {
        return 0;
    }
    if (snapshot != null && snapshot.settledCount < snapshot.totalCount) {
        return COCKPIT_POLL_FAST_MS;
    }
    return COCKPIT_POLL_NORMAL_MS;
}

// --- cockpit projection ------------------------------------------------------

// Run ONE governed cockpit read. A non-2xx yields a truthful notice; otherwise the
// wire is branched by gate status and by the tool payload's own truthful shape
// ({ snapshot } / { error }). Throws only on transport failure so the caller renders
// "Not connected.".
async function fetchCockpit(base: string, taskGroup: string): Promise<CockpitOutcome> {
    const res = await fetch(`${base}/api/mcp/tools/conductor/recoder_converge_cockpit/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ args: { taskGroup } }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
        return { snapshot: null, notice: readErrorReason(body) || `Cockpit unavailable (${res.status})` };
    }
    return projectCockpitWire(body);
}

// Branch on the governed edge's `data.status` (completed vs denied/needs_approval/
// failed) AND on the tool payload's own truthful shape. A denial/approval reason is
// surfaced verbatim; a completed `{ snapshot:null }` is a truthful miss; a completed
// snapshot is projected (a degraded snapshot keeps its real settle counts + reason).
function projectCockpitWire(body: unknown): CockpitOutcome {
    const data = asRecord((body as { data?: unknown } | null)?.data);
    const status = typeof data.status == "string" ? data.status : "";
    if (status != "completed") {
        return { snapshot: null, notice: gateDegradeNotice(status, data.reason) };
    }
    const result = asRecord(data.result);
    if (typeof result.error == "string" && result.error != "") {
        return { snapshot: null, notice: result.error };
    }
    if (result.snapshot == null) {
        return { snapshot: null, notice: NoGroupNotice };
    }
    const snapshot = projectSnapshot(result.snapshot);
    return { snapshot, notice: snapshot.degraded ? snapshot.reason : "" };
}

function gateDegradeNotice(status: string, reason: unknown): string {
    const r = typeof reason == "string" ? reason : "";
    if (status == "needs_approval") {
        return r || "Cockpit read is pending approval.";
    }
    if (status == "denied") {
        return r || "Cockpit read was not permitted by policy.";
    }
    return r || "Convergence cockpit unavailable.";
}

// Project the (untrusted) snapshot wire into the terminal view model. Counts are read
// as finite numbers or 0 — never fabricated. A missing `degraded` flag reads false.
function projectSnapshot(value: unknown): CockpitView {
    const s = asRecord(value);
    const agents = projectAgents(s.agents);
    const contested = projectContested(s.contested);
    return {
        taskGroup: typeof s.taskGroup == "string" ? s.taskGroup : null,
        agents,
        settledCount: num(s.settledCount),
        totalCount: num(s.totalCount),
        contested,
        autoMergeableCount: num(s.autoMergeableCount),
        needsPickCount: num(s.needsPickCount),
        cleanCount: num(s.cleanCount),
        fileVersions: projectFileVersions(s.fileVersions),
        convergeReady: s.convergeReady === true,
        summaryLine: typeof s.summaryLine == "string" ? s.summaryLine : "",
        degraded: s.degraded === true,
        reason: typeof s.reason == "string" ? s.reason : "",
    };
}

function projectAgents(value: unknown): CockpitAgent[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const out: CockpitAgent[] = [];
    for (const raw of value) {
        const a = asRecord(raw);
        const workspaceId = typeof a.workspaceId == "string" ? a.workspaceId : "";
        const kind = typeof a.kind == "string" ? a.kind : "";
        if (workspaceId == "" && kind == "") {
            continue;
        }
        out.push({
            workspaceId,
            kind,
            state: typeof a.state == "string" ? a.state : "unknown",
            settled: a.settled === true,
            nativeStatus: a.nativeStatus === true,
        });
    }
    return out;
}

function projectContested(value: unknown): CockpitContested[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const out: CockpitContested[] = [];
    for (const raw of value) {
        const c = asRecord(raw);
        const path = typeof c.path == "string" ? c.path : "";
        if (path == "") {
            continue;
        }
        const agents = Array.isArray(c.agents) ? c.agents.filter((x): x is string => typeof x == "string") : [];
        const entry: CockpitContested = { path, agents, synthesizable: c.synthesizable === true };
        const reason = typeof c.reason == "string" && c.reason != "" ? c.reason : "";
        out.push(reason == "" ? entry : { ...entry, reason });
    }
    return out;
}

function projectFileVersions(value: unknown): FileVersionsView[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const out: FileVersionsView[] = [];
    for (const raw of value) {
        const f = asRecord(raw);
        const path = typeof f.path == "string" ? f.path : "";
        if (path == "") {
            continue;
        }
        out.push({
            path,
            base: typeof f.base == "string" ? f.base : null,
            ...(f.baseTruncated === true ? { baseTruncated: true } : {}),
            versions: projectFileVersionEntries(f.versions),
        });
    }
    return out;
}

function projectFileVersionEntries(value: unknown): FileVersionEntry[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const out: FileVersionEntry[] = [];
    for (const raw of value) {
        const v = asRecord(raw);
        const workspaceId = typeof v.workspaceId == "string" ? v.workspaceId : "";
        if (workspaceId == "") {
            continue;
        }
        const entry: FileVersionEntry = {
            workspaceId,
            agent: typeof v.agent == "string" ? v.agent : "",
            content: typeof v.content == "string" ? v.content : null,
        };
        const reason = typeof v.reason == "string" && v.reason != "" ? v.reason : "";
        out.push({
            ...entry,
            ...(reason == "" ? {} : { reason }),
            ...(v.truncated === true ? { truncated: true } : {}),
        });
    }
    return out;
}

// --- fan-out projection ------------------------------------------------------

// Run ONE governed fan-out launch. A non-2xx yields a truthful notice; otherwise the
// wire is branched by gate status and by the tool's own input-error shape
// ({ ok:false, error }). Throws only on transport failure.
async function fetchFanout(
    base: string,
    args: { task: string; agentKinds: string[]; repoPath: string; spaceId: string; projectId: string }
): Promise<FanoutOutcome> {
    const res = await fetch(`${base}/api/mcp/tools/conductor/recoder_converge_fanout/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ args }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
        return { result: null, notice: readErrorReason(body) || `Fan-out unavailable (${res.status})` };
    }
    return projectFanoutWire(body);
}

function projectFanoutWire(body: unknown): FanoutOutcome {
    const data = asRecord((body as { data?: unknown } | null)?.data);
    const status = typeof data.status == "string" ? data.status : "";
    if (status != "completed") {
        return { result: null, notice: gateDegradeNotice(status, data.reason) };
    }
    const result = asRecord(data.result);
    // The tool fails input validation with { ok:false, error } (no fan-out started).
    if (result.ok === false && typeof result.error == "string") {
        return { result: null, notice: result.error };
    }
    if (typeof result.taskGroup != "string" || result.taskGroup == "") {
        return { result: null, notice: "Fan-out returned no task group." };
    }
    const view = projectFanout(result);
    const notice = view.converged == null ? view.convergeReason || "Nothing was converged." : "";
    return { result: view, notice };
}

function projectFanout(result: Record<string, unknown>): FanoutView {
    const workspaceIds = Array.isArray(result.workspaceIds)
        ? result.workspaceIds.filter((x): x is string => typeof x == "string")
        : [];
    const converged = asRecord(result.converged);
    const convergedView =
        typeof converged.workspaceId == "string" && typeof converged.branch == "string"
            ? { workspaceId: converged.workspaceId, branch: converged.branch }
            : null;
    return {
        taskGroup: String(result.taskGroup),
        workspaceIds,
        converged: convergedView,
        convergeReason: typeof result.convergeReason == "string" ? result.convergeReason : "",
        perAgent: projectPerAgent(result.perAgent),
    };
}

function projectPerAgent(value: unknown): FanoutAgentResult[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const out: FanoutAgentResult[] = [];
    for (const raw of value) {
        const a = asRecord(raw);
        const kind = typeof a.kind == "string" ? a.kind : "";
        if (kind == "") {
            continue;
        }
        const state = typeof a.state == "string" && a.state != "" ? a.state : "";
        out.push({
            kind,
            nativeStatus: a.nativeStatus === true,
            workspaceId: typeof a.workspaceId == "string" ? a.workspaceId : null,
            settled: a.settled === true,
            reason: typeof a.reason == "string" ? a.reason : "",
            ...(state == "" ? {} : { state }),
        });
    }
    return out;
}

// --- re-fan projection -------------------------------------------------------

// Run ONE governed re-fan. A non-2xx yields a truthful notice; otherwise the wire is
// branched by gate status and by the tool's own truthful shapes ({ error } input refusal,
// { refused:true } no-prior-convergence refusal, or a resolved ReFanResult). Throws only
// on transport failure so the caller renders "Not connected.".
async function fetchReFan(
    base: string,
    args: {
        taskGroup: string;
        narrowedTask: string;
        agentKinds: string[];
        repoPath: string;
        spaceId: string;
        projectId: string;
    }
): Promise<ReFanOutcome> {
    const res = await fetch(`${base}/api/mcp/tools/conductor/recoder_converge_refan/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ args }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
        return { result: null, notice: readErrorReason(body) || `Re-fan unavailable (${res.status})` };
    }
    return projectReFanWire(body);
}

function projectReFanWire(body: unknown): ReFanOutcome {
    const data = asRecord((body as { data?: unknown } | null)?.data);
    const status = typeof data.status == "string" ? data.status : "";
    if (status != "completed") {
        return { result: null, notice: gateDegradeNotice(status, data.reason) };
    }
    const result = asRecord(data.result);
    // The tool fails input validation with a bare { error } (no re-fan started).
    if (typeof result.error == "string" && result.error != "") {
        return { result: null, notice: result.error };
    }
    // A group with NO prior convergence is a truthful refusal — surface the reason
    // VERBATIM and NEVER fabricate a base/branch.
    if (result.refused === true) {
        const reason = typeof result.reason == "string" ? result.reason : "";
        const priorTaskGroup = typeof result.priorTaskGroup == "string" ? result.priorTaskGroup : "";
        return {
            result: {
                refused: true,
                priorTaskGroup,
                newTaskGroup: null,
                converged: null,
                convergeReason: "",
                reason,
                provenanceLink: null,
                perAgent: [],
            },
            notice: reason || "Re-fan refused: no prior convergence.",
        };
    }
    if (typeof result.taskGroup != "string" || result.taskGroup == "") {
        return { result: null, notice: "Re-fan returned no task group." };
    }
    const view = projectReFan(result);
    const notice = view.converged == null ? view.convergeReason || "Nothing was converged." : "";
    return { result: view, notice };
}

function projectReFan(result: Record<string, unknown>): ReFanView {
    const converged = asRecord(result.converged);
    const convergedView =
        typeof converged.workspaceId == "string" && typeof converged.branch == "string"
            ? { workspaceId: converged.workspaceId, branch: converged.branch }
            : null;
    return {
        refused: false,
        priorTaskGroup: typeof result.priorTaskGroup == "string" ? result.priorTaskGroup : "",
        newTaskGroup: String(result.taskGroup),
        converged: convergedView,
        convergeReason: typeof result.convergeReason == "string" ? result.convergeReason : "",
        reason: "",
        provenanceLink: projectProvenanceLink(result.provenanceLink),
        perAgent: projectPerAgent(result.perAgent),
    };
}

function projectProvenanceLink(value: unknown): ReFanProvenanceLink | null {
    if (value == null || typeof value != "object") {
        return null;
    }
    const p = asRecord(value);
    const assisted = Array.isArray(p.assistedPaths)
        ? p.assistedPaths.filter((x): x is string => typeof x == "string")
        : [];
    return {
        fromTaskGroup: typeof p.fromTaskGroup == "string" ? p.fromTaskGroup : null,
        sourceCount: num(p.sourceCount),
        fileCount: num(p.fileCount),
        ...(assisted.length > 0 ? { assistedPaths: assisted } : {}),
    };
}

// --- helpers -----------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> {
    return value != null && typeof value == "object" ? (value as Record<string, unknown>) : {};
}

function num(value: unknown): number {
    return typeof value == "number" && Number.isFinite(value) ? value : 0;
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
    RecoderFanoutViewModel,
    KnownAgentKinds,
    LoomNativeKinds,
    LoomFallbackKinds,
    MinFanoutAgents,
    MaxFanoutAgents,
    type CockpitAgent,
    type CockpitContested,
    type CockpitView,
    type ConvergedBranch,
    type FanoutAgentResult,
    type FanoutView,
    type FileVersionEntry,
    type FileVersionsView,
    type ReFanProvenanceLink,
    type ReFanView,
};
