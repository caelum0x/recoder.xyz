// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { mergeArchivedHistory, type RecoderWorkspace } from "./recoder-board-logic";
import {
    archivedHistoryNotice,
    firstParallelPreselection,
    firstRunAgentChips,
    firstRunSignIn,
    parseArchivedPage,
    shouldShowGettingStarted,
    showConvergeAffordance,
    type FirstRunEnvironment,
} from "./recoder-first-run-logic";

function makeEnv(overrides: Partial<FirstRunEnvironment> = {}): FirstRunEnvironment {
    return {
        gitIdentity: null,
        agentConfigs: [],
        ghAuthenticated: null,
        shell: "",
        ...overrides,
    };
}

let wsSeq = 0;

function makeWs(overrides: Partial<RecoderWorkspace> = {}): RecoderWorkspace {
    wsSeq += 1;
    return {
        workspaceId: `ws-${wsSeq}`,
        branch: `agent/branch-${wsSeq}`,
        runtimeId: "claude_code",
        worktreePath: `/tmp/worktrees/ws-${wsSeq}`,
        state: "archived",
        ...overrides,
    };
}

describe("shouldShowGettingStarted — first-run card visibility", () => {
    it("shows on an empty, settled, error-free board", () => {
        expect(shouldShowGettingStarted(false, 0, "", false)).toBe(true);
    });

    it("shows through a cold-start connectivity error (still starting, not failed)", () => {
        expect(shouldShowGettingStarted(false, 0, "Failed to fetch", false)).toBe(true);
        expect(shouldShowGettingStarted(false, 0, "fetch failed", false)).toBe(true);
    });

    it("hides for a REAL (non-connectivity) error", () => {
        expect(shouldShowGettingStarted(false, 0, "HTTP 500", false)).toBe(false);
    });

    it("hides while loading, while the launch panel is open, and once any workspace exists", () => {
        expect(shouldShowGettingStarted(true, 0, "", false)).toBe(false);
        expect(shouldShowGettingStarted(false, 0, "", true)).toBe(false);
        expect(shouldShowGettingStarted(false, 1, "", false)).toBe(false);
    });
});

describe("firstRunAgentChips", () => {
    it("folds PATH-probed agents with env-config presence and auth state", () => {
        const chips = firstRunAgentChips(
            makeEnv({ agentConfigs: [{ id: "codex", present: true }] }),
            [
                { runtimeId: "claude_code", available: true },
                { runtimeId: "codex", available: false },
            ],
            { claude_code: "authenticated" },
            null
        );
        expect(chips.map((c) => c.id)).toEqual(["claude_code", "codex"]);
        expect(chips[0]).toMatchObject({ present: true, authed: true, kind: "agent", label: "Claude Code" });
        // codex: off PATH but its config dir exists — still a truthful "found".
        expect(chips[1]).toMatchObject({ present: true, authed: false });
    });

    it("an agent absent on BOTH axes is a non-present chip (the install affordance)", () => {
        const chips = firstRunAgentChips(
            makeEnv({ agentConfigs: [{ id: "opencode", present: false }] }),
            [{ runtimeId: "opencode", available: false }],
            {},
            null
        );
        expect(chips).toHaveLength(1);
        expect(chips[0].present).toBe(false);
    });

    it("env-only agents (no PATH probe row) still appear, after the probed ones", () => {
        // 'gemini' is what the backend environment import actually emits for
        // ~/.gemini — the fold must normalize it onto the 'gemini_cli' runtime id.
        const chips = firstRunAgentChips(
            makeEnv({ agentConfigs: [{ id: "gemini", present: true }] }),
            [{ runtimeId: "claude_code", available: true }],
            {},
            null
        );
        expect(chips.map((c) => c.id)).toEqual(["claude_code", "gemini_cli"]);
    });

    it("folds the env 'gemini' config dir onto a PATH-probed 'gemini_cli' row (one chip, present)", () => {
        const chips = firstRunAgentChips(
            makeEnv({ agentConfigs: [{ id: "gemini", present: true }] }),
            [{ runtimeId: "gemini_cli", available: false }],
            {},
            null
        );
        expect(chips).toHaveLength(1);
        expect(chips[0]).toMatchObject({ id: "gemini_cli", present: true });
    });

    it("adds a GitHub chip only when its state is KNOWN (status probe, else env boolean)", () => {
        const gh = { connected: true, source: "gh_cli", login: "dev", name: "", email: "" };
        expect(firstRunAgentChips(makeEnv(), [], {}, gh).at(-1)).toMatchObject({
            id: "github",
            present: true,
            kind: "github",
        });
        expect(firstRunAgentChips(makeEnv({ ghAuthenticated: false }), [], {}, null).at(-1)).toMatchObject({
            id: "github",
            present: false,
        });
        // Unknown gh (no probe, no env verdict) never fabricates a chip.
        expect(firstRunAgentChips(makeEnv(), [], {}, null)).toEqual([]);
    });

    it("null environment degrades to the PATH probe alone; nothing detected → []", () => {
        const chips = firstRunAgentChips(null, [{ runtimeId: "codex", available: true }], {}, null);
        expect(chips.map((c) => c.id)).toEqual(["codex"]);
        expect(firstRunAgentChips(null, [], {}, null)).toEqual([]);
    });
});

describe("firstRunSignIn — the optional sign-in branch of the first-run card", () => {
    it("rest state: the plain sign-in action, no code, no pending copy", () => {
        expect(firstRunSignIn(false, null)).toEqual({
            label: "Sign in with Recoder",
            waiting: false,
            code: "",
            verificationUri: "",
            showCode: false,
        });
    });

    it("waiting with no prompt yet: the button reads pending but no blank code row is shown", () => {
        const s = firstRunSignIn(true, null);
        expect(s.label).toBe("Waiting for browser…");
        expect(s.waiting).toBe(true);
        expect(s.showCode).toBe(false);
    });

    it("waiting with a device prompt: surfaces the inline user-code + verification URL", () => {
        const s = firstRunSignIn(true, {
            userCode: "WXYZ-1234",
            verificationUri: "https://recoder.xyz/device",
            expiresIn: 900,
        });
        expect(s).toMatchObject({
            waiting: true,
            code: "WXYZ-1234",
            verificationUri: "https://recoder.xyz/device",
            showCode: true,
        });
    });

    it("never shows the code once the flow settles, even if a stale prompt lingers", () => {
        const s = firstRunSignIn(false, {
            userCode: "WXYZ-1234",
            verificationUri: "https://recoder.xyz/device",
            expiresIn: 900,
        });
        expect(s.showCode).toBe(false);
        expect(s.label).toBe("Sign in with Recoder");
    });
});

describe("firstParallelPreselection — the first-parallel-task CTA decision", () => {
    it("null when fewer than two agents are launchable (never a one-agent parallel)", () => {
        expect(firstParallelPreselection([])).toBeNull();
        expect(firstParallelPreselection([{ runtimeId: "codex", available: true }])).toBeNull();
        expect(
            firstParallelPreselection([
                { runtimeId: "codex", available: true },
                { runtimeId: "claude_code", available: false },
            ])
        ).toBeNull();
    });

    it("first detected agent is primary, every other detected agent rides also-run", () => {
        expect(
            firstParallelPreselection([
                { runtimeId: "claude_code", available: true },
                { runtimeId: "opencode", available: false },
                { runtimeId: "codex", available: true },
                { runtimeId: "gemini_cli", available: true },
            ])
        ).toEqual({ primary: "claude_code", also: ["codex", "gemini_cli"] });
    });

    it("tolerates null input", () => {
        expect(firstParallelPreselection(null as unknown as { runtimeId: string; available: boolean }[])).toBeNull();
    });
});

describe("showConvergeAffordance — per-card compare/converge decision", () => {
    it("true only for a real taskGroup with 2+ siblings", () => {
        expect(showConvergeAffordance("grp_a", 2)).toBe(true);
        expect(showConvergeAffordance("grp_a", 5)).toBe(true);
    });

    it("false for solo rows, empty/null groups, and single-member groups", () => {
        expect(showConvergeAffordance(null, 2)).toBe(false);
        expect(showConvergeAffordance("", 2)).toBe(false);
        expect(showConvergeAffordance("grp_a", 1)).toBe(false);
        expect(showConvergeAffordance("grp_a", 0)).toBe(false);
    });
});

describe("parseArchivedPage — archived envelope meta retention", () => {
    it("keeps the workspaces AND the {total,limit,offset} meta", () => {
        const a = makeWs();
        const parsed = parseArchivedPage({
            success: true,
            data: { workspaces: [a] },
            meta: { total: 431, limit: 200, offset: 0 },
        });
        expect(parsed.workspaces).toEqual([a]);
        expect(parsed.meta).toEqual({ total: 431, limit: 200, offset: 0 });
    });

    it("an older backend without meta yields the list with meta null (no fabricated total)", () => {
        const parsed = parseArchivedPage({ success: true, data: { workspaces: [makeWs()] } });
        expect(parsed.workspaces).toHaveLength(1);
        expect(parsed.meta).toBeNull();
    });

    it("non-numeric meta fields degrade to null", () => {
        const parsed = parseArchivedPage({
            data: { workspaces: [] },
            meta: { total: "431", limit: 200, offset: 0 },
        });
        expect(parsed.meta).toBeNull();
    });

    it("malformed bodies degrade to an empty page, never a throw", () => {
        for (const bad of [null, undefined, "nope", 42, {}, { data: { workspaces: "x" } }]) {
            expect(parseArchivedPage(bad)).toEqual({ workspaces: [], meta: null });
        }
    });
});

describe("archivedHistoryNotice — the 'newest N of M' truth chip", () => {
    it("names the loaded slice when the backend reported more history", () => {
        expect(archivedHistoryNotice({ total: 431, limit: 200, offset: 0 }, 200)).toBe("newest 200 of 431");
    });

    it("empty when everything is loaded or the total is unknown", () => {
        expect(archivedHistoryNotice({ total: 200, limit: 200, offset: 0 }, 200)).toBe("");
        expect(archivedHistoryNotice({ total: 12, limit: 200, offset: 0 }, 12)).toBe("");
        expect(archivedHistoryNotice(null, 200)).toBe("");
    });

    it("stays truthful after an older page loads (loaded count grows)", () => {
        expect(archivedHistoryNotice({ total: 431, limit: 200, offset: 200 }, 400)).toBe("newest 400 of 431");
        expect(archivedHistoryNotice({ total: 431, limit: 200, offset: 400 }, 431)).toBe("");
    });
});

describe("archived page merge — 'show older' appends without duplicating", () => {
    it("appends the next page after the loaded history, dropping overlap by id", () => {
        const page1 = [makeWs(), makeWs()];
        // A row archived between the two fetches shifts the pages: page2's first
        // row can duplicate page1's last. The merge keeps the loaded copy.
        const shifted = { ...page1[1] };
        const page2 = [shifted, makeWs()];
        const merged = mergeArchivedHistory(page1, page2);
        expect(merged.map((ws) => ws.workspaceId)).toEqual([
            page1[0].workspaceId,
            page1[1].workspaceId,
            page2[1].workspaceId,
        ]);
    });

    it("a re-read first page wins over the retained older pages on collision", () => {
        const older = [makeWs(), makeWs()];
        const freshCopy = { ...older[0], branch: "renamed" };
        const merged = mergeArchivedHistory([freshCopy], older);
        expect(merged).toHaveLength(2);
        expect(merged[0].branch).toBe("renamed");
        expect(merged[1].workspaceId).toBe(older[1].workspaceId);
    });
});
