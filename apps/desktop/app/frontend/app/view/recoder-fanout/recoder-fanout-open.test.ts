// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";

const { createBlockMock } = vi.hoisted(() => ({ createBlockMock: vi.fn().mockResolvedValue("blk-1") }));

vi.mock("@/app/store/global", () => ({ createBlock: createBlockMock }));

import { fanoutFromIssueMeta, IssueIdMetaKey, openFanoutFromIssue, readSeedIssueId } from "./recoder-fanout-open";

afterEach(() => {
    createBlockMock.mockClear();
});

describe("fanoutFromIssueMeta — the Board → Fan-out block meta", () => {
    it("always opens the recoder-fanout view", () => {
        expect(fanoutFromIssueMeta("recoder-b4qx").view).toBe("recoder-fanout");
        expect(fanoutFromIssueMeta().view).toBe("recoder-fanout");
    });

    it("threads a bd issue id under recoder:issueid", () => {
        expect(fanoutFromIssueMeta("recoder-b4qx")[IssueIdMetaKey]).toBe("recoder-b4qx");
    });

    it("trims a padded id", () => {
        expect(fanoutFromIssueMeta("  recoder-b4qx  ")[IssueIdMetaKey]).toBe("recoder-b4qx");
    });

    it("drops the key entirely for a blank / whitespace / missing id (no empty seed)", () => {
        expect(IssueIdMetaKey in fanoutFromIssueMeta("")).toBe(false);
        expect(IssueIdMetaKey in fanoutFromIssueMeta("   ")).toBe(false);
        expect(IssueIdMetaKey in fanoutFromIssueMeta()).toBe(false);
    });
});

describe("readSeedIssueId — reading the threaded id back off the block", () => {
    it("reads recoder:issueid off the block meta", () => {
        expect(readSeedIssueId({ meta: { "recoder:issueid": "recoder-b4qx" } } as unknown as Block)).toBe(
            "recoder-b4qx"
        );
    });

    it("trims a padded seed", () => {
        expect(readSeedIssueId({ meta: { "recoder:issueid": "  recoder-b4qx  " } } as unknown as Block)).toBe(
            "recoder-b4qx"
        );
    });

    it("degrades to '' for an absent key, a non-string value, or a null block (never throws)", () => {
        expect(readSeedIssueId({ meta: {} } as unknown as Block)).toBe("");
        expect(readSeedIssueId({ meta: { "recoder:issueid": 7 } } as unknown as Block)).toBe("");
        expect(readSeedIssueId(null as unknown as Block)).toBe("");
        expect(readSeedIssueId({} as unknown as Block)).toBe("");
    });

    it("round-trips a built meta (build → read is stable)", () => {
        const meta = fanoutFromIssueMeta("recoder-xyz1");
        expect(readSeedIssueId({ meta } as unknown as Block)).toBe("recoder-xyz1");
    });
});

describe("openFanoutFromIssue — best-effort block open", () => {
    it("opens a block with the seeded fan-out meta", async () => {
        await openFanoutFromIssue("recoder-b4qx");
        expect(createBlockMock).toHaveBeenCalledTimes(1);
        expect(createBlockMock).toHaveBeenCalledWith({ meta: fanoutFromIssueMeta("recoder-b4qx") });
    });

    it("opens the plain fan-out form when no id is given", async () => {
        await openFanoutFromIssue();
        expect(createBlockMock).toHaveBeenCalledWith({ meta: { view: "recoder-fanout" } });
    });

    it("swallows a createBlock failure (a failed open never crashes the board)", async () => {
        createBlockMock.mockRejectedValueOnce(new Error("no tab"));
        await expect(openFanoutFromIssue("recoder-b4qx")).resolves.toBeUndefined();
    });
});
