// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { getRecoderBackendUrl } from "../recoder/recoder-endpoints";
import { readErrorReason } from "../recoder/recoder-errors";
import { RecoderCoworkerView } from "./recoder-coworker";

// Mirrors backend/src/domains/agent-os/services/coworker.service.ts's wire shapes
// (CoworkerActionPayload / CoworkerActionRecord / CoworkerTaskRecord) — the Recoder
// Coworker: an AI teammate that proposes ONE action at a time (shell / file / browser)
// inside its own sandbox, and asks for a one-click approval before it runs.
type CoworkerActionKind = "shell" | "write_file" | "read_file" | "browser_navigate" | "finish";

type CoworkerActionPayload =
    | { kind: "shell"; command: string }
    | { kind: "write_file"; path: string; content: string }
    | { kind: "read_file"; path: string }
    | { kind: "browser_navigate"; url: string }
    | { kind: "finish"; summary: string };

type CoworkerActionStatus = "awaiting_approval" | "approved" | "denied" | "executed" | "failed";

type CoworkerActionResult = {
    stdout?: string;
    stderr?: string;
    exitCode?: number | null;
    content?: string;
    written?: boolean;
    url?: string;
    title?: string;
    text?: string;
    driver?: string;
};

type CoworkerActionView = {
    id: string;
    step: number;
    kind: CoworkerActionKind;
    payload: CoworkerActionPayload;
    reason: string;
    riskTier: string;
    status: CoworkerActionStatus;
    result?: CoworkerActionResult;
    error?: string;
    createdAt: string;
};

type CoworkerTaskStatus = "running" | "awaiting_approval" | "completed" | "denied" | "failed" | "blocked" | "cancelled";

type CoworkerTaskView = {
    id: string;
    goal: string;
    status: CoworkerTaskStatus;
    statusReason?: string;
    actions: CoworkerActionView[];
    createdAt: string;
    updatedAt: string;
};

const NotConnectedNotice = "Not connected.";
const POLL_MS = 3000;
const ACTIVE_STATUSES: readonly CoworkerTaskStatus[] = ["running", "awaiting_approval"];

function coworkerUrl(path: string): string {
    return `${getRecoderBackendUrl()}/api/agent-os/coworker${path}`;
}

class RecoderCoworkerViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;

    goalInputAtom: PrimitiveAtom<string>;
    creatingAtom: PrimitiveAtom<boolean>;
    createErrorAtom: PrimitiveAtom<string>;
    tasksAtom: PrimitiveAtom<CoworkerTaskView[]>;
    selectedTaskIdAtom: PrimitiveAtom<string>;
    decidingActionIdAtom: PrimitiveAtom<string>;
    decideErrorAtom: PrimitiveAtom<string>;
    loadingAtom: PrimitiveAtom<boolean>;
    connectedAtom: PrimitiveAtom<boolean>;
    errorAtom: PrimitiveAtom<string>;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder-coworker";
        this.viewIcon = atom("user-robot");
        this.viewName = atom("Coworker");
        this.goalInputAtom = atom("") as PrimitiveAtom<string>;
        this.creatingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.createErrorAtom = atom("") as PrimitiveAtom<string>;
        this.tasksAtom = atom([]) as PrimitiveAtom<CoworkerTaskView[]>;
        this.selectedTaskIdAtom = atom("") as PrimitiveAtom<string>;
        this.decidingActionIdAtom = atom("") as PrimitiveAtom<string>;
        this.decideErrorAtom = atom("") as PrimitiveAtom<string>;
        this.loadingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.connectedAtom = atom(false) as PrimitiveAtom<boolean>;
        this.errorAtom = atom("") as PrimitiveAtom<string>;
    }

    get viewComponent(): ViewComponent {
        return RecoderCoworkerView;
    }

    // Degrade-truthful: an unreachable backend clears the list and shows "Not
    // connected." rather than a fabricated empty-but-fine state; a non-2xx
    // surfaces the real backend reason.
    async refreshTasks() {
        globalStore.set(this.loadingAtom, true);
        globalStore.set(this.errorAtom, "");
        try {
            const res = await fetch(coworkerUrl("/tasks"));
            const body = await res.json().catch(() => null);
            if (!res.ok) {
                globalStore.set(this.errorAtom, readErrorReason(body) || `Coworker unavailable (${res.status})`);
                globalStore.set(this.connectedAtom, false);
                return;
            }
            const raw = (body as { data?: { tasks?: unknown } } | null)?.data?.tasks;
            const tasks = projectTasks(raw);
            globalStore.set(this.tasksAtom, tasks);
            globalStore.set(this.connectedAtom, true);
            const selected = globalStore.get(this.selectedTaskIdAtom);
            if (selected == "" && tasks.length > 0) {
                globalStore.set(this.selectedTaskIdAtom, tasks[0]!.id);
            }
        } catch {
            globalStore.set(this.errorAtom, NotConnectedNotice);
            globalStore.set(this.connectedAtom, false);
        } finally {
            globalStore.set(this.loadingAtom, false);
        }
    }

    // Poll just the selected task's detail (its action feed), so an in-flight
    // proposal shows up without the user refreshing the whole list.
    async refreshSelected() {
        const id = globalStore.get(this.selectedTaskIdAtom);
        if (id == "") return;
        try {
            const res = await fetch(coworkerUrl(`/tasks/${encodeURIComponent(id)}`));
            if (!res.ok) return;
            const body = await res.json().catch(() => null);
            const raw = (body as { data?: { task?: unknown } } | null)?.data?.task;
            const task = projectTask(raw);
            if (task == null) return;
            const current = globalStore.get(this.tasksAtom);
            globalStore.set(
                this.tasksAtom,
                current.some((t) => t.id == task.id) ? current.map((t) => (t.id == task.id ? task : t)) : [task, ...current],
            );
        } catch {
            // A transient poll failure keeps the last-known state — never blanks the feed.
        }
    }

    async createTask() {
        const goal = globalStore.get(this.goalInputAtom).trim();
        if (goal == "") return;
        globalStore.set(this.creatingAtom, true);
        globalStore.set(this.createErrorAtom, "");
        try {
            const res = await fetch(coworkerUrl("/tasks"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ goal }),
            });
            const body = await res.json().catch(() => null);
            if (!res.ok) {
                globalStore.set(this.createErrorAtom, readErrorReason(body) || `Could not start the coworker (${res.status})`);
                return;
            }
            const task = projectTask((body as { data?: { task?: unknown } } | null)?.data?.task);
            if (task != null) {
                globalStore.set(this.tasksAtom, [task, ...globalStore.get(this.tasksAtom)]);
                globalStore.set(this.selectedTaskIdAtom, task.id);
                globalStore.set(this.goalInputAtom, "");
            }
        } catch (e) {
            globalStore.set(this.createErrorAtom, e instanceof Error ? e.message : NotConnectedNotice);
        } finally {
            globalStore.set(this.creatingAtom, false);
        }
    }

    async decideAction(actionId: string, decision: "approved" | "denied") {
        const taskId = globalStore.get(this.selectedTaskIdAtom);
        if (taskId == "" || actionId == "") return;
        globalStore.set(this.decidingActionIdAtom, actionId);
        globalStore.set(this.decideErrorAtom, "");
        try {
            const res = await fetch(coworkerUrl(`/tasks/${encodeURIComponent(taskId)}/actions/${encodeURIComponent(actionId)}/decide`), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ decision }),
            });
            const body = await res.json().catch(() => null);
            if (!res.ok) {
                globalStore.set(this.decideErrorAtom, readErrorReason(body) || `Could not record that decision (${res.status})`);
                return;
            }
            const task = projectTask((body as { data?: { task?: unknown } } | null)?.data?.task);
            if (task != null) {
                globalStore.set(this.tasksAtom, globalStore.get(this.tasksAtom).map((t) => (t.id == task.id ? task : t)));
            }
        } catch (e) {
            globalStore.set(this.decideErrorAtom, e instanceof Error ? e.message : NotConnectedNotice);
        } finally {
            globalStore.set(this.decidingActionIdAtom, "");
        }
    }

    async cancelSelected() {
        const taskId = globalStore.get(this.selectedTaskIdAtom);
        if (taskId == "") return;
        try {
            const res = await fetch(coworkerUrl(`/tasks/${encodeURIComponent(taskId)}/cancel`), { method: "POST" });
            const body = await res.json().catch(() => null);
            const task = projectTask((body as { data?: { task?: unknown } } | null)?.data?.task);
            if (res.ok && task != null) {
                globalStore.set(this.tasksAtom, globalStore.get(this.tasksAtom).map((t) => (t.id == task.id ? task : t)));
            }
        } catch {
            // Best-effort: the next poll reconciles the real status either way.
        }
    }

    selectTask(id: string) {
        globalStore.set(this.selectedTaskIdAtom, id);
    }
}

// --- projection (defensive: never trust the wire shape blindly) -------------

function asObject(value: unknown): Record<string, unknown> {
    return value != null && typeof value == "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringOr(value: unknown, fallback: string): string {
    return typeof value == "string" ? value : fallback;
}

function projectPayload(raw: unknown): CoworkerActionPayload {
    const p = asObject(raw);
    const kind = p.kind;
    if (kind == "shell") return { kind: "shell", command: stringOr(p.command, "") };
    if (kind == "write_file") return { kind: "write_file", path: stringOr(p.path, ""), content: stringOr(p.content, "") };
    if (kind == "read_file") return { kind: "read_file", path: stringOr(p.path, "") };
    if (kind == "browser_navigate") return { kind: "browser_navigate", url: stringOr(p.url, "") };
    return { kind: "finish", summary: stringOr(p.summary, "") };
}

function projectResult(raw: unknown): CoworkerActionResult | undefined {
    if (raw == null || typeof raw != "object") return undefined;
    const r = raw as Record<string, unknown>;
    return {
        stdout: typeof r.stdout == "string" ? r.stdout : undefined,
        stderr: typeof r.stderr == "string" ? r.stderr : undefined,
        exitCode: typeof r.exitCode == "number" ? r.exitCode : null,
        content: typeof r.content == "string" ? r.content : undefined,
        written: r.written === true,
        url: typeof r.url == "string" ? r.url : undefined,
        title: typeof r.title == "string" ? r.title : undefined,
        text: typeof r.text == "string" ? r.text : undefined,
        driver: typeof r.driver == "string" ? r.driver : undefined,
    };
}

function projectAction(raw: unknown): CoworkerActionView {
    const a = asObject(raw);
    return {
        id: stringOr(a.id, ""),
        step: typeof a.step == "number" ? a.step : 0,
        kind: (stringOr(a.kind, "shell") as CoworkerActionKind),
        payload: projectPayload(a.payload),
        reason: stringOr(a.reason, ""),
        riskTier: stringOr(a.riskTier, ""),
        status: (stringOr(a.status, "awaiting_approval") as CoworkerActionStatus),
        result: projectResult(a.result),
        error: typeof a.error == "string" ? a.error : undefined,
        createdAt: stringOr(a.createdAt, ""),
    };
}

function projectTask(raw: unknown): CoworkerTaskView | null {
    if (raw == null || typeof raw != "object") return null;
    const t = raw as Record<string, unknown>;
    const id = stringOr(t.id, "");
    if (id == "") return null;
    return {
        id,
        goal: stringOr(t.goal, ""),
        status: (stringOr(t.status, "running") as CoworkerTaskStatus),
        statusReason: typeof t.statusReason == "string" ? t.statusReason : undefined,
        actions: Array.isArray(t.actions) ? t.actions.map(projectAction) : [],
        createdAt: stringOr(t.createdAt, ""),
        updatedAt: stringOr(t.updatedAt, ""),
    };
}

function projectTasks(raw: unknown): CoworkerTaskView[] {
    if (!Array.isArray(raw)) return [];
    return raw.map(projectTask).filter((t): t is CoworkerTaskView => t != null);
}

function isTaskActive(task: CoworkerTaskView): boolean {
    return ACTIVE_STATUSES.includes(task.status);
}

export {
    POLL_MS,
    RecoderCoworkerViewModel,
    isTaskActive,
    type CoworkerActionKind,
    type CoworkerActionPayload,
    type CoworkerActionResult,
    type CoworkerActionStatus,
    type CoworkerActionView,
    type CoworkerTaskStatus,
    type CoworkerTaskView,
};
