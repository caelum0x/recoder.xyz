// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { buildCompareHeatmap } from "./recoder-compare-heatmap";

describe("buildCompareHeatmap", () => {
    it("folds the contested matrix into stable file rows and agent columns", () => {
        const heatmap = buildCompareHeatmap(
            [
                { workspaceId: "ws-a", agent: "Claude" },
                { workspaceId: "ws-b", agent: "Codex" },
                { workspaceId: "ws-c", agent: "Cursor" },
            ],
            [
                { path: "src/z.ts", workspaceIds: ["ws-c", "ws-a"] },
                { path: "src/a.ts", workspaceIds: ["ws-a", "ws-b", "ws-a"] },
            ],
        );

        expect(heatmap.columns.map((column) => column.label)).toEqual(["Claude", "Codex", "Cursor"]);
        expect(heatmap.rows.map((row) => row.path)).toEqual(["src/a.ts", "src/z.ts"]);
        expect(heatmap.rows.map((row) => row.participantCount)).toEqual([2, 2]);
        expect(heatmap.rows[0].cells.map((cell) => cell.hot)).toEqual([true, true, false]);
        expect(heatmap.rows[1].cells.map((cell) => cell.hot)).toEqual([true, false, true]);
    });

    it("retains an unknown participant and merges repeated path entries without fabricating cells", () => {
        const heatmap = buildCompareHeatmap(
            [{ workspaceId: "ws-a", agent: "Claude" }],
            [
                { path: "src/shared.ts", workspaceIds: ["ws-a", "ws-legacy"] },
                { path: "src/shared.ts", workspaceIds: ["ws-legacy", "ws-b"] },
                { path: "", workspaceIds: ["ws-a", "ws-b"] },
            ],
        );

        expect(heatmap.columns).toEqual([
            { workspaceId: "ws-a", label: "Claude", known: true },
            { workspaceId: "ws-b", label: "ws-b", known: false },
            { workspaceId: "ws-legacy", label: "ws-legacy", known: false },
        ]);
        expect(heatmap.rows).toEqual([
            {
                path: "src/shared.ts",
                participantCount: 3,
                cells: [
                    { workspaceId: "ws-a", hot: true },
                    { workspaceId: "ws-b", hot: true },
                    { workspaceId: "ws-legacy", hot: true },
                ],
            },
        ]);
    });

    it("returns no rows for absent or malformed conflict data", () => {
        expect(buildCompareHeatmap([{ workspaceId: "ws-a", agent: "Claude" }], null).rows).toEqual([]);
        expect(buildCompareHeatmap([{ workspaceId: "ws-a", agent: "Claude" }], [{ path: "x.ts", workspaceIds: [] }]).rows).toEqual([]);
    });
});
