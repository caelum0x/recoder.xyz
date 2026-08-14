// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { createBlock, globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { RecoderConnectionModel } from "../recoder/recoder-connection-model";
import { getRecoderBackendUrl } from "../recoder/recoder-endpoints";
import { fetchPreviewVerification } from "../recoder-diff/recoder-evidence-logic";
import { readErrorReason } from "../recoder/recoder-errors";
import {
    correlateRunToWorkspace,
    correlateRuns,
    parseWorkspaceEvents,
    parseWorkspaceList,
    type WorkspaceCorrelation,
} from "./recoder-runs-correlation";
import { parseReconcileFindings, type RunsDriftFinding } from "./recoder-runs-findings";
import { RecoderRunsView } from "./recoder-runs";

// Mirrors the Agent OS TaskRun domain type (packages/agent-os/src/domain/task-spec.ts).
// GET /api/agent-os/runs → { success, data: TaskRun[] }. Only the fields the
// terminal renders are declared.
type RecoderRun = {
    runId: string;
    taskId: string;
    spaceId: string;
    state: string;
    assigneeAgentId?: string;
    startedAt?: string;
    updatedAt: string;
    completedAt?: string;
};

// Mirrors the Agent OS RunEvent domain type (packages/agent-os/src/domain/event.ts).
// GET /api/agent-os/events → { success, data: RunEvent[] }.
type RecoderRunEvent = {
    eventId: string;
    type: string;
    taskId: string;
    runId?: string;
    agentId?: string;
    state?: string;
    message?: string;
    createdAt: string;
};

// The state of the selected-run drilldown events panel. Distinguishes the honest
// reasons the panel may be empty so the view never fakes a transcript:
//   idle           — no run selected
//   loading        — fetching the correlated workspace's events
//   not-correlated — the run has no conductor workspace to stream from
//   not-connected  — the per-workspace events read failed (backend/transport)
//   empty          — correlated + connected, but the run has no events yet
//   ready          — events loaded
type SelectedRunStatus = "idle" | "loading" | "not-correlated" | "not-connected" | "empty" | "ready";

// The compact verdict shown on a correlated run card. `unavailable` is distinct
// from `failed`: the preview read could not prove either result. Uncorrelated
// runs are absent from the map entirely, so they do not claim a verdict.
type PreviewVerificationRunStatus = "passed" | "failed" | "degraded" | "not-verified" | "unavailable";

// Show the most recent events first, capped so the stream stays readable.
const MaxEvents = 40;

// The selected-run transcript reads oldest→newest; cap the tail so a long run
// stays readable without dropping the latest activity.
const MaxSelectedEvents = 100;

class RecoderRunsViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;
    runsAtom: PrimitiveAtom<RecoderRun[]>;
    eventsAtom: PrimitiveAtom<RecoderRunEvent[]>;
    loadingAtom: PrimitiveAtom<boolean>;
    errorAtom: PrimitiveAtom<string>;
    connectedAtom: PrimitiveAtom<boolean>;
    // Correlation state: the live workspace records + a Map<runId, workspaceId> so
    // each row knows whether it can open a Session/Review and drill into events.
    workspacesAtom: PrimitiveAtom<WorkspaceCorrelation[]>;
    correlationAtom: PrimitiveAtom<Map<string, string>>;
    previewStatusAtom: PrimitiveAtom<Map<string, PreviewVerificationRunStatus>>;
    // Reconciler drift findings + a truthful missing-source flag: "unavailable"
    // means the findings read failed, which is NOT the same as a clean [].
    findingsAtom: PrimitiveAtom<RunsDriftFinding[]>;
    findingsStatusAtom: PrimitiveAtom<"ok" | "unavailable">;
    // The run the user drilled into ("" = none) and its per-run events panel.
    selectedRunIdAtom: PrimitiveAtom<string>;
    selectedEventsAtom: PrimitiveAtom<RecoderRunEvent[]>;
    selectedStatusAtom: PrimitiveAtom<SelectedRunStatus>;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder-runs";
        this.viewIcon = atom("wave-square");
        this.viewName = atom("Runs");
        this.runsAtom = atom([]) as PrimitiveAtom<RecoderRun[]>;
        this.eventsAtom = atom([]) as PrimitiveAtom<RecoderRunEvent[]>;
        this.loadingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.errorAtom = atom("") as PrimitiveAtom<string>;
        this.connectedAtom = atom(false) as PrimitiveAtom<boolean>;
        this.workspacesAtom = atom([]) as PrimitiveAtom<WorkspaceCorrelation[]>;
        this.correlationAtom = atom(new Map()) as PrimitiveAtom<Map<string, string>>;
        this.previewStatusAtom = atom(new Map()) as PrimitiveAtom<Map<string, PreviewVerificationRunStatus>>;
        this.findingsAtom = atom([]) as PrimitiveAtom<RunsDriftFinding[]>;
        this.findingsStatusAtom = atom("ok") as PrimitiveAtom<"ok" | "unavailable">;
        this.selectedRunIdAtom = atom("") as PrimitiveAtom<string>;
        this.selectedEventsAtom = atom([]) as PrimitiveAtom<RecoderRunEvent[]>;
        this.selectedStatusAtom = atom("idle") as PrimitiveAtom<SelectedRunStatus>;
    }

    get viewComponent(): ViewComponent {
        return RecoderRunsView;
    }

    // Degrade-safe: any transport failure leaves connected=false so the panel
    // shows a neutral "not connected" message rather than crashing or faking data.
    async refresh() {
        globalStore.set(this.loadingAtom, true);
        globalStore.set(this.errorAtom, "");
        try {
            // Workspaces power correlation only; a workspaces-read failure must NOT
            // fail the runs list, so it degrades to an empty list (rows still render,
            // just without Session/Review affordances) rather than throwing.
            const [runs, events, workspaces, findings] = await Promise.all([
                this.fetchRuns(),
                this.fetchEvents(),
                this.fetchWorkspaces(),
                this.fetchFindings(),
            ]);
            globalStore.set(this.runsAtom, runs);
            globalStore.set(this.eventsAtom, events);
            const correlation = correlateRuns(runs, workspaces);
            globalStore.set(this.workspacesAtom, workspaces);
            globalStore.set(this.correlationAtom, correlation);
            globalStore.set(this.previewStatusAtom, new Map());
            globalStore.set(this.findingsAtom, findings ?? []);
            globalStore.set(this.findingsStatusAtom, findings == null ? "unavailable" : "ok");
            globalStore.set(this.connectedAtom, true);
            RecoderConnectionModel.getInstance().noteRefresh(true);
            // Preview status is an optional read per workspace. Never hold the
            // primary runs list hostage to a slow or unavailable verifier.
            void this.refreshPreviewStatuses(correlation);
            await this.refreshSelectedEvents();
        } catch (e) {
            globalStore.set(this.connectedAtom, false);
            RecoderConnectionModel.getInstance().noteRefresh(false);
            globalStore.set(this.runsAtom, []);
            globalStore.set(this.eventsAtom, []);
            globalStore.set(this.workspacesAtom, []);
            globalStore.set(this.correlationAtom, new Map());
            globalStore.set(this.previewStatusAtom, new Map());
            globalStore.set(this.findingsAtom, []);
            globalStore.set(this.findingsStatusAtom, "unavailable");
            globalStore.set(this.errorAtom, e instanceof Error ? e.message : String(e));
        } finally {
            globalStore.set(this.loadingAtom, false);
        }
    }

    // Degrade-safe: any failure yields [] so correlation simply produces no links
    // (rows stay non-actionable) instead of taking down the whole runs refresh.
    async fetchWorkspaces(): Promise<WorkspaceCorrelation[]> {
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/conductor/workspaces`);
            const body = await res.json().catch(() => null);
            if (!res.ok) {
                return [];
            }
            return parseWorkspaceList(body);
        } catch {
            return [];
        }
    }

    // Degrade-safe like fetchWorkspaces, but null (not []) on failure so the view
    // can show "drift findings unavailable" instead of faking a clean drift state.
    // A findings failure must NEVER fail the runs refresh.
    async fetchFindings(): Promise<RunsDriftFinding[] | null> {
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/conductor/reconcile/findings`);
            const body = await res.json().catch(() => null);
            if (!res.ok) {
                return null;
            }
            return parseReconcileFindings(body);
        } catch {
            return null;
        }
    }

    // Reads each correlated workspace once, even when a legacy correlation makes
    // several runs point at it. The endpoint helper never throws, so an unavailable
    // preview cannot take down the run list or masquerade as a failed verification.
    async fetchPreviewStatuses(
        correlation: ReadonlyMap<string, string>,
    ): Promise<Map<string, PreviewVerificationRunStatus>> {
        const byWorkspace = new Map<string, Promise<PreviewVerificationRunStatus>>();
        for (const workspaceId of correlation.values()) {
            if (!byWorkspace.has(workspaceId)) {
                byWorkspace.set(workspaceId, this.fetchPreviewStatus(workspaceId));
            }
        }
        await Promise.all(byWorkspace.values());
        const statuses = new Map<string, PreviewVerificationRunStatus>();
        for (const [runId, workspaceId] of correlation) {
            statuses.set(runId, await byWorkspace.get(workspaceId)!);
        }
        return statuses;
    }

    // Do not let an older refresh overwrite the cards after a newer correlation
    // has arrived. Map identity is deliberate: each refresh creates one fresh
    // correlation map before starting this optional asynchronous read.
    async refreshPreviewStatuses(correlation: ReadonlyMap<string, string>): Promise<void> {
        const statuses = await this.fetchPreviewStatuses(correlation);
        if (globalStore.get(this.correlationAtom) !== correlation) {
            return;
        }
        globalStore.set(this.previewStatusAtom, statuses);
    }

    async fetchPreviewStatus(workspaceId: string): Promise<PreviewVerificationRunStatus> {
        const result = await fetchPreviewVerification(workspaceId);
        if (!result.ok || result.view == null) {
            return result.reason == "not-verified" ? "not-verified" : "unavailable";
        }
        if (result.view.degraded) {
            return "degraded";
        }
        if (result.view.status == "passed" || result.view.status == "failed") {
            return result.view.status;
        }
        return "unavailable";
    }

    // Look up the workspace a run belongs to from the live workspaces list. Returns
    // "" when the run isn't linked to any workspace (see correlateRunToWorkspace).
    workspaceIdForRun(runId: string): string {
        const run = globalStore.get(this.runsAtom).find((r) => r.runId == runId);
        if (run == null) {
            return "";
        }
        return correlateRunToWorkspace(run, globalStore.get(this.workspacesAtom)) ?? "";
    }

    // Drilldown: select a run (toggle off if it's already selected) and load THAT
    // run's events from its correlated workspace. selectedStatusAtom carries the
    // truthful reason whenever the panel is empty.
    async selectRun(runId: string) {
        const current = globalStore.get(this.selectedRunIdAtom);
        if (current == runId) {
            globalStore.set(this.selectedRunIdAtom, "");
            globalStore.set(this.selectedEventsAtom, []);
            globalStore.set(this.selectedStatusAtom, "idle");
            return;
        }
        globalStore.set(this.selectedRunIdAtom, runId);
        globalStore.set(this.selectedEventsAtom, []);
        await this.refreshSelectedEvents();
    }

    // (Re)load the currently-selected run's per-workspace events. Guards against a
    // stale in-flight fetch by re-checking the selection after the await, so a fast
    // re-select never lets an older response clobber the newer one.
    async refreshSelectedEvents() {
        const runId = globalStore.get(this.selectedRunIdAtom);
        if (runId == "") {
            globalStore.set(this.selectedStatusAtom, "idle");
            globalStore.set(this.selectedEventsAtom, []);
            return;
        }
        const workspaceId = this.workspaceIdForRun(runId);
        if (workspaceId == "") {
            globalStore.set(this.selectedStatusAtom, "not-correlated");
            globalStore.set(this.selectedEventsAtom, []);
            return;
        }
        if (globalStore.get(this.selectedEventsAtom).length == 0) {
            globalStore.set(this.selectedStatusAtom, "loading");
        }
        const events = await this.fetchWorkspaceEvents(workspaceId);
        if (globalStore.get(this.selectedRunIdAtom) != runId) {
            return;
        }
        if (events == null) {
            globalStore.set(this.selectedStatusAtom, "not-connected");
            globalStore.set(this.selectedEventsAtom, []);
            return;
        }
        globalStore.set(this.selectedEventsAtom, events.slice(-MaxSelectedEvents));
        globalStore.set(this.selectedStatusAtom, events.length == 0 ? "empty" : "ready");
    }

    // GET /api/conductor/workspaces/:id/events (oldest→newest). null signals a
    // transport/backend failure (distinct from an empty [] transcript).
    async fetchWorkspaceEvents(workspaceId: string): Promise<RecoderRunEvent[] | null> {
        try {
            const res = await fetch(
                `${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(workspaceId)}/events`,
            );
            const body = await res.json().catch(() => null);
            if (!res.ok) {
                return null;
            }
            return parseWorkspaceEvents(body);
        } catch {
            return null;
        }
    }

    // Open the correlated workspace's Session (live terminal) or Review (diff) as
    // its own block — the same view meta the hub uses. Fire-and-forget from event
    // handlers: a missing correlation is a no-op and a failed open never throws.
    async openRunSession(runId: string) {
        await this.openRunWorkspace(runId, "recoder-terminal");
    }

    async openRunReview(runId: string) {
        await this.openRunWorkspace(runId, "recoder-diff");
    }

    async openRunWorkspace(runId: string, view: string) {
        const workspaceId = this.workspaceIdForRun(runId);
        if (workspaceId == "") {
            return;
        }
        const meta: Record<string, unknown> = { view, "recoder:workspaceid": workspaceId };
        try {
            await createBlock({ meta });
        } catch {
            // degrade-safe: opening a block must never take down the runs view
        }
    }

    async fetchRuns(): Promise<RecoderRun[]> {
        const res = await fetch(`${getRecoderBackendUrl()}/api/agent-os/runs`);
        const body = await res.json().catch(() => null);
        if (!res.ok) {
            throw new Error(readErrorReason(body) || `Request failed (${res.status})`);
        }
        const list = Array.isArray(body?.data) ? (body.data as RecoderRun[]) : [];
        return [...list].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    }

    async fetchEvents(): Promise<RecoderRunEvent[]> {
        const res = await fetch(`${getRecoderBackendUrl()}/api/agent-os/events`);
        const body = await res.json().catch(() => null);
        if (!res.ok) {
            throw new Error(readErrorReason(body) || `Request failed (${res.status})`);
        }
        const list = Array.isArray(body?.data) ? (body.data as RecoderRunEvent[]) : [];
        return [...list].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")).slice(0, MaxEvents);
    }
}

export {
    RecoderRunsViewModel,
    type PreviewVerificationRunStatus,
    type RecoderRun,
    type RecoderRunEvent,
    type SelectedRunStatus,
};
