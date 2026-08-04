// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import type { RecoderApproval } from "../recoder-approvals/recoder-approvals-model";
import { selectWorkspaceApproval, shouldShowInlineApproval } from "./recoder-diff-approval";

function makeApproval(overrides: Partial<RecoderApproval> = {}): RecoderApproval {
    return {
        id: "a1",
        action: "command.run",
        riskTier: "high",
        status: "pending",
        requestedBy: "agent-1",
        createdAt: "2026-08-04T12:00:00.000Z",
        ...overrides,
    };
}

describe("selectWorkspaceApproval", () => {
    it("matches a pending approval by runId (the most specific key)", () => {
        const match = makeApproval({ id: "a1", runId: "run-1", taskId: "task-1" });
        const other = makeApproval({ id: "a2", runId: "run-2", taskId: "task-2" });
        const picked = selectWorkspaceApproval({ runId: "run-1", taskId: "task-1" }, [other, match]);
        expect(picked).toBe(match);
    });

    it("falls back to taskId when the approval carries no runId", () => {
        const match = makeApproval({ id: "a1", taskId: "task-1" });
        const picked = selectWorkspaceApproval({ runId: "run-1", taskId: "task-1" }, [match]);
        expect(picked).toBe(match);
    });

    it("prefers a runId match over a taskId-only match of the same task", () => {
        const byTask = makeApproval({ id: "a-task", taskId: "task-1" });
        const byRun = makeApproval({ id: "a-run", runId: "run-1", taskId: "task-1" });
        const picked = selectWorkspaceApproval({ runId: "run-1", taskId: "task-1" }, [byTask, byRun]);
        expect(picked).toBe(byRun);
    });

    it("ignores non-pending records (decided/expired never resurface)", () => {
        const approved = makeApproval({ id: "a1", runId: "run-1", status: "approved" });
        const denied = makeApproval({ id: "a2", runId: "run-1", status: "denied" });
        const picked = selectWorkspaceApproval({ runId: "run-1", taskId: "task-1" }, [approved, denied]);
        expect(picked).toBeNull();
    });

    it("returns null when nothing correlates to the workspace", () => {
        const unrelated = makeApproval({ id: "a1", runId: "run-9", taskId: "task-9" });
        const picked = selectWorkspaceApproval({ runId: "run-1", taskId: "task-1" }, [unrelated]);
        expect(picked).toBeNull();
    });

    it("never matches on an empty/absent id (no accidental correlation)", () => {
        const emptyIds = makeApproval({ id: "a1", runId: "", taskId: "" });
        expect(selectWorkspaceApproval({ runId: "", taskId: "" }, [emptyIds])).toBeNull();
        expect(selectWorkspaceApproval({}, [makeApproval({ id: "a1", taskId: "task-1" })])).toBeNull();
    });
});

describe("shouldShowInlineApproval", () => {
    it("shows only when the run is awaiting_approval AND a pending record correlates", () => {
        const approval = makeApproval();
        expect(shouldShowInlineApproval("awaiting_approval", approval)).toBe(true);
    });

    it("hides when the durable state is not awaiting_approval, even with a pending record", () => {
        const approval = makeApproval();
        expect(shouldShowInlineApproval("running", approval)).toBe(false);
        expect(shouldShowInlineApproval("awaiting_review", approval)).toBe(false);
    });

    it("hides when there is no correlated pending approval", () => {
        expect(shouldShowInlineApproval("awaiting_approval", null)).toBe(false);
    });
});
