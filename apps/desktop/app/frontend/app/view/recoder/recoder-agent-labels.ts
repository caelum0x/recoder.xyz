// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Single source of friendly agent names for the Wave frontend. Every recoder-*
// view that shows a backend runtime id must route it through agentLabel so raw
// ids (claude_code) and upstream OSS names never reach the UI. Keys are the exact
// runtime ids the conductor can return (backend/src/domains/interop-wire/runtimes/*).
const AGENT_LABELS: Record<string, string> = {
    claude_code: "Claude Code",
    codex: "Codex",
    opencode: "opencode",
    pi: "pi",
    recoder_code: "Recoder Code",
    cursor: "Cursor",
    gemini_cli: "Gemini CLI",
    qwen_code: "Qwen Code",
    crush: "Crush",
};

function agentLabel(runtimeId: string): string {
    const known = AGENT_LABELS[runtimeId];
    if (known != null) return known;
    const words = (runtimeId ?? "")
        .trim()
        .replace(/[_-]+/g, " ")
        .split(/\s+/)
        .filter(Boolean);
    if (words.length == 0) return "Coding agent";
    return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

export { AGENT_LABELS, agentLabel };
