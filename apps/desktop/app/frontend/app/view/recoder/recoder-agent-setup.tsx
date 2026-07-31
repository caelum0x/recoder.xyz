// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// First-run "Set up your first agent" affordance. A non-terminal user with no
// PATH-detected coding agent otherwise dead-ends at "No agents found" with no way
// forward — this lists the supported agents with a one-click copy of a real
// install command, plus a "Re-scan agents" action that re-probes the login-shell
// PATH WITHOUT an app restart. Stays truthful: it never claims an agent is
// installed; the re-scan re-reads /runtimes (fresh PATH probe per request) and
// launch only enables once one is actually detected.

import { useState } from "react";
import { agentLoginGuide, type AgentPresentation } from "./recoder-agent-auth";
import { agentLabel } from "./recoder-agent-labels";
import type { RecoderViewModel } from "./recoder-model";
import { FIELD_LABEL, META, QUIET_BTN, ROW_TITLE } from "./recoder-styles";

// One supported agent's install recipe. `command` is the copy-to-clipboard line;
// `docsUrl` links the vendor's own install docs so a user can verify before
// running it. Keyed by the exact conductor runtimeId so agentLabel renders the
// friendly name and a later re-scan matches what the backend probes.
type AgentInstallGuide = {
    readonly runtimeId: string;
    readonly command: string;
    readonly docsUrl: string;
};

// The reliably npm-installable agent CLIs. Kept intentionally short and to
// widely-documented commands so the guidance is never a wrong/dangerous command.
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
        runtimeId: "gemini_cli",
        command: "npm install -g @google/gemini-cli",
        docsUrl: "https://github.com/google-gemini/gemini-cli",
    },
];

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
    guide: AgentInstallGuide;
};

function AgentSetupRow({ guide }: AgentSetupRowProps) {
    const [copied, setCopied] = useState(false);
    const onCopy = async () => {
        const ok = await copyToClipboard(guide.command);
        if (!ok) {
            return;
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (
        <div className="flex items-center gap-2">
            <span className={`${ROW_TITLE} w-28 shrink-0`}>{agentLabel(guide.runtimeId)}</span>
            <code className="min-w-0 flex-1 truncate rounded border border-white/8 bg-white/[0.04] px-2 py-0.5 font-mono text-xs text-secondary">
                {guide.command}
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

AgentSetupRow.displayName = "AgentSetupRow";

type RecoderAgentSetupProps = {
    model: RecoderViewModel;
    probing: boolean;
};

// Rendered whenever setup has probed and found NO ready agent. Turns the dead-end
// into a guided next step.
function RecoderAgentSetup({ model, probing }: RecoderAgentSetupProps) {
    return (
        <div className="flex flex-col gap-2 rounded border border-white/8 p-3">
            <div className="flex items-center gap-2">
                <span className={FIELD_LABEL}>Set up your first agent</span>
                <div className="flex-1" />
                <button className={QUIET_BTN} disabled={probing} onClick={() => model.rescanAgents()}>
                    {probing ? "Scanning…" : "Re-scan agents"}
                </button>
            </div>
            <div className={META}>
                No coding agent was found on your PATH. Install one below, then re-scan — no restart needed.
            </div>
            <div className="flex flex-col gap-1.5">
                {AGENT_INSTALL_GUIDES.map((guide) => (
                    <AgentSetupRow key={guide.runtimeId} guide={guide} />
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

// The "detected · authenticate" affordance for an installed-but-unverified agent.
// `/runtimes` carries no login signal, so the picker can't promise the agent is
// ready — this hands the user the real fix path (the CLI's own login command +
// vendor docs) without ever hard-blocking launch. Renders nothing for an agent we
// have no login recipe for, so it never invents guidance.
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
    copyToClipboard,
    RecoderAgentSetup,
    type AgentInstallGuide,
};
