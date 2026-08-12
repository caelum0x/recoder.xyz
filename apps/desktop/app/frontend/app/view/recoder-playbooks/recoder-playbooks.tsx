// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { RecoderEmpty, RecoderErrorRow, RecoderSkeleton } from "@/app/view/recoder/recoder-states";
import { FIELD_LABEL, INPUT, PAGE_TITLE, PRIMARY_BTN, QUIET_BTN_XS, STATE_CHIP } from "@/app/view/recoder/recoder-styles";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import {
    PlaybookListEntry,
    PlaybookStepView,
    RecoderPlaybooksViewModel,
    UnblockPaneView,
} from "./recoder-playbooks-model";

// One crimson accent, reserved for the single load-bearing "converged branch" signal;
// everything else stays graphite so the panel reads as a terminal, not a stoplight.
const CRIMSON_CHIP = "rounded border border-red-500/40 bg-red-500/10 text-red-300 px-1.5 py-0.5 text-xs whitespace-nowrap";

function PlaybookPicker({ model }: { model: RecoderPlaybooksViewModel }) {
    const playbooks = useAtomValue(model.playbooksAtom);
    const selected = useAtomValue(model.selectedPlaybookAtom);

    if (playbooks.length == 0) {
        return null;
    }
    return (
        <div className="flex flex-col gap-1">
            <div className={FIELD_LABEL}>Playbook</div>
            {playbooks.map((pb: PlaybookListEntry) => {
                const on = pb.id == selected;
                return (
                    <button
                        key={pb.id}
                        className={`flex flex-col items-start gap-0.5 rounded border p-2 text-left recoder-transition cursor-pointer ${
                            on ? "border-red-500/40 bg-red-500/10" : "border-border hover:bg-white/[0.04]"
                        }`}
                        onClick={() => model.selectPlaybook(pb.id)}
                    >
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{pb.id}</span>
                            {on && <span className={STATE_CHIP}>selected</span>}
                        </div>
                        {pb.description != "" && <div className="text-secondary text-xs">{pb.description}</div>}
                    </button>
                );
            })}
        </div>
    );
}

PlaybookPicker.displayName = "PlaybookPicker";

function RunForm({ model }: { model: RecoderPlaybooksViewModel }) {
    const selected = useAtomValue(model.selectedPlaybookAtom);
    const task = useAtomValue(model.taskAtom);
    const kinds = useAtomValue(model.kindsAtom);
    const followupTask = useAtomValue(model.followupTaskAtom);
    const repoPath = useAtomValue(model.repoPathAtom);
    const spaceId = useAtomValue(model.spaceIdAtom);
    const projectId = useAtomValue(model.projectIdAtom);
    const running = useAtomValue(model.runningAtom);

    return (
        <div className="flex flex-col gap-2 rounded border border-border p-2">
            <div className={FIELD_LABEL}>Run a playbook over N agents</div>
            <input
                className={`${INPUT} w-full`}
                placeholder="Task — one prompt, sequenced over N parallel runs…"
                value={task}
                onChange={(e) => model.setTask(e.target.value)}
            />
            <div className="flex flex-wrap gap-1">
                {model.knownKinds.map((kind) => {
                    const on = kinds.includes(kind);
                    return (
                        <button
                            key={kind}
                            className={on ? `${STATE_CHIP} border-red-500/40 text-red-300` : QUIET_BTN_XS}
                            onClick={() => model.toggleKind(kind)}
                        >
                            {kind}
                        </button>
                    );
                })}
            </div>
            <input
                className={`${INPUT} w-full`}
                placeholder="Follow-up task (optional) — the narrowed second round for a re-fan recipe…"
                value={followupTask}
                onChange={(e) => model.setFollowupTask(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
                <input
                    className={`${INPUT} flex-1`}
                    placeholder="repo path"
                    value={repoPath}
                    onChange={(e) => model.setRepoPath(e.target.value)}
                />
                <input
                    className={`${INPUT} flex-1`}
                    placeholder="space id"
                    value={spaceId}
                    onChange={(e) => model.setSpaceId(e.target.value)}
                />
                <input
                    className={`${INPUT} flex-1`}
                    placeholder="project id"
                    value={projectId}
                    onChange={(e) => model.setProjectId(e.target.value)}
                />
            </div>
            <div className="flex items-center gap-2">
                <button
                    disabled={running}
                    className={PRIMARY_BTN}
                    onClick={() => model.run({ playbookId: selected, task, agentKinds: kinds, followupTask })}
                >
                    {running ? "Running…" : "Run"}
                </button>
                <span className="text-secondary text-xs">
                    {kinds.length}/{model.maxAgents} agents · min {model.minAgents}
                </span>
            </div>
        </div>
    );
}

RunForm.displayName = "RunForm";

function stepStatusLabel(step: PlaybookStepView): string {
    if (step.status == "ok") {
        return "ok";
    }
    return step.status;
}

function UnblockPaneRow({ pane }: { pane: UnblockPaneView }) {
    return (
        <div className="flex items-center gap-2" title={pane.workspaceId}>
            <span className="text-xs font-mono truncate">{pane.workspaceId}</span>
            <span className={`${STATE_CHIP} ml-auto`}>{pane.faultReason != "" ? pane.faultReason : pane.action || "—"}</span>
        </div>
    );
}

UnblockPaneRow.displayName = "UnblockPaneRow";

function StepRow({ step }: { step: PlaybookStepView }) {
    return (
        <div className="flex flex-col gap-1 rounded border border-border p-2" title={step.reason}>
            <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{step.kind}</span>
                <span className={`${STATE_CHIP} ml-auto`}>{stepStatusLabel(step)}</span>
            </div>
            {step.reason != "" && step.status != "ok" && <div className="text-secondary text-xs">{step.reason}</div>}
            {step.unblock.length > 0 && (
                <div className="flex flex-col gap-0.5">
                    {step.unblock.map((p) => (
                        <UnblockPaneRow key={p.workspaceId} pane={p} />
                    ))}
                </div>
            )}
        </div>
    );
}

StepRow.displayName = "StepRow";

function RunOutcome({ model }: { model: RecoderPlaybooksViewModel }) {
    const result = useAtomValue(model.runResultAtom);
    const notice = useAtomValue(model.runNoticeAtom);

    return (
        <div className="flex flex-col gap-2">
            {notice != "" && <div className="text-secondary text-sm">{notice}</div>}
            {result != null && (
                <div className="flex flex-col gap-2 rounded border border-border p-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{result.playbookId}</span>
                        {result.taskGroup != null && result.taskGroup != "" && (
                            <span className={STATE_CHIP} title={result.taskGroup}>
                                group {result.taskGroup}
                            </span>
                        )}
                        {result.converged != null ? (
                            <span className={CRIMSON_CHIP} title={result.converged.workspaceId}>
                                converged → {result.converged.branch}
                            </span>
                        ) : (
                            <span className={STATE_CHIP}>{result.convergeReason || "nothing converged"}</span>
                        )}
                    </div>
                    <div className="flex flex-col gap-1">
                        <div className={FIELD_LABEL}>Steps</div>
                        {result.steps.map((s, i) => (
                            <StepRow key={`${s.kind}-${i}`} step={s} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

RunOutcome.displayName = "RunOutcome";

function RecoderPlaybooksView({ model }: ViewComponentProps<RecoderPlaybooksViewModel>) {
    const playbooks = useAtomValue(model.playbooksAtom);
    const listLoading = useAtomValue(model.listLoadingAtom);
    const listNotice = useAtomValue(model.listNoticeAtom);
    const error = useAtomValue(model.errorAtom);
    const connected = useAtomValue(model.connectedAtom);

    useEffect(() => {
        model.loadList();
    }, [model]);

    const showDisconnected = !connected && !listLoading && error == "";

    return (
        <div className="flex flex-col h-full overflow-auto p-3 gap-2">
            <div className="flex items-center gap-2">
                <span className={PAGE_TITLE}>Run Playbook</span>
            </div>

            <RecoderErrorRow message={error} />
            {listLoading && playbooks.length == 0 && <RecoderSkeleton rows={3} />}
            {showDisconnected && (
                <RecoderEmpty title="Recoder is still starting…" hint="Playbooks load once the backend is ready." />
            )}
            {listNotice != "" && <div className="text-secondary text-sm">{listNotice}</div>}

            <PlaybookPicker model={model} />
            <RunForm model={model} />
            <RunOutcome model={model} />
        </div>
    );
}

RecoderPlaybooksView.displayName = "RecoderPlaybooksView";

export { RecoderPlaybooksView };
