// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Pure shaping for the launch panel: the multi-agent selection set, the request
// bodies a fan-out POST sends, the recent-repos quick-pick order, and the
// truthful disabled/parallel hints. Kept free of React/atoms so the shaping is
// unit-testable without a DOM — the panel and the model both drive off these.

// The launch panel stores its selection as a primary agent + an "also run" list
// (so a single agent stays the trivial case). Fold them into one ordered,
// de-duplicated, blank-free list — primary first — which is the actual set the
// launch fans across.
function selectedAgentIds(primary: string, also: readonly string[]): string[] {
    const p = (primary ?? "").trim();
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of [p, ...(also ?? [])]) {
        const t = (id ?? "").trim();
        if (t == "" || seen.has(t)) {
            continue;
        }
        seen.add(t);
        out.push(t);
    }
    return out;
}

type AgentSelection = { primary: string; also: string[] };

// Toggle one agent chip while keeping the (primary, also) shape coherent: turning
// an agent ON appends it to `also` (unless it's already the primary); turning the
// PRIMARY off promotes the first remaining agent to primary so the selection
// never loses its lead while other agents stay ticked.
function toggleAgentSelection(
    primary: string,
    also: readonly string[],
    id: string,
    on: boolean
): AgentSelection {
    const target = (id ?? "").trim();
    if (target == "") {
        return { primary: (primary ?? "").trim(), also: [...(also ?? [])] };
    }
    const current = selectedAgentIds(primary, also);
    const next = on
        ? current.includes(target)
            ? current
            : [...current, target]
        : current.filter((x) => x != target);
    return { primary: next[0] ?? "", also: next.slice(1) };
}

// The default selection when the panel opens with no usable remembered choice:
// every detected agent, so "fan one task across agents" is the zero-config
// default. A remembered selection (persisted from the last launch) wins and is
// returned filtered to what's still installed; order follows `readyIds`.
function seedAgentSelection(readyIds: readonly string[], remembered: readonly string[]): string[] {
    const ready = (readyIds ?? []).map((id) => (id ?? "").trim()).filter((id) => id != "");
    const readySet = new Set(ready);
    const kept: string[] = [];
    const seen = new Set<string>();
    for (const id of remembered ?? []) {
        const t = (id ?? "").trim();
        if (readySet.has(t) && !seen.has(t)) {
            seen.add(t);
            kept.push(t);
        }
    }
    return kept.length > 0 ? kept : ready;
}

// Drop any agent no longer detected from the current selection WITHOUT re-adding
// anything, so a stale/uninstalled agent can't linger but a deliberate
// de-selection is preserved (never silently re-filled).
function reconcileSelection(readyIds: readonly string[], primary: string, also: readonly string[]): AgentSelection {
    const readySet = new Set((readyIds ?? []).map((id) => (id ?? "").trim()));
    const kept = selectedAgentIds(primary, also).filter((id) => readySet.has(id));
    return { primary: kept[0] ?? "", also: kept.slice(1) };
}

type LaunchAgentPlan = { agents: string[]; taskGroup: string };

// Turn the folded selection into the fan-out plan: the ordered agent list plus a
// SHARED taskGroup id when (and only when) there are 2+ siblings — a solo launch
// carries no taskGroup so the board doesn't render a one-member "group".
function planLaunchAgents(primary: string, also: readonly string[], genTaskGroup: () => string): LaunchAgentPlan {
    const agents = selectedAgentIds(primary, also);
    return { agents, taskGroup: agents.length > 1 ? genTaskGroup() : "" };
}

type LaunchRequestContext = {
    repoPath: string;
    prompt: string;
    branch: string;
    interactive: boolean;
    taskGroup: string;
    // Total agents in this launch — a user branch is honored only for a solo
    // launch, since a shared branch would collide across sibling worktrees.
    agentCount: number;
    projectId: string;
};

// Shape the exact body POST /api/conductor/workspaces expects for one agent in
// the fan-out. Optional fields are omitted (not sent blank) so an empty prompt /
// branch / solo taskGroup never reaches the backend as noise.
function shapeLaunchRequestBody(
    ctx: LaunchRequestContext,
    agent: string,
    taskId: string
): Record<string, unknown> {
    const prompt = (ctx.prompt ?? "").trim();
    const branch = (ctx.branch ?? "").trim();
    return {
        spaceId: "default",
        projectId: ctx.projectId,
        taskId,
        repoPath: ctx.repoPath,
        runtimeId: agent,
        ...(prompt != "" ? { prompt } : {}),
        ...(branch != "" && ctx.agentCount == 1 ? { branch } : {}),
        ...(ctx.interactive ? { interactive: true } : {}),
        ...(ctx.taskGroup != "" ? { taskGroup: ctx.taskGroup } : {}),
    };
}

// Self-explains the greyed Launch button. "" means nothing to say (ready, or
// already posting). Extends the single-agent copy for the multi-select case:
// zero selected is a real block ("Select at least one agent").
function launchDisabledReason(
    repoPath: string,
    selectedCount: number,
    needsPrompt: boolean,
    probed: boolean,
    readyCount: number
): string {
    if ((repoPath ?? "").trim() == "") {
        return "Choose a folder to launch.";
    }
    if (selectedCount <= 0) {
        if (!probed) {
            return "Detecting installed agents…";
        }
        if (readyCount == 0) {
            return "No coding agents found on PATH. Install Claude Code, Codex, or opencode, then reopen.";
        }
        return "Select at least one agent to launch.";
    }
    if (needsPrompt) {
        return "Add a first message, or turn on interactive session.";
    }
    return "";
}

// The calm positive hint next to Launch once the selection is valid: silent for a
// solo launch, truthful about parallelism for 2+ ("3 agents selected — they'll
// run in parallel, each in its own worktree").
function parallelSelectionHint(selectedCount: number): string {
    if (selectedCount <= 1) {
        return "";
    }
    return `${selectedCount} agents selected — they'll run in parallel, each in its own worktree.`;
}

// The recent-folders quick-pick: most-recent-first (the store is already kept in
// that order), de-duplicated, with the currently-picked folder dropped so the
// chips only offer a real switch.
function orderedRecentRepos(recentRepos: readonly string[], currentPath: string): string[] {
    const current = (currentPath ?? "").trim();
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of recentRepos ?? []) {
        const t = (r ?? "").trim();
        if (t == "" || t == current || seen.has(t)) {
            continue;
        }
        seen.add(t);
        out.push(t);
    }
    return out;
}

// The persisted recent-repos list after a successful launch: the just-used folder
// moved to the front, de-duplicated, capped. Pure so the ordering/persistence is
// testable without localStorage.
function nextRecentRepos(existing: readonly string[], repoPath: string, cap: number): string[] {
    const p = (repoPath ?? "").trim();
    if (p == "") {
        return [...(existing ?? [])];
    }
    const rest = (existing ?? []).filter((x) => x != p);
    return [p, ...rest].slice(0, Math.max(0, cap));
}

export {
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
    type AgentSelection,
    type LaunchAgentPlan,
    type LaunchRequestContext,
};
