// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { createBlock } from "@/app/store/global";
import { workspaceDetailMeta } from "./recoder-detail-open";
import {
    CHECKPOINTS_EMPTY,
    checkpointDisplayLabel,
    checkpointShortSha,
    hasLoadedCheckpoints,
    selectWorkspaceCheckpoints,
} from "./recoder-checkpoint-logic";
import type { RecoderViewModel } from "./recoder-model";
import { formatRelativeAge } from "./recoder-board-logic";
import { INPUT, META, QUIET_BTN_XS } from "./recoder-styles";

type WorkspaceCheckpointsProps = {
    model: RecoderViewModel;
    workspaceId: string;
    busy: boolean;
};

// Hand the operator off to the branched workspace by opening its session as its
// own block — the same route the launch flow's "Open session" uses. Fire-and-
// forget: a failed open must never crash the run screen.
async function openSession(workspaceId: string) {
    // Route through a loosely-typed def (like the board's openBlock) so the
    // workspace-id meta key isn't rejected by the block MetaType literal check.
    const blockDef = { meta: workspaceDetailMeta("session", workspaceId) };
    try {
        await createBlock(blockDef);
    } catch {
        // degrade-safe: the branch already succeeded; only the hand-off didn't
    }
}

// Checkpoints for the SELECTED workspace row: snapshot the current git state
// (with an optional label), restore an earlier snapshot into THIS worktree
// (inline-confirmed — it mutates the worktree), or branch a fresh workspace off a
// snapshot and hand off to it. The list renders newest-first and only when it was
// fetched for THIS workspace (a stale fetch shows nothing, never another row's).
function WorkspaceCheckpoints({ model, workspaceId, busy }: WorkspaceCheckpointsProps) {
    const checkpoints = useAtomValue(model.checkpointsAtom);
    const loadedFor = useAtomValue(model.checkpointsWorkspaceIdAtom);
    const [label, setLabel] = useState("");
    const [confirmId, setConfirmId] = useState("");
    useEffect(() => {
        setConfirmId("");
        model.loadCheckpoints(workspaceId);
    }, [workspaceId]);

    const list = selectWorkspaceCheckpoints(loadedFor, workspaceId, checkpoints);
    const showEmpty = hasLoadedCheckpoints(loadedFor, workspaceId) && list.length == 0;

    const onSnapshot = () => {
        model.snapshotWorkspace(workspaceId, label);
        setLabel("");
    };
    const onBranch = async (checkpointId: string) => {
        const newWorkspaceId = await model.branchCheckpoint(workspaceId, checkpointId);
        if (newWorkspaceId != "") {
            await openSession(newWorkspaceId);
        }
    };

    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
                <span className={META}>Checkpoints</span>
                <input
                    className={`${INPUT} h-6 w-40 text-xs`}
                    value={label}
                    disabled={busy}
                    placeholder="Label (optional)"
                    onChange={(e) => setLabel(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key == "Enter") {
                            onSnapshot();
                        }
                    }}
                />
                <button
                    className={QUIET_BTN_XS}
                    disabled={busy}
                    title="Snapshot the current git state, including uncommitted edits (never touches your work)"
                    onClick={onSnapshot}
                >
                    {busy ? "..." : "Snapshot"}
                </button>
            </div>
            {showEmpty && <span className={`${META} pl-2`}>{CHECKPOINTS_EMPTY}</span>}
            {list.map((cp) => {
                const age = formatRelativeAge(cp.createdAt);
                const sha = checkpointShortSha(cp);
                const confirming = confirmId == cp.checkpointId;
                return (
                    <div key={cp.checkpointId} className="flex items-center gap-2 pl-2">
                        <span className={`${META} truncate`} title={cp.checkpointId}>
                            {checkpointDisplayLabel(cp)}
                        </span>
                        {sha != "" && (
                            <span className={`${META} font-mono`} title="Base commit captured by this snapshot">
                                {sha}
                            </span>
                        )}
                        {cp.dirty && (
                            <span className={META} title="Uncommitted edits were captured in this snapshot">
                                +edits
                            </span>
                        )}
                        {age != "" && <span className={META}>{age}</span>}
                        {confirming ? (
                            <>
                                <span className={META}>Restore? Overwrites this worktree.</span>
                                <button
                                    className={QUIET_BTN_XS}
                                    disabled={busy}
                                    title="Reset this worktree to the snapshot (a safety snapshot of the current state is taken first)"
                                    onClick={() => {
                                        setConfirmId("");
                                        model.restoreCheckpoint(workspaceId, cp.checkpointId);
                                    }}
                                >
                                    Confirm
                                </button>
                                <button className={QUIET_BTN_XS} disabled={busy} onClick={() => setConfirmId("")}>
                                    Cancel
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    className={QUIET_BTN_XS}
                                    disabled={busy}
                                    title="Reset this worktree to the snapshot (asks to confirm — it overwrites your current files)"
                                    onClick={() => setConfirmId(cp.checkpointId)}
                                >
                                    Restore
                                </button>
                                <button
                                    className={QUIET_BTN_XS}
                                    disabled={busy}
                                    title="Launch a NEW workspace whose worktree starts from this snapshot, and open it"
                                    onClick={() => onBranch(cp.checkpointId)}
                                >
                                    Branch
                                </button>
                            </>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

WorkspaceCheckpoints.displayName = "WorkspaceCheckpoints";

export { WorkspaceCheckpoints };
