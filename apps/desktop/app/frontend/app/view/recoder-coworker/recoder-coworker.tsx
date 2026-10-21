// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { RecoderEmpty, RecoderErrorRow, RecoderSkeleton } from "@/app/view/recoder/recoder-states";
import { FIELD_LABEL, INPUT, META, PAGE_TITLE, PRIMARY_BTN, QUIET_BTN, STATE_CHIP } from "@/app/view/recoder/recoder-styles";
import { useAtom, useAtomValue } from "jotai";
import { useEffect } from "react";
import {
    isTaskActive,
    POLL_MS,
    RecoderCoworkerViewModel,
    type CoworkerActionPayload,
    type CoworkerActionView,
    type CoworkerTaskView,
} from "./recoder-coworker-model";

const TASK_LIST_POLL_MS = 6000;

function describePayload(payload: CoworkerActionPayload): string {
    switch (payload.kind) {
        case "shell":
            return payload.command;
        case "write_file":
            return `write ${payload.path}`;
        case "read_file":
            return `read ${payload.path}`;
        case "browser_navigate":
            return payload.url;
        case "finish":
            return payload.summary;
    }
}

function describeResult(action: CoworkerActionView): string {
    const r = action.result;
    if (r == null) return "";
    if (typeof r.exitCode == "number") {
        const out = (r.stdout ?? "").trim();
        const err = (r.stderr ?? "").trim();
        const head = `exit ${r.exitCode}`;
        return [head, out, err].filter((s) => s != "").join(" — ").slice(0, 600);
    }
    if (r.written === true) return "file written";
    if (r.title != null || r.url != null) return [r.title, r.url].filter((s) => s != null && s != "").join(" — ");
    if (r.content != null) return r.content.slice(0, 600);
    return "";
}

function TaskRow({ task, selected, onSelect }: { task: CoworkerTaskView; selected: boolean; onSelect: () => void }) {
    return (
        <button
            className={`flex flex-col items-start gap-0.5 rounded border px-2 py-1.5 text-left cursor-pointer recoder-transition ${
                selected ? "border-accent/50 bg-accent/10" : "border-white/8 hover:bg-white/[0.04]"
            }`}
            onClick={onSelect}
        >
            <div className="flex w-full items-center gap-2">
                <span className="text-sm text-primary truncate">{task.goal}</span>
                <span className={`${STATE_CHIP} ml-auto shrink-0`}>{task.status.replace("_", " ")}</span>
            </div>
            <div className={META}>
                {task.actions.length} {task.actions.length == 1 ? "step" : "steps"}
            </div>
        </button>
    );
}

TaskRow.displayName = "TaskRow";

function ActionCard({
    action,
    deciding,
    onApprove,
    onDeny,
}: {
    action: CoworkerActionView;
    deciding: boolean;
    onApprove: () => void;
    onDeny: () => void;
}) {
    const resultLine = describeResult(action);
    return (
        <div className="flex flex-col gap-1 rounded border border-white/8 p-2">
            <div className="flex items-center gap-2">
                <span className={`${STATE_CHIP} font-mono`}>#{action.step}</span>
                <span className="text-sm font-medium">{action.kind}</span>
                {action.riskTier != "" && <span className={STATE_CHIP}>{action.riskTier}</span>}
                <span className={`${STATE_CHIP} ml-auto`}>{action.status.replace("_", " ")}</span>
            </div>
            <div className="text-xs font-mono text-secondary break-all">{describePayload(action.payload)}</div>
            {action.reason != "" && <div className="text-xs text-secondary">{action.reason}</div>}
            {resultLine != "" && <div className="text-xs font-mono text-meta break-all">{resultLine}</div>}
            {action.error != null && <div className="text-xs text-error break-all">{action.error}</div>}
            {action.status == "awaiting_approval" && (
                <div className="flex items-center gap-2 pt-1">
                    <button className={PRIMARY_BTN} disabled={deciding} onClick={onApprove}>
                        {deciding ? "…" : "Approve"}
                    </button>
                    <button className={QUIET_BTN} disabled={deciding} onClick={onDeny}>
                        {deciding ? "…" : "Deny"}
                    </button>
                </div>
            )}
        </div>
    );
}

ActionCard.displayName = "ActionCard";

function TaskDetail({
    task,
    decidingActionId,
    decideError,
    onApprove,
    onDeny,
    onCancel,
}: {
    task: CoworkerTaskView;
    decidingActionId: string;
    decideError: string;
    onApprove: (actionId: string) => void;
    onDeny: (actionId: string) => void;
    onCancel: () => void;
}) {
    return (
        <div className="flex flex-col gap-2 overflow-auto">
            <div className="flex items-start gap-2">
                <div className="flex flex-col gap-0.5">
                    <span className="text-sm text-primary">{task.goal}</span>
                    <span className={META}>
                        {task.status.replace("_", " ")}
                        {task.statusReason != null && task.statusReason != "" ? ` — ${task.statusReason}` : ""}
                    </span>
                </div>
                {isTaskActive(task) && (
                    <button className={`${QUIET_BTN} ml-auto`} onClick={onCancel}>
                        Cancel
                    </button>
                )}
            </div>
            <RecoderErrorRow message={decideError} />
            {task.actions.length == 0 && (
                <RecoderEmpty title="Waiting on the first proposed action…" hint="This refreshes automatically." />
            )}
            <div className="flex flex-col gap-2">
                {task.actions.map((action) => (
                    <ActionCard
                        key={action.id}
                        action={action}
                        deciding={decidingActionId == action.id}
                        onApprove={() => onApprove(action.id)}
                        onDeny={() => onDeny(action.id)}
                    />
                ))}
            </div>
        </div>
    );
}

TaskDetail.displayName = "TaskDetail";

function RecoderCoworkerView({ model }: ViewComponentProps<RecoderCoworkerViewModel>) {
    const [goal, setGoal] = useAtom(model.goalInputAtom);
    const creating = useAtomValue(model.creatingAtom);
    const createError = useAtomValue(model.createErrorAtom);
    const tasks = useAtomValue(model.tasksAtom);
    const selectedTaskId = useAtomValue(model.selectedTaskIdAtom);
    const decidingActionId = useAtomValue(model.decidingActionIdAtom);
    const decideError = useAtomValue(model.decideErrorAtom);
    const loading = useAtomValue(model.loadingAtom);
    const connected = useAtomValue(model.connectedAtom);
    const error = useAtomValue(model.errorAtom);

    useEffect(() => {
        model.refreshTasks();
        const id = setInterval(() => model.refreshTasks(), TASK_LIST_POLL_MS);
        return () => clearInterval(id);
    }, [model]);

    const selected = tasks.find((t) => t.id == selectedTaskId) ?? null;

    useEffect(() => {
        if (selected == null || !isTaskActive(selected)) return;
        const id = setInterval(() => model.refreshSelected(), POLL_MS);
        return () => clearInterval(id);
    }, [model, selected?.id, selected?.status]);

    const showDisconnected = !connected && error == "" && !loading && tasks.length == 0;

    return (
        <div className="flex h-full overflow-hidden">
            <div className="flex w-72 shrink-0 flex-col gap-2 border-r border-white/8 p-3 overflow-auto">
                <span className={PAGE_TITLE}>Coworker</span>
                <span className={META}>An AI teammate with its own sandbox — every action needs your approval.</span>
                <textarea
                    className={`${INPUT} min-h-16 resize-none`}
                    placeholder="What should the coworker do? e.g. Summarize this repo's README into NOTES.md"
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key == "Enter" && (e.metaKey || e.ctrlKey)) {
                            model.createTask();
                        }
                    }}
                />
                <button className={PRIMARY_BTN} disabled={creating || goal.trim() == ""} onClick={() => model.createTask()}>
                    {creating ? "Starting…" : "Start Coworker"}
                </button>
                <RecoderErrorRow message={createError} />
                <RecoderErrorRow message={error} />
                <div className="flex flex-col gap-1 pt-2">
                    <span className={FIELD_LABEL}>Tasks</span>
                    {loading && tasks.length == 0 && <RecoderSkeleton rows={3} />}
                    {showDisconnected && (
                        <RecoderEmpty title="Recoder is still starting…" hint="The coworker loads once the backend is ready." />
                    )}
                    {!loading && !showDisconnected && tasks.length == 0 && (
                        <RecoderEmpty
                            title="No coworker tasks yet"
                            hint="Describe a goal above — the coworker proposes its first action and waits for your approval."
                        />
                    )}
                    {tasks.map((task) => (
                        <TaskRow key={task.id} task={task} selected={task.id == selectedTaskId} onSelect={() => model.selectTask(task.id)} />
                    ))}
                </div>
            </div>
            <div className="flex flex-1 flex-col gap-2 p-3 overflow-auto">
                {selected == null ? (
                    <RecoderEmpty
                        title="Select or start a coworker task"
                        hint="Each proposed action — a shell command, a file write, a browser visit — waits for your one-click approval before it runs, and every decision and outcome is sealed into the audit trail."
                    />
                ) : (
                    <TaskDetail
                        task={selected}
                        decidingActionId={decidingActionId}
                        decideError={decideError}
                        onApprove={(actionId) => model.decideAction(actionId, "approved")}
                        onDeny={(actionId) => model.decideAction(actionId, "denied")}
                        onCancel={() => model.cancelSelected()}
                    />
                )}
            </div>
        </div>
    );
}

RecoderCoworkerView.displayName = "RecoderCoworkerView";

export { RecoderCoworkerView };
