// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { createBlock } from "@/app/store/global";

// The bd issue id threaded into a freshly-opened Converge Fan-out block so the launch
// form arrives pre-seeded and a launch tracks taskId=issueId — the backend
// `recoder_fanout_from_issue` loop that CLAIMS the issue on launch and CLOSES it on a
// successful converge. Absent → the plain fan-out form (no seed).
const IssueIdMetaKey = "recoder:issueid";

// Build the block meta that opens the Converge Fan-out view seeded from a bd issue. A
// blank/whitespace id is dropped so a seedless open never carries an empty key.
function fanoutFromIssueMeta(issueId?: string): Record<string, unknown> {
    const id = typeof issueId == "string" ? issueId.trim() : "";
    return {
        view: "recoder-fanout",
        ...(id != "" ? { [IssueIdMetaKey]: id } : {}),
    };
}

// The clicked bd issue id is threaded via the block's meta so the fan-out form opens on
// that issue, not a blank task. Absent/garbage → "" → the plain form (a harmless seed).
function readSeedIssueId(block: Block): string {
    const meta = (block?.meta ?? {}) as Record<string, unknown>;
    const raw = meta[IssueIdMetaKey];
    return typeof raw == "string" ? raw.trim() : "";
}

// Open the Converge Fan-out view, seeded from a bd issue when an id is given. Opening a
// surface is an affordance — a failure never crashes the board or invalidates work.
async function openFanoutFromIssue(issueId?: string): Promise<void> {
    try {
        await createBlock({ meta: fanoutFromIssueMeta(issueId) });
    } catch {
        // best-effort: a failed block open must not crash the board.
    }
}

export { fanoutFromIssueMeta, IssueIdMetaKey, openFanoutFromIssue, readSeedIssueId };
