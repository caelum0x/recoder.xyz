// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import {
    launchDisabledReason,
    nextRecentRepos,
    orderedRecentRepos,
    parallelSelectionHint,
    planLaunchAgents,
    reconcileSelection,
    seedAgentSelection,
    selectedAgentIds,
    shapeLaunchRequestBody,
    toggleAgentSelection,
    type LaunchRequestContext,
} from "./recoder-launch-logic";

describe("selectedAgentIds", () => {
    it("folds primary + also into one ordered, deduped, blank-free list", () => {
        expect(selectedAgentIds("claude", ["codex", "", "claude", "opencode"])).toEqual([
            "claude",
            "codex",
            "opencode",
        ]);
    });

    it("is empty when nothing is selected", () => {
        expect(selectedAgentIds("", [])).toEqual([]);
        expect(selectedAgentIds("  ", ["", "  "])).toEqual([]);
    });
});

describe("toggleAgentSelection", () => {
    it("adds a newly-ticked agent to the also list, keeping the primary", () => {
        expect(toggleAgentSelection("claude", [], "codex", true)).toEqual({
            primary: "claude",
            also: ["codex"],
        });
    });

    it("promotes the first remaining agent when the primary is un-ticked", () => {
        expect(toggleAgentSelection("claude", ["codex", "opencode"], "claude", false)).toEqual({
            primary: "codex",
            also: ["opencode"],
        });
    });

    it("removing the last selected agent yields an empty selection (reachable zero)", () => {
        expect(toggleAgentSelection("claude", [], "claude", false)).toEqual({ primary: "", also: [] });
    });

    it("ticking an already-selected agent is a no-op on the set", () => {
        expect(toggleAgentSelection("claude", ["codex"], "codex", true)).toEqual({
            primary: "claude",
            also: ["codex"],
        });
    });
});

describe("seedAgentSelection", () => {
    it("defaults to every detected agent when nothing is remembered", () => {
        expect(seedAgentSelection(["claude", "codex", "opencode"], [])).toEqual([
            "claude",
            "codex",
            "opencode",
        ]);
    });

    it("a remembered selection wins, filtered to what's still installed", () => {
        expect(seedAgentSelection(["claude", "codex"], ["codex", "cursor", "claude"])).toEqual([
            "codex",
            "claude",
        ]);
    });

    it("falls back to all-detected when the remembered agents are all gone", () => {
        expect(seedAgentSelection(["claude"], ["cursor", "gemini"])).toEqual(["claude"]);
    });
});

describe("reconcileSelection", () => {
    it("drops now-uninstalled agents without re-adding anything", () => {
        expect(reconcileSelection(["claude", "opencode"], "codex", ["claude", "opencode"])).toEqual({
            primary: "claude",
            also: ["opencode"],
        });
    });

    it("keeps a deliberate single selection intact", () => {
        expect(reconcileSelection(["claude", "codex"], "claude", [])).toEqual({
            primary: "claude",
            also: [],
        });
    });
});

describe("planLaunchAgents", () => {
    it("solo launch carries no taskGroup", () => {
        const plan = planLaunchAgents("claude", [], () => "grp_should_not_be_used");
        expect(plan.agents).toEqual(["claude"]);
        expect(plan.taskGroup).toBe("");
    });

    it("N selected agents share ONE generated taskGroup", () => {
        let calls = 0;
        const plan = planLaunchAgents("claude", ["codex", "opencode"], () => {
            calls += 1;
            return "grp_shared";
        });
        expect(plan.agents).toEqual(["claude", "codex", "opencode"]);
        expect(plan.taskGroup).toBe("grp_shared");
        expect(calls).toBe(1);
    });

    it("dedupes so a doubled agent doesn't fabricate a fake parallel group", () => {
        const plan = planLaunchAgents("claude", ["claude"], () => "grp_x");
        expect(plan.agents).toEqual(["claude"]);
        expect(plan.taskGroup).toBe("");
    });
});

describe("shapeLaunchRequestBody", () => {
    const base: LaunchRequestContext = {
        repoPath: "/repo",
        prompt: "",
        branch: "",
        interactive: false,
        taskGroup: "",
        agentCount: 1,
        projectId: "proj-1",
    };

    it("N agents in a fan-out produce N bodies with a shared taskGroup and distinct taskIds", () => {
        const agents = ["claude", "codex", "opencode"];
        const ctx: LaunchRequestContext = { ...base, agentCount: agents.length, taskGroup: "grp_shared" };
        const bodies = agents.map((a, i) => shapeLaunchRequestBody(ctx, a, `task-${i}`));
        expect(bodies).toHaveLength(3);
        expect(bodies.map((b) => b.runtimeId)).toEqual(agents);
        expect(bodies.map((b) => b.taskGroup)).toEqual(["grp_shared", "grp_shared", "grp_shared"]);
        expect(bodies.map((b) => b.taskId)).toEqual(["task-0", "task-1", "task-2"]);
        expect(bodies.every((b) => b.repoPath == "/repo" && b.projectId == "proj-1")).toBe(true);
    });

    it("omits optional fields rather than sending them blank", () => {
        const body = shapeLaunchRequestBody(base, "claude", "task-0");
        expect(body).toEqual({
            spaceId: "default",
            projectId: "proj-1",
            taskId: "task-0",
            repoPath: "/repo",
            runtimeId: "claude",
        });
    });

    it("honors a user branch only for a solo launch", () => {
        const solo = shapeLaunchRequestBody({ ...base, branch: "feature/x", agentCount: 1 }, "claude", "t");
        expect(solo.branch).toBe("feature/x");
        const parallel = shapeLaunchRequestBody(
            { ...base, branch: "feature/x", agentCount: 3, taskGroup: "grp" },
            "claude",
            "t"
        );
        expect(parallel.branch).toBeUndefined();
    });

    it("passes prompt + interactive through when set", () => {
        const body = shapeLaunchRequestBody({ ...base, prompt: "  fix the bug  ", interactive: true }, "codex", "t");
        expect(body.prompt).toBe("fix the bug");
        expect(body.interactive).toBe(true);
    });
});

describe("launchDisabledReason", () => {
    it("asks for a folder first", () => {
        expect(launchDisabledReason("", 2, false, true, 3)).toBe("Choose a folder to launch.");
    });

    it("multi-agent case: zero selected with agents available asks to select one", () => {
        expect(launchDisabledReason("/repo", 0, false, true, 3)).toBe("Select at least one agent to launch.");
    });

    it("distinguishes still-probing from genuinely-none", () => {
        expect(launchDisabledReason("/repo", 0, false, false, 0)).toBe("Detecting installed agents…");
        expect(launchDisabledReason("/repo", 0, false, true, 0)).toContain("No coding agents found");
    });

    it("a valid multi-agent selection has nothing to say (enabled)", () => {
        expect(launchDisabledReason("/repo", 3, false, true, 3)).toBe("");
    });

    it("still enforces a first message for a non-interactive run", () => {
        expect(launchDisabledReason("/repo", 2, true, true, 3)).toBe(
            "Add a first message, or turn on interactive session."
        );
    });
});

describe("parallelSelectionHint", () => {
    it("is silent for a solo launch", () => {
        expect(parallelSelectionHint(0)).toBe("");
        expect(parallelSelectionHint(1)).toBe("");
    });

    it("names the parallel count for the multi case", () => {
        expect(parallelSelectionHint(3)).toBe(
            "3 agents selected — they'll run in parallel, each in its own worktree."
        );
    });
});

describe("orderedRecentRepos", () => {
    it("keeps most-recent-first order, drops the current folder and dupes", () => {
        expect(orderedRecentRepos(["/a", "/b", "/a", "/c"], "/b")).toEqual(["/a", "/c"]);
    });

    it("tolerates blanks and an absent list", () => {
        expect(orderedRecentRepos(["", "  ", "/a"], "")).toEqual(["/a"]);
        expect(orderedRecentRepos(undefined as unknown as string[], "")).toEqual([]);
    });
});

describe("nextRecentRepos", () => {
    it("moves the just-used folder to the front, deduped and capped", () => {
        expect(nextRecentRepos(["/a", "/b", "/c"], "/b", 8)).toEqual(["/b", "/a", "/c"]);
        expect(nextRecentRepos(["/a", "/b", "/c"], "/d", 2)).toEqual(["/d", "/a"]);
    });

    it("a blank path leaves the list untouched", () => {
        expect(nextRecentRepos(["/a"], "  ", 8)).toEqual(["/a"]);
    });
});
