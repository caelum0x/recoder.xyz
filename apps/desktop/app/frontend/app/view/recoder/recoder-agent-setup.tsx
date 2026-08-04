// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// First-run "getting started with no agents" flow. A user with no PATH-detected
// coding agent otherwise dead-ends at "No agents found" with no way forward — this
// walks each supported agent through its real, truthful state:
//   - not installed  → the exact install command (copy) + vendor docs
//   - installed, login unverified / signed out → "run <agent> once to sign in"
//     (the CLI carries its own auth; `/runtimes` proves PATH only, never login)
//   - installed + confirmed login → ✓ ready, no command
// plus a "Re-scan agents" that re-probes (login-shell PATH via /runtimes AND the
// /environment import) WITHOUT an app restart. Stays truthful: it never claims an
// agent is installed or signed in when unknown, and launch is enabled elsewhere
// only once an agent is actually detected.

import { useAtomValue } from "jotai";
import { useState } from "react";
import { cn } from "@/util/util";
import {
    agentAuthPresentation,
    agentLoginGuide,
    type AgentAuthState,
    type AgentLoginGuide,
    type AgentPresentation,
} from "./recoder-agent-auth";
import { agentLabel } from "./recoder-agent-labels";
import type { RecoderViewModel } from "./recoder-model";
import { FIELD_LABEL, META, QUIET_BTN, ROW_TITLE } from "./recoder-styles";

// One supported agent's install recipe. `command` is the copy-to-clipboard line;
// `docsUrl` links the vendor's own install docs so a user can verify before
// running it. Keyed by the exact conductor runtimeId so agentLabel renders the
// friendly name and a re-scan matches what the backend probes.
type AgentInstallGuide = {
    readonly runtimeId: string;
    readonly command: string;
    readonly docsUrl: string;
};

// The supported agents' install recipes, in fastest-first order (Claude Code
// leads, so the zero-agent guidance highlights it). Commands are the widely
// documented one-liners; truthful-over-specific per vendor — the Docs link is the
// authoritative anchor if a command drifts.
const AGENT_INSTALL_GUIDES: readonly AgentInstallGuide[] = [
    {
        runtimeId: "claude_code",
        command: "npm install -g @anthropic-ai/claude-code",
        docsUrl: "https://docs.claude.com/en/docs/claude-code/overview",
    },
    {
        runtimeId: "codex",
        command: "npm install -g @openai/codex",
        docsUrl: "https://github.com/openai/codex",
    },
    {
        runtimeId: "opencode",
        command: "npm install -g opencode-ai",
        docsUrl: "https://opencode.ai/docs/",
    },
    {
        runtimeId: "cursor",
        // Cursor's CLI (cursor-agent) ships via its own installer, not npm.
        command: "curl https://cursor.com/install -fsS | bash",
        docsUrl: "https://docs.cursor.com/en/cli/overview",
    },
    {
        runtimeId: "gemini_cli",
        command: "npm install -g @google/gemini-cli",
        docsUrl: "https://github.com/google-gemini/gemini-cli",
    },
];

// The truthful setup step for one agent, collapsed from the auth presentation
// badge: "install" (not on PATH), "sign-in" (installed but login unverified or
// known-signed-out), "ready" (installed + confirmed login). We never invent a
// "ready" the probe couldn't prove — "detected" (unknown login) reads as "sign-in".
type AgentSetupStep = "install" | "sign-in" | "ready";

const AGENT_STEP_LABEL: Record<AgentSetupStep, string> = {
    install: "Install",
    "sign-in": "Sign in",
    ready: "Ready",
};

// One agent's fully-derived getting-started row: its truthful step plus the
// install and (best-effort) login recipes the row renders.
type AgentSetupRowState = {
    readonly runtimeId: string;
    readonly step: AgentSetupStep;
    readonly badge: AgentPresentation["badge"];
    readonly install: AgentInstallGuide;
    readonly login: AgentLoginGuide | undefined;
};

function stepForBadge(badge: AgentPresentation["badge"]): AgentSetupStep {
    if (badge == "ready") {
        return "ready";
    }
    if (badge == "not installed") {
        return "install";
    }
    // "detected" (login unverifiable) and "sign-in needed" (known signed out) both
    // mean: installed, just run the CLI once to sign in.
    return "sign-in";
}

// Pure derivation of the per-agent setup rows from the two truthful signals: PATH
// availability (from /runtimes) and the best-effort auth verdict map. Iterates the
// supported install guides so the panel always shows the same agents regardless of
// what the backend happened to enumerate. Kept pure (no React) so state derivation
// is unit-testable.
function deriveAgentSetupRows(
    agents: readonly { runtimeId: string; available: boolean }[],
    agentAuth: Readonly<Record<string, AgentAuthState>>
): AgentSetupRowState[] {
    return AGENT_INSTALL_GUIDES.map((install) => {
        const available = agents.some((a) => a.runtimeId == install.runtimeId && a.available);
        const authState: AgentAuthState = agentAuth[install.runtimeId] ?? "unknown";
        const badge = agentAuthPresentation(available, authState).badge;
        return {
            runtimeId: install.runtimeId,
            step: stepForBadge(badge),
            badge,
            install,
            login: agentLoginGuide(install.runtimeId),
        };
    });
}

// Whether the user can launch anything yet, plus the fastest install path to
// highlight when they can't. "Ready to launch" == installed (an install-step row
// is the only not-launchable state; an installed-but-unverified agent still
// launches, labelled honestly). fastestPath is the first not-installed row (Claude
// Code leads the list) so the zero-agent case has one obvious next action.
type AgentSetupGuidance = {
    readonly launchableCount: number;
    readonly zeroReady: boolean;
    readonly fastestPath: AgentSetupRowState | null;
};

// `extraLaunchable` = launchable agents the backend enumerates that are NOT in
// the guide list (windsurf/replit/etc). zeroReady must reflect the FULL
// launchable set, or a user running only an off-guide agent is falsely told
// "you need an agent" while their launch card works.
function agentSetupGuidance(
    rows: readonly AgentSetupRowState[],
    extraLaunchable = 0
): AgentSetupGuidance {
    const guideLaunchable = rows.filter((r) => r.step != "install").length;
    const launchableCount = guideLaunchable + extraLaunchable;
    const zeroReady = launchableCount == 0;
    const fastestPath = zeroReady ? (rows.find((r) => r.step == "install") ?? null) : null;
    return { launchableCount, zeroReady, fastestPath };
}

// Count launchable agents the backend enumerates beyond the guide list, so
// guidance reflects the true set (not just the 5 documented installers).
function extraLaunchableCount(
    agents: readonly { runtimeId: string; available: boolean }[]
): number {
    const guideIds = new Set(AGENT_INSTALL_GUIDES.map((g) => g.runtimeId));
    return agents.filter((a) => a.available && !guideIds.has(a.runtimeId)).length;
}

// The panel's "Re-scan agents" delegates to the model's re-probe, which re-reads
// /runtimes (fresh PATH probe per request) AND the /environment import without an
// app restart. Extracted so the wiring is unit-testable without a DOM.
function requestAgentRescan(model: Pick<RecoderViewModel, "rescanAgents">): void {
    void model.rescanAgents();
}

// Degrade-safe clipboard write — a context without navigator.clipboard.writeText
// (or a denied permission) returns false so the caller never shows a false
// "Copied". Reads through globalThis so a non-DOM context can't ReferenceError.
async function copyToClipboard(text: string): Promise<boolean> {
    try {
        const clipboard = globalThis.navigator?.clipboard;
        if (clipboard == null || typeof clipboard.writeText != "function") {
            return false;
        }
        await clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

type AgentSetupRowProps = {
    row: AgentSetupRowState;
    highlight: boolean;
};

function AgentSetupRow({ row, highlight }: AgentSetupRowProps) {
    const [copied, setCopied] = useState(false);
    // For an installed-but-unsigned-in agent the actionable command is the CLI's
    // own login (run it once); fall back to the install recipe only if we somehow
    // have no login guide, so the row never renders an empty command.
    const command = row.step == "sign-in" ? (row.login?.loginCommand ?? row.install.command) : row.install.command;
    const docsUrl = row.step == "sign-in" ? (row.login?.docsUrl ?? row.install.docsUrl) : row.install.docsUrl;
    const onCopy = async () => {
        const ok = await copyToClipboard(command);
        if (!ok) {
            return;
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (
        <div className={cn("flex items-center gap-2 rounded px-1 py-0.5", highlight && "bg-accent/[0.06] ring-1 ring-accent/30")}>
            <span className={`${ROW_TITLE} w-28 shrink-0`}>{agentLabel(row.runtimeId)}</span>
            {row.step == "ready" ? (
                <span className="text-xs text-accent">✓ Signed in — ready to launch</span>
            ) : (
                <>
                    <span className={cn(META, "w-14 shrink-0")}>{AGENT_STEP_LABEL[row.step]}</span>
                    <code className="min-w-0 flex-1 truncate rounded border border-white/8 bg-white/[0.04] px-2 py-0.5 font-mono text-xs text-secondary">
                        {command}
                    </code>
                    <button className={QUIET_BTN} onClick={onCopy}>
                        {copied ? "Copied" : "Copy"}
                    </button>
                    <a
                        className={`${META} shrink-0 hover:text-primary`}
                        href={docsUrl}
                        target="_blank"
                        rel="noreferrer"
                    >
                        Docs
                    </a>
                </>
            )}
        </div>
    );
}

AgentSetupRow.displayName = "AgentSetupRow";

type RecoderAgentSetupProps = {
    model: RecoderViewModel;
    probing: boolean;
};

// Rendered on first run (no launchable agent) or when the user opens the install
// steps from a dimmed chip. Reads the two truthful signals off the model so it
// stays self-sufficient (no prop drilling from the launch card) and turns the
// dead-end into a guided next step.
function RecoderAgentSetup({ model, probing }: RecoderAgentSetupProps) {
    const setup = useAtomValue(model.setupAtom);
    const agentAuth = useAtomValue(model.agentAuthAtom);
    const rows = deriveAgentSetupRows(setup.agents, agentAuth);
    const guidance = agentSetupGuidance(rows, extraLaunchableCount(setup.agents));
    return (
        <div className="flex flex-col gap-2 rounded border border-white/8 p-3">
            <div className="flex items-center gap-2">
                <span className={FIELD_LABEL}>Set up your first agent</span>
                <div className="flex-1" />
                <button className={QUIET_BTN} disabled={probing} onClick={() => requestAgentRescan(model)}>
                    {probing ? "Scanning…" : "Re-scan agents"}
                </button>
            </div>
            <div className={META}>
                {guidance.zeroReady
                    ? `You need at least one coding agent to launch. Fastest path: install ${agentLabel(
                          guidance.fastestPath?.runtimeId ?? "claude_code"
                      )} below, then re-scan — no restart needed.`
                    : "Install or sign in to another agent below, then re-scan — no restart needed."}
            </div>
            <div className="flex flex-col gap-1.5">
                {rows.map((row) => (
                    <AgentSetupRow
                        key={row.runtimeId}
                        row={row}
                        highlight={guidance.fastestPath?.runtimeId == row.runtimeId}
                    />
                ))}
            </div>
        </div>
    );
}

RecoderAgentSetup.displayName = "RecoderAgentSetup";

type AgentAuthAffordanceProps = {
    runtimeId: string;
    badge: AgentPresentation["badge"];
};

// The "detected · authenticate" affordance for an installed-but-unverified agent
// in the launch picker. `/runtimes` carries no login signal, so the picker can't
// promise the agent is ready — this hands the user the real fix path (the CLI's
// own login command + vendor docs) without ever hard-blocking launch. Renders
// nothing for an agent we have no login recipe for, so it never invents guidance.
function AgentAuthAffordance({ runtimeId, badge }: AgentAuthAffordanceProps) {
    const [copied, setCopied] = useState(false);
    const guide = agentLoginGuide(runtimeId);
    if (guide == null) {
        return null;
    }
    const onCopy = async () => {
        const ok = await copyToClipboard(guide.loginCommand);
        if (!ok) {
            return;
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    const lead =
        badge == "sign-in needed"
            ? `${agentLabel(runtimeId)} isn’t signed in. Authenticate, then launch:`
            : `${agentLabel(runtimeId)} detected — sign-in isn’t verified. If launch fails, authenticate:`;
    return (
        <div className="flex flex-wrap items-center gap-2">
            <span className={META}>{lead}</span>
            <code className="min-w-0 rounded border border-white/8 bg-white/[0.04] px-2 py-0.5 font-mono text-xs text-secondary">
                {guide.loginCommand}
            </code>
            <button className={QUIET_BTN} onClick={onCopy}>
                {copied ? "Copied" : "Copy"}
            </button>
            <a
                className={`${META} shrink-0 hover:text-primary`}
                href={guide.docsUrl}
                target="_blank"
                rel="noreferrer"
            >
                Docs
            </a>
        </div>
    );
}

AgentAuthAffordance.displayName = "AgentAuthAffordance";

export {
    AGENT_INSTALL_GUIDES,
    AgentAuthAffordance,
    agentSetupGuidance,
    copyToClipboard,
    deriveAgentSetupRows,
    extraLaunchableCount,
    RecoderAgentSetup,
    requestAgentRescan,
    type AgentInstallGuide,
    type AgentSetupGuidance,
    type AgentSetupRowState,
    type AgentSetupStep,
};
