// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { CodeView } from "@pierre/diffs/react";
import { parsePatchFiles, type CodeViewDiffItem, type FileDiffMetadata } from "@pierre/diffs";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { RecoderSessionViewModel } from "./recoder-session-model";

function toDiffItems(diff: string): CodeViewDiffItem[] {
    if (diff.trim() == "") return [];
    const patches = parsePatchFiles(diff, "recoder-session", false);
    const items: CodeViewDiffItem[] = [];
    for (const patch of patches) {
        for (const fileDiff of patch.files as FileDiffMetadata[]) {
            items.push({
                id: fileDiff.prevName != null ? `${fileDiff.prevName}->${fileDiff.name}` : fileDiff.name,
                type: "diff",
                fileDiff,
            });
        }
    }
    return items;
}

/**
 * The Review panel (apps/web's `src/components/diffs`, ported): the active
 * thread's full-thread unified diff, rendered via the real `@pierre/diffs`
 * `CodeView` (Apache-2.0 — see NOTICE). Read-only in this first version: no
 * inline accept/reject or edit-in-place yet (deferred, see the task report).
 */
function RecoderSessionDiff({ model }: { model: RecoderSessionViewModel }) {
    const diff = useAtomValue(model.diffAtom);
    const items = useMemo(() => (diff == null ? [] : toDiffItems(diff.diff)), [diff]);

    if (diff == null) {
        return <div className="px-2 py-2 text-xs text-secondary">Select a thread to review its diff.</div>;
    }
    if (items.length == 0) {
        return <div className="px-2 py-2 text-xs text-secondary">No changes yet on this thread.</div>;
    }
    return (
        <div className="flex-1 overflow-hidden">
            <CodeView items={items} className="h-full" />
        </div>
    );
}

export { RecoderSessionDiff };
