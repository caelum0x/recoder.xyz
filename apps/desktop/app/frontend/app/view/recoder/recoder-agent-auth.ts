// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Truthful per-agent AUTH state for the launch picker / getting-started.
//
// A coding-agent CLI can be installed (PATH-detected) yet NOT logged in, so a
// launch then fails opaquely inside the TUI. `/api/conductor/runtimes` only
// reports PATH availability — it carries no login signal — so a best-effort auth
// verdict comes from the main-process bridge (`getApi().probeAgentAuth`), which
// is POSITIVE-ONLY: it confirms "authenticated" only when the CLI's own saved
// credential is on disk, and reports "unknown" for everything else (including
// CLIs that keep their login in the OS keychain). This module owns the pure
// interpretation of that verdict so the picker never overstates: an installed but
// unverified agent shows as "detected" (never a false "ready") and is offered an
// "authenticate" affordance, while launch is NEVER hard-blocked on an unverifiable
// login.

// The three truthful verdicts the bridge probe can yield. "authenticated" and
// "unknown" are what the positive-only probe emits today; "unauthenticated" is
// accepted for a future bridge that can prove a signed-out state for a file-only
// CLI. Anything else coerces to "unknown".
type AgentAuthState = "authenticated" | "unauthenticated" | "unknown";

// One agent's real login path: a copy-paste login command plus the vendor's own
// docs (the authoritative anchor). Kept to widely-documented commands so the
// guidance is never a wrong/dangerous instruction.
type AgentLoginGuide = {
    readonly runtimeId: string;
    readonly loginCommand: string;
    readonly docsUrl: string;
};

const AGENT_LOGIN_GUIDES: readonly AgentLoginGuide[] = [
    {
        runtimeId: "claude_code",
        loginCommand: "claude",
        docsUrl: "https://docs.claude.com/en/docs/claude-code/setup",
    },
    {
        runtimeId: "codex",
        loginCommand: "codex login",
        docsUrl: "https://github.com/openai/codex",
    },
    {
        runtimeId: "opencode",
        loginCommand: "opencode auth login",
        docsUrl: "https://opencode.ai/docs/",
    },
    {
        runtimeId: "gemini_cli",
        loginCommand: "gemini",
        docsUrl: "https://github.com/google-gemini/gemini-cli",
    },
    {
        runtimeId: "qwen_code",
        loginCommand: "qwen",
        docsUrl: "https://github.com/QwenLM/qwen-code",
    },
];

function agentLoginGuide(runtimeId: string): AgentLoginGuide | undefined {
    return AGENT_LOGIN_GUIDES.find((g) => g.runtimeId == runtimeId);
}

// Coerce an untrusted probe result into a safe verdict. Anything that isn't one
// of the three documented states degrades to "unknown" — never a fabricated
// "authenticated".
function parseAgentAuthState(raw: unknown): AgentAuthState {
    // Strict identity so TS narrows `unknown` to the literal union (and so a value
    // like `0`/`""` can never loosely-equal a verdict and slip through).
    if (raw === "authenticated" || raw === "unauthenticated" || raw === "unknown") {
        return raw;
    }
    return "unknown";
}

// How one agent should read in the picker/getting-started, derived TRUTHFULLY from
// PATH availability + the auth verdict.
type AgentPresentation = {
    // Whether the picker may offer this agent as launchable. Installed AND not
    // KNOWN-signed-out. An unverifiable ("unknown") login never blocks launch — we
    // degrade to launchable-but-labelled, never a hard block.
    readonly launchReady: boolean;
    // A short, honest status word.
    readonly badge: "ready" | "detected" | "sign-in needed" | "not installed";
    // Whether to surface the "authenticate" affordance (login command + docs).
    readonly needsAuth: boolean;
};

function agentAuthPresentation(available: boolean, authState: AgentAuthState): AgentPresentation {
    if (!available) {
        return { launchReady: false, badge: "not installed", needsAuth: false };
    }
    if (authState == "authenticated") {
        return { launchReady: true, badge: "ready", needsAuth: false };
    }
    if (authState == "unauthenticated") {
        // A positive "signed out" signal: still launchable (our probe can be wrong,
        // so never hard-block) but tell the truth and push the fix path.
        return { launchReady: true, badge: "sign-in needed", needsAuth: true };
    }
    // Detected, login not verifiable: honest "detected", never a false "ready".
    return { launchReady: true, badge: "detected", needsAuth: true };
}

// The `<option>` suffix for the agent <select>, so a raw dropdown row stays
// truthful: installed-and-confirmed reads bare, everything else is labelled.
function agentAuthOptionSuffix(available: boolean, authState: AgentAuthState): string {
    const badge = agentAuthPresentation(available, authState).badge;
    if (badge == "ready") {
        return "";
    }
    return ` (${badge})`;
}

export {
    AGENT_LOGIN_GUIDES,
    agentAuthOptionSuffix,
    agentAuthPresentation,
    agentLoginGuide,
    parseAgentAuthState,
    type AgentAuthState,
    type AgentLoginGuide,
    type AgentPresentation,
};
