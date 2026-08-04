// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Pure first-run / converge / archived-history decisions for the Workspaces hub,
// kept out of the view + ViewModel so vitest can exercise them without DOM,
// jotai, or fetch. Nothing here fabricates a detection, a sibling, or a total.

import type { AgentAuthState } from "./recoder-agent-auth";
import { agentLabel } from "./recoder-agent-labels";
import type { RecoderWorkspace } from "./recoder-board-logic";
import { isConnectivityError } from "./recoder-errors";
import type { RecoderGithubStatus } from "./recoder-github-logic";

// Structural mirror of the model's RecoderEnvironment (recoder-model.ts) so this
// pure module never imports the stateful model (no runtime cycle).
type FirstRunEnvironment = {
    gitIdentity: { name: string; email: string } | null;
    agentConfigs: { id: string; present: boolean }[];
    ghAuthenticated: boolean | null;
    shell: string;
};

type FirstRunSetupAgent = { runtimeId: string; available: boolean };

// The getting-started card's visibility decision, extracted verbatim from the
// view: an empty board that is not mid-load, has no REAL error (a cold-start
// connectivity failure reads as "still starting", not a failure), and no launch
// panel already open.
function shouldShowGettingStarted(
    loading: boolean,
    workspaceCount: number,
    error: string,
    launchOpen: boolean
): boolean {
    if (loading || workspaceCount > 0 || launchOpen) {
        return false;
    }
    return error == "" || isConnectivityError(error);
}

// One detected-tool chip on the first-run card. `present` folds BOTH detection
// axes truthfully: an agent counts as found when its CLI is on PATH (setup
// probe) OR its config dir exists (environment import). `authed` is true only
// for a POSITIVELY verified credential — unknown never renders as ready.
type FirstRunChip = {
    id: string;
    label: string;
    present: boolean;
    authed: boolean;
    kind: "agent" | "github";
};

// Fold the environment import + PATH probe + auth probe + gh status into the
// card's chip row. Order: PATH-probed agents first (the launchable truth), then
// config-only agents, then one GitHub chip when its state is actually KNOWN
// (gh status probe landed, or the environment import reported a boolean) —
// an unknown gh never fabricates a connected/disconnected chip.
// The environment import's config-dir ids and the runtime specs' launch ids
// diverged for gemini ('gemini' dir probe vs 'gemini_cli' runtime) — normalize
// to the runtime vocabulary so both detection axes fold onto one chip.
const ENV_ID_TO_RUNTIME_ID: Record<string, string> = {
    gemini: "gemini_cli",
};

function firstRunAgentChips(
    env: FirstRunEnvironment | null,
    setupAgents: FirstRunSetupAgent[],
    agentAuth: Record<string, AgentAuthState>,
    github: RecoderGithubStatus | null
): FirstRunChip[] {
    const envById = new Map(
        (env?.agentConfigs ?? []).map((a) => [ENV_ID_TO_RUNTIME_ID[a.id] ?? a.id, a.present])
    );
    const chips: FirstRunChip[] = [];
    const seen = new Set<string>();
    for (const agent of setupAgents ?? []) {
        if (agent.runtimeId == "" || seen.has(agent.runtimeId)) {
            continue;
        }
        seen.add(agent.runtimeId);
        chips.push({
            id: agent.runtimeId,
            label: agentLabel(agent.runtimeId),
            present: agent.available || envById.get(agent.runtimeId) == true,
            authed: agentAuth?.[agent.runtimeId] == "authenticated",
            kind: "agent",
        });
    }
    for (const [id, present] of envById) {
        if (id == "" || seen.has(id)) {
            continue;
        }
        seen.add(id);
        chips.push({
            id,
            label: agentLabel(id),
            present,
            authed: agentAuth?.[id] == "authenticated",
            kind: "agent",
        });
    }
    const ghConnected = github != null ? github.connected : (env?.ghAuthenticated ?? null);
    if (ghConnected != null) {
        chips.push({ id: "github", label: "GitHub", present: ghConnected, authed: ghConnected, kind: "github" });
    }
    return chips;
}

// The first-run card's optional sign-in affordance. Recoder is local-first, so
// sign-in is ONE quiet action, never a gate. While the device flow is in flight
// we surface the inline user-code + URL so the user finishes in the browser
// without hunting for it. Pure + null-safe: the code/URL stay "" until the
// backend actually issues a prompt, so the view never renders a blank "Enter
// code  at " row (no fabricated step).
type FirstRunSignIn = {
    label: string;
    waiting: boolean;
    code: string;
    verificationUri: string;
    showCode: boolean;
};

function firstRunSignIn(signingIn: boolean, prompt: RecoderSignInPrompt | null): FirstRunSignIn {
    const code = prompt?.userCode ?? "";
    const verificationUri = prompt?.verificationUri ?? "";
    return {
        label: signingIn ? "Waiting for browser…" : "Sign in with Recoder",
        waiting: signingIn,
        code,
        verificationUri,
        showCode: signingIn && code != "",
    };
}

// The "Run your first parallel task" preselection: the first detected agent as
// primary, every other detected agent ticked to also-run. null (no CTA) when
// fewer than two agents are actually launchable — never a one-agent "parallel".
function firstParallelPreselection(
    setupAgents: FirstRunSetupAgent[]
): { primary: string; also: string[] } | null {
    const ready = (setupAgents ?? []).filter((a) => a.available && a.runtimeId != "");
    if (ready.length < 2) {
        return null;
    }
    return { primary: ready[0].runtimeId, also: ready.slice(1).map((a) => a.runtimeId) };
}

// A board card gets the persistent "Compare · Converge" affordance only when it
// genuinely has siblings to converge: a real taskGroup with 2+ members.
function showConvergeAffordance(taskGroup: string | null, siblingCount: number): boolean {
    return taskGroup != null && taskGroup != "" && siblingCount >= 2;
}

// The archived edge's pagination meta ({ success, data: { workspaces }, meta }
// — meta rides BESIDE data, see backend workspaces-query.routes sendSuccess).
type ArchivedPageMeta = { total: number; limit: number; offset: number };

// Parse one archived-history page WITHOUT discarding the envelope meta. An
// older backend (no meta) or a malformed body degrades to meta null and/or an
// empty list — the caller then keeps prior state, never a fabricated total.
function parseArchivedPage(body: unknown): { workspaces: RecoderWorkspace[]; meta: ArchivedPageMeta | null } {
    if (body == null || typeof body != "object") {
        return { workspaces: [], meta: null };
    }
    const b = body as { data?: { workspaces?: unknown }; meta?: unknown };
    const raw = b.data?.workspaces;
    const workspaces = Array.isArray(raw) ? (raw as RecoderWorkspace[]) : [];
    const m = b.meta;
    if (m == null || typeof m != "object") {
        return { workspaces, meta: null };
    }
    const { total, limit, offset } = m as Record<string, unknown>;
    if (typeof total != "number" || typeof limit != "number" || typeof offset != "number") {
        return { workspaces, meta: null };
    }
    return { workspaces, meta: { total, limit, offset } };
}

// The quiet history-truth chip: "newest <loaded> of <total>" only when the
// backend REPORTED a total beyond what is loaded. "" (no chip) when the meta is
// unknown or everything is already on screen.
function archivedHistoryNotice(meta: ArchivedPageMeta | null, loadedCount: number): string {
    if (meta == null || meta.total <= loadedCount) {
        return "";
    }
    return `newest ${loadedCount} of ${meta.total}`;
}

export {
    archivedHistoryNotice,
    firstParallelPreselection,
    firstRunAgentChips,
    firstRunSignIn,
    parseArchivedPage,
    shouldShowGettingStarted,
    showConvergeAffordance,
    type ArchivedPageMeta,
    type FirstRunChip,
    type FirstRunEnvironment,
    type FirstRunSetupAgent,
    type FirstRunSignIn,
};
