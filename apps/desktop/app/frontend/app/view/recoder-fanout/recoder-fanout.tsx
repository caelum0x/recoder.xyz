// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { ASSISTED_VALUE } from "@/app/view/recoder/recoder-converge-logic";
import { RecoderEmpty, RecoderErrorRow, RecoderSkeleton } from "@/app/view/recoder/recoder-states";
import { FIELD_LABEL, INPUT, PAGE_TITLE, PRIMARY_BTN, QUIET_BTN_XS, STATE_CHIP } from "@/app/view/recoder/recoder-styles";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import {
    CockpitAgent,
    CockpitContested,
    FileVersionsView,
    RecoderFanoutViewModel,
} from "./recoder-fanout-model";

// One crimson accent, reserved for the single load-bearing convergence signal (the merge
// button + the review affordance) — everything else stays graphite so the strip reads as a
// terminal, not a stoplight. Both surfaces share the SAME accent (never a second color).
const CRIMSON_BTN =
    "rounded border border-red-500/40 bg-red-500/10 text-red-300 px-2 py-0.5 text-xs whitespace-nowrap hover:bg-red-500/20 transition-colors cursor-pointer disabled:opacity-60";

function SettleStrip({ model }: { model: RecoderFanoutViewModel }) {
    const snapshot = useAtomValue(model.snapshotAtom);
    const converging = useAtomValue(model.convergingAtom);
    const converged = useAtomValue(model.convergedAtom);
    const convergeNotice = useAtomValue(model.convergeNoticeAtom);
    if (snapshot == null) {
        return null;
    }
    const canConverge = snapshot.convergeReady && converged == null;
    return (
        <div className="flex flex-wrap items-center gap-2">
            <span className={STATE_CHIP}>
                {snapshot.settledCount}/{snapshot.totalCount} settled
            </span>
            <span className={STATE_CHIP}>{snapshot.contested.length} contested</span>
            <span className={STATE_CHIP}>{snapshot.autoMergeableCount} auto-mergeable</span>
            <span className={STATE_CHIP}>{snapshot.needsPickCount} needs a pick</span>
            <span className={STATE_CHIP}>{snapshot.cleanCount} clean</span>
            {canConverge && (
                <button disabled={converging} className={CRIMSON_BTN} onClick={() => model.converge()}>
                    {converging ? "Converging…" : "Converge"}
                </button>
            )}
            {converged != null && (
                <button
                    className={CRIMSON_BTN}
                    title={converged.workspaceId}
                    onClick={() => model.openConvergedReview(converged.workspaceId)}
                >
                    Review converged branch{converged.branch != "" ? ` → ${converged.branch}` : ""}
                </button>
            )}
            {convergeNotice != "" && <span className="text-secondary text-xs">{convergeNotice}</span>}
        </div>
    );
}

SettleStrip.displayName = "SettleStrip";

function AgentRow({ agent }: { agent: CockpitAgent }) {
    return (
        <div className="flex items-center gap-2 rounded border border-border p-2" title={agent.workspaceId}>
            <span className="text-sm font-medium truncate">{agent.kind || agent.workspaceId}</span>
            <span className={`${STATE_CHIP} ml-auto`}>{agent.state}</span>
            <span className={STATE_CHIP}>{agent.settled ? "settled" : "working"}</span>
            {!agent.nativeStatus && <span className={STATE_CHIP}>raw pane</span>}
        </div>
    );
}

AgentRow.displayName = "AgentRow";

function ContestedRow({ file }: { file: CockpitContested }) {
    return (
        <div className="flex flex-col gap-1 rounded border border-border p-2" title={file.path}>
            <div className="flex items-center gap-2">
                <span className="text-sm font-mono truncate">{file.path}</span>
                <span className={`${STATE_CHIP} ml-auto`}>
                    {file.synthesizable ? "auto-mergeable" : file.reason || "needs a pick"}
                </span>
            </div>
            {file.agents.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {file.agents.map((a) => (
                        <span key={a} className={`${STATE_CHIP} font-mono`}>
                            {a}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

ContestedRow.displayName = "ContestedRow";

function FileColumns({ model, file }: { model: RecoderFanoutViewModel; file: FileVersionsView }) {
    const selection = useAtomValue(model.contestedSelectionAtom);
    const picked = selection[file.path];
    return (
        <div className="flex flex-col gap-1 rounded border border-border p-2">
            <div className="flex items-center gap-2">
                <div className="text-sm font-mono truncate" title={file.path}>
                    {file.path}
                </div>
                <button
                    className={`ml-auto rounded px-1.5 text-xs cursor-pointer transition-colors ${picked === ASSISTED_VALUE ? "bg-accent/80 text-primary" : "border border-border hover:bg-accent/20"}`}
                    title="merge all versions with a 3-way merge, escalating conflicts to an AI-assisted synthesis"
                    onClick={() => model.setContestedSelection(file.path, ASSISTED_VALUE)}
                >
                    {picked === ASSISTED_VALUE ? "AI-merging" : "AI-merge"}
                </button>
                {picked != null && picked != "" && (
                    <button
                        className={`${STATE_CHIP} cursor-pointer`}
                        onClick={() => model.setContestedSelection(file.path, "")}
                    >
                        clear
                    </button>
                )}
            </div>
            <div className="flex gap-2 overflow-x-auto">
                {file.versions.map((v) => {
                    const isPicked = picked === v.workspaceId;
                    return (
                        <div
                            key={v.workspaceId}
                            className={`flex min-w-[14rem] flex-1 flex-col gap-0.5 rounded p-1 ${isPicked ? "ring-1 ring-accent" : ""}`}
                        >
                            <div className="flex items-center gap-1">
                                <span className="text-xs font-medium truncate">{v.agent || v.workspaceId}</span>
                                {v.truncated && <span className={STATE_CHIP}>truncated</span>}
                                <button
                                    className={`ml-auto rounded px-1.5 text-xs cursor-pointer transition-colors ${isPicked ? "bg-accent/80 text-primary" : "border border-border hover:bg-accent/20"}`}
                                    title={`use ${v.agent || v.workspaceId}'s version of this file`}
                                    onClick={() => model.setContestedSelection(file.path, v.workspaceId)}
                                >
                                    {isPicked ? "picked" : "pick"}
                                </button>
                            </div>
                            {v.content == null ? (
                                <div className="text-secondary text-xs">{v.reason || "no version"}</div>
                            ) : (
                                <pre className="text-xs whitespace-pre-wrap break-words font-mono max-h-48 overflow-auto">
                                    {v.content}
                                </pre>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

FileColumns.displayName = "FileColumns";

function LaunchForm({ model }: { model: RecoderFanoutViewModel }) {
    const task = useAtomValue(model.launchTaskAtom);
    const issueId = useAtomValue(model.issueIdAtom);
    const kinds = useAtomValue(model.launchKindsAtom);
    const repoPath = useAtomValue(model.repoPathAtom);
    const spaceId = useAtomValue(model.spaceIdAtom);
    const projectId = useAtomValue(model.projectIdAtom);
    const launching = useAtomValue(model.launchingAtom);
    const launchNotice = useAtomValue(model.launchNoticeAtom);
    const result = useAtomValue(model.launchResultAtom);

    return (
        <div className="flex flex-col gap-2 rounded border border-border p-2">
            <div className={FIELD_LABEL}>Fan a task out to N agents</div>
            <input
                className={`${INPUT} w-full`}
                placeholder="Task — one prompt, N parallel runs…"
                value={task}
                onChange={(e) => model.setLaunchTask(e.target.value)}
            />
            <div className="flex items-center gap-2">
                <input
                    className={`${INPUT} flex-1`}
                    placeholder="…or a bd issue id (seeds the task from the issue)"
                    value={issueId}
                    onChange={(e) => model.setIssueId(e.target.value)}
                />
                <button
                    disabled={launching}
                    className={QUIET_BTN_XS}
                    onClick={() => model.launchFromIssue(issueId, kinds)}
                >
                    {launching ? "Fanning out…" : "Fan out from issue"}
                </button>
            </div>
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
                    disabled={launching}
                    className={PRIMARY_BTN}
                    onClick={() => model.launch(task, kinds)}
                >
                    {launching ? "Fanning out…" : "Fan out"}
                </button>
                <span className="text-secondary text-xs">
                    {kinds.length}/{model.maxAgents} agents · min {model.minAgents}
                </span>
            </div>
            {launchNotice != "" && <div className="text-secondary text-sm">{launchNotice}</div>}
            {result != null && (
                <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={STATE_CHIP} title={result.taskGroup}>
                            group {result.taskGroup}
                        </span>
                        {result.converged != null ? (
                            <button
                                className={CRIMSON_BTN}
                                title={result.converged.workspaceId}
                                onClick={() => model.openConvergedReview(result.converged.workspaceId)}
                            >
                                Review converged branch → {result.converged.branch}
                            </button>
                        ) : (
                            <span className={STATE_CHIP}>{result.convergeReason || "nothing converged"}</span>
                        )}
                    </div>
                    {result.perAgent.map((a) => (
                        <div
                            key={a.kind}
                            className="flex items-center gap-2 rounded border border-border p-1.5"
                            title={a.reason}
                        >
                            <span className="text-sm font-medium truncate">{a.kind}</span>
                            <span className={`${STATE_CHIP} ml-auto`}>{a.settled ? "settled" : "unsettled"}</span>
                            {!a.nativeStatus && <span className={STATE_CHIP}>raw pane</span>}
                            {a.workspaceId == null && <span className={STATE_CHIP}>not created</span>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

LaunchForm.displayName = "LaunchForm";

function ReFanForm({ model }: { model: RecoderFanoutViewModel }) {
    const taskGroup = useAtomValue(model.taskGroupAtom);
    const narrowedTask = useAtomValue(model.refanTaskAtom);
    const kinds = useAtomValue(model.refanKindsAtom);
    const refanning = useAtomValue(model.refanningAtom);
    const notice = useAtomValue(model.refanNoticeAtom);
    const result = useAtomValue(model.refanResultAtom);

    const pinned = taskGroup.trim() != "";

    return (
        <div className="flex flex-col gap-2 rounded border border-border p-2">
            <div className={FIELD_LABEL}>Re-fan — iterate the converged branch with a narrowed task</div>
            {!pinned ? (
                <div className="text-secondary text-sm">
                    Pin a round-1 task group above to re-fan its convergence into a second round.
                </div>
            ) : (
                <>
                    <div className="text-secondary text-xs">
                        Iterating group <span className="font-mono">{taskGroup}</span> — its converged branch becomes
                        the new base.
                    </div>
                    <input
                        className={`${INPUT} w-full`}
                        placeholder="Narrowed task — what round 2 should tighten…"
                        value={narrowedTask}
                        onChange={(e) => model.setRefanTask(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-1">
                        {model.knownKinds.map((kind) => {
                            const on = kinds.includes(kind);
                            return (
                                <button
                                    key={kind}
                                    className={on ? `${STATE_CHIP} border-red-500/40 text-red-300` : QUIET_BTN_XS}
                                    onClick={() => model.toggleRefanKind(kind)}
                                >
                                    {kind}
                                </button>
                            );
                        })}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            disabled={refanning}
                            className={PRIMARY_BTN}
                            onClick={() => model.reFan(narrowedTask, kinds)}
                        >
                            {refanning ? "Re-fanning…" : "Re-fan"}
                        </button>
                        <span className="text-secondary text-xs">
                            {kinds.length}/{model.maxAgents} agents · min {model.minAgents}
                        </span>
                    </div>
                </>
            )}
            {notice != "" && <div className="text-secondary text-sm">{notice}</div>}
            {result != null && !result.refused && (
                <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={STATE_CHIP} title={result.priorTaskGroup}>
                            round 1 · {result.priorTaskGroup}
                        </span>
                        {result.newTaskGroup != null && (
                            <span className={STATE_CHIP} title={result.newTaskGroup}>
                                round 2 · {result.newTaskGroup}
                            </span>
                        )}
                        {result.converged != null ? (
                            <button
                                className={CRIMSON_BTN}
                                title={result.converged.workspaceId}
                                onClick={() => model.openConvergedReview(result.converged.workspaceId)}
                            >
                                Review converged branch → {result.converged.branch}
                            </button>
                        ) : (
                            <span className={STATE_CHIP}>{result.convergeReason || "nothing converged"}</span>
                        )}
                    </div>
                    {result.provenanceLink != null && (
                        <div className="text-secondary text-xs">
                            iterated {result.provenanceLink.fileCount} file(s) from{" "}
                            {result.provenanceLink.sourceCount} agent(s)
                            {result.provenanceLink.assistedPaths != null &&
                                result.provenanceLink.assistedPaths.length > 0 &&
                                ` · LLM-assisted: ${result.provenanceLink.assistedPaths.join(", ")}`}
                        </div>
                    )}
                    {result.perAgent.map((a) => (
                        <div
                            key={a.kind}
                            className="flex items-center gap-2 rounded border border-border p-1.5"
                            title={a.reason}
                        >
                            <span className="text-sm font-medium truncate">{a.kind}</span>
                            <span className={`${STATE_CHIP} ml-auto`}>{a.settled ? "settled" : "unsettled"}</span>
                            {!a.nativeStatus && <span className={STATE_CHIP}>raw pane</span>}
                            {a.workspaceId == null && <span className={STATE_CHIP}>not created</span>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

ReFanForm.displayName = "ReFanForm";

function RecoderFanoutView({ model }: ViewComponentProps<RecoderFanoutViewModel>) {
    const taskGroup = useAtomValue(model.taskGroupAtom);
    const snapshot = useAtomValue(model.snapshotAtom);
    const notice = useAtomValue(model.noticeAtom);
    const error = useAtomValue(model.errorAtom);
    const loading = useAtomValue(model.loadingAtom);
    const connected = useAtomValue(model.connectedAtom);

    useEffect(() => {
        model.seedIssueIdFromBlock();
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const tick = async () => {
            await model.loadCockpit();
            if (cancelled) {
                return;
            }
            const delay = model.nextCockpitPollDelay();
            if (delay > 0) {
                timer = setTimeout(tick, delay);
            }
        };
        void tick();
        return () => {
            cancelled = true;
            if (timer != null) {
                clearTimeout(timer);
            }
        };
    }, [model]);

    const hasGroup = taskGroup.trim() != "";
    const showDisconnected = !connected && !loading && error == "";

    return (
        <div className="flex flex-col h-full overflow-auto p-3 gap-2">
            <div className="flex items-center gap-2">
                <span className={PAGE_TITLE}>Converge Fan-out</span>
                {snapshot != null && snapshot.summaryLine != "" && (
                    <span className="text-secondary text-xs ml-auto truncate" title={snapshot.summaryLine}>
                        {snapshot.summaryLine}
                    </span>
                )}
            </div>

            <div className="flex items-center gap-2">
                <input
                    className={`${INPUT} flex-1`}
                    placeholder="taskGroup — open a live cockpit…"
                    value={taskGroup}
                    onChange={(e) => model.setTaskGroup(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key == "Enter") {
                            model.loadCockpit();
                        }
                    }}
                />
                <button disabled={loading} className={QUIET_BTN_XS} onClick={() => model.loadCockpit()}>
                    {loading ? "…" : "Open"}
                </button>
            </div>

            <RecoderErrorRow message={error} />
            {loading && snapshot == null && <RecoderSkeleton rows={3} />}
            {showDisconnected && (
                <RecoderEmpty title="Recoder is still starting…" hint="The cockpit loads once the backend is ready." />
            )}

            {hasGroup && notice != "" && <div className="text-secondary text-sm">{notice}</div>}

            {snapshot != null && (
                <>
                    <SettleStrip model={model} />

                    <div className="flex flex-col gap-1">
                        <div className={FIELD_LABEL}>Agents</div>
                        {snapshot.agents.map((a) => (
                            <AgentRow key={a.workspaceId || a.kind} agent={a} />
                        ))}
                    </div>

                    {snapshot.contested.length > 0 && (
                        <div className="flex flex-col gap-1">
                            <div className={FIELD_LABEL}>Contested</div>
                            {snapshot.contested.map((c) => (
                                <ContestedRow key={c.path} file={c} />
                            ))}
                        </div>
                    )}

                    {snapshot.fileVersions.length > 0 && (
                        <div className="flex flex-col gap-1">
                            <div className={FIELD_LABEL}>N-up columns</div>
                            {snapshot.fileVersions.map((f) => (
                                <FileColumns key={f.path} model={model} file={f} />
                            ))}
                        </div>
                    )}
                </>
            )}

            <LaunchForm model={model} />
            <ReFanForm model={model} />
        </div>
    );
}

RecoderFanoutView.displayName = "RecoderFanoutView";

export { RecoderFanoutView };
