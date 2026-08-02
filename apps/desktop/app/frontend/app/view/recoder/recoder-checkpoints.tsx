// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { checkpointDisplayLabel } from "./recoder-checkpoint-logic";
import type { RecoderViewModel } from "./recoder-model";
import { formatRelativeAge } from "./recoder-board-logic";
import { META, QUIET_BTN_XS } from "./recoder-styles";

type WorkspaceCheckpointsProps = {
    model: RecoderViewModel;
    workspaceId: string;
    busy: boolean;
};

// Checkpoint strip for the SELECTED workspace row: snapshot the current git
// state, and restore/branch from earlier snapshots. Renders the list only when
// it was fetched for THIS workspace (a stale fetch shows nothing, never another
// row's snapshots).
function WorkspaceCheckpoints({ model, workspaceId, busy }: WorkspaceCheckpointsProps) {
    const checkpoints = useAtomValue(model.checkpointsAtom);
    const loadedFor = useAtomValue(model.checkpointsWorkspaceIdAtom);
    useEffect(() => {
        model.loadCheckpoints(workspaceId);
    }, [workspaceId]);
    const list = loadedFor == workspaceId ? checkpoints : [];
    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
                <span className={META}>Checkpoints</span>
                <button
                    className={QUIET_BTN_XS}
                    disabled={busy}
                    title="Snapshot the current git state, including uncommitted edits (never touches your work)"
                    onClick={() => model.snapshotWorkspace(workspaceId)}
                >
                    {busy ? "..." : "Snapshot"}
                </button>
            </div>
            {list.map((cp) => {
                const age = formatRelativeAge(cp.createdAt);
                return (
                    <div key={cp.checkpointId} className="flex items-center gap-2 pl-2">
                        <span className={`${META} truncate font-mono`} title={cp.checkpointId}>
                            {checkpointDisplayLabel(cp)}
                        </span>
                        {cp.dirty && (
                            <span className={META} title="Uncommitted edits were captured in this snapshot">
                                +edits
                            </span>
                        )}
                        {age != "" && <span className={META}>{age}</span>}
                        <button
                            className={QUIET_BTN_XS}
                            disabled={busy}
                            title="Reset this worktree to the snapshot (a safety snapshot of the current state is taken first)"
                            onClick={() => model.restoreCheckpoint(workspaceId, cp.checkpointId)}
                        >
                            Restore
                        </button>
                        <button
                            className={QUIET_BTN_XS}
                            disabled={busy}
                            title="Launch a NEW workspace whose worktree starts from this snapshot"
                            onClick={() => model.branchCheckpoint(workspaceId, cp.checkpointId)}
                        >
                            Branch
                        </button>
                    </div>
                );
            })}
        </div>
    );
}

WorkspaceCheckpoints.displayName = "WorkspaceCheckpoints";

export { WorkspaceCheckpoints };
