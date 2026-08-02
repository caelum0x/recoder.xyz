// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { checkpointDisplayLabel, parseCheckpointList } from "./recoder-checkpoint-logic";

describe("parseCheckpointList — untrusted checkpoints payload", () => {
    it("parses the documented envelope", () => {
        const body = {
            success: true,
            data: {
                checkpoints: [
                    {
                        checkpointId: "cp_1234567890",
                        label: "before refactor",
                        kind: "stash",
                        dirty: true,
                        createdAt: "2026-08-01T00:00:00.000Z",
                        headSha: "abc",
                        snapshotSha: "def",
                    },
                    { checkpointId: "cp_2", kind: "commit", dirty: false, createdAt: "2026-08-02T00:00:00.000Z" },
                ],
            },
        };
        const list = parseCheckpointList(body);
        expect(list).toHaveLength(2);
        expect(list[0]).toEqual({
            checkpointId: "cp_1234567890",
            label: "before refactor",
            kind: "stash",
            dirty: true,
            createdAt: "2026-08-01T00:00:00.000Z",
        });
        expect(list[1].label).toBe("");
        expect(list[1].dirty).toBe(false);
    });

    it("degrades every malformed shape to an empty/filtered list", () => {
        expect(parseCheckpointList(null)).toEqual([]);
        expect(parseCheckpointList({})).toEqual([]);
        expect(parseCheckpointList({ data: null })).toEqual([]);
        expect(parseCheckpointList({ data: { checkpoints: "nope" } })).toEqual([]);
        expect(parseCheckpointList({ data: { checkpoints: [null, 42, { label: "no id" }, { checkpointId: "" }] } })).toEqual([]);
    });
});

describe("checkpointDisplayLabel", () => {
    it("prefers the operator's label, else the short id", () => {
        expect(
            checkpointDisplayLabel({ checkpointId: "cp_x", label: "wip", kind: "commit", dirty: false, createdAt: "" })
        ).toBe("wip");
        expect(
            checkpointDisplayLabel({ checkpointId: "0123456789abcdef", label: "", kind: "commit", dirty: false, createdAt: "" })
        ).toBe("01234567");
    });
});
