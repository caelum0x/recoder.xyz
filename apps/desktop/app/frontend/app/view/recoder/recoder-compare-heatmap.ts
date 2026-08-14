// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Pure projection of the compare endpoint's contested-file matrix into a grid the
// view can render directly. The endpoint only proves contested participation, so
// an occupied cell is always `hot`; blank cells mean this matrix did not report
// that agent on this contested path, not that the agent changed nothing elsewhere.

type HeatmapSibling = { workspaceId: string; agent: string };
type HeatmapContested = { path: string; workspaceIds: string[] };

type CompareHeatmapColumn = { workspaceId: string; label: string; known: boolean };
type CompareHeatmapCell = { workspaceId: string; hot: boolean };
type CompareHeatmapRow = { path: string; participantCount: number; cells: CompareHeatmapCell[] };
type CompareHeatmap = { columns: CompareHeatmapColumn[]; rows: CompareHeatmapRow[] };

function cleanId(value: unknown): string {
    return typeof value == "string" ? value.trim() : "";
}

// Build one stable files × agents grid. Duplicate path rows are merged because an
// older backend may emit repeated entries while a comparison is being refreshed;
// duplicate workspace ids are likewise folded rather than widening the count.
function buildCompareHeatmap(
    siblings: readonly HeatmapSibling[],
    contested: readonly HeatmapContested[] | null | undefined,
): CompareHeatmap {
    const known = new Map<string, string>();
    for (const sibling of siblings ?? []) {
        const workspaceId = cleanId(sibling?.workspaceId);
        if (workspaceId != "" && !known.has(workspaceId)) {
            known.set(workspaceId, cleanId(sibling?.agent) || workspaceId);
        }
    }

    const participantsByPath = new Map<string, Set<string>>();
    for (const entry of contested ?? []) {
        const path = cleanId(entry?.path);
        if (path == "") {
            continue;
        }
        const participants = participantsByPath.get(path) ?? new Set<string>();
        for (const rawId of entry?.workspaceIds ?? []) {
            const workspaceId = cleanId(rawId);
            if (workspaceId != "") {
                participants.add(workspaceId);
            }
        }
        // A malformed entry that names no participants proves no collision, so it
        // has no honest heatmap row.
        if (participants.size > 0) {
            participantsByPath.set(path, participants);
        }
    }

    const unknownIds = new Set<string>();
    for (const participants of participantsByPath.values()) {
        for (const workspaceId of participants) {
            if (!known.has(workspaceId)) {
                unknownIds.add(workspaceId);
            }
        }
    }
    const columns: CompareHeatmapColumn[] = [
        ...[...known].map(([workspaceId, label]) => ({ workspaceId, label, known: true })),
        ...[...unknownIds].sort().map((workspaceId) => ({ workspaceId, label: workspaceId, known: false })),
    ];

    const rows = [...participantsByPath]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([path, participants]) => ({
            path,
            participantCount: participants.size,
            cells: columns.map(({ workspaceId }) => ({ workspaceId, hot: participants.has(workspaceId) })),
        }));
    return { columns, rows };
}

export {
    buildCompareHeatmap,
    type CompareHeatmap,
    type CompareHeatmapCell,
    type CompareHeatmapColumn,
    type CompareHeatmapRow,
    type HeatmapContested,
    type HeatmapSibling,
};
