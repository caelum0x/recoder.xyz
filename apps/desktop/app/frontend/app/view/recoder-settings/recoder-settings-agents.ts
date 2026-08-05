// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Pure shaping for the Settings "Agents" section, kept free of jotai/fetch (like
// recoder-settings-health.ts) so vitest covers it fully. GET
// /api/conductor/runtimes answers via sendSuccess — { data: { runtimes:
// [{ runtimeId, available }] } }. The section is READ-ONLY and truthful: it lists
// the coding agents actually detected on this machine, humanized so no raw
// runtime id (claude_code) or in-process engine name reaches the user. When the
// probe yields nothing detectable, the derived list is empty and the section is
// omitted rather than faked.

import { agentLabel } from "../recoder/recoder-agent-labels";

type DetectedAgent = {
    runtimeId: string;
    label: string;
};

// openfang is the in-process engine, not a coding agent the user launches into a
// worktree (mirrors recoder-model.ts's refreshSetup filter) — it must never
// surface as a user-facing "agent".
const HiddenRuntimeIds = new Set(["openfang"]);

// Dig data.runtimes out of the /api/conductor/runtimes envelope and reduce it to
// the DETECTED (available) coding agents, humanized and de-duplicated in probe
// order. A missing/malformed body yields [] — the section then omits truthfully.
function parseDetectedAgents(body: unknown): DetectedAgent[] {
    const outer = body as { data?: unknown } | null;
    const data = outer?.data != null && typeof outer.data == "object" ? (outer.data as Record<string, unknown>) : body;
    const runtimes = (data as { runtimes?: unknown } | null)?.runtimes;
    if (!Array.isArray(runtimes)) {
        return [];
    }
    const seen = new Set<string>();
    const out: DetectedAgent[] = [];
    for (const raw of runtimes) {
        if (raw == null || typeof raw != "object") {
            continue;
        }
        const entry = raw as Record<string, unknown>;
        const runtimeId = typeof entry.runtimeId == "string" ? entry.runtimeId.trim() : "";
        if (runtimeId == "" || entry.available !== true || HiddenRuntimeIds.has(runtimeId) || seen.has(runtimeId)) {
            continue;
        }
        seen.add(runtimeId);
        out.push({ runtimeId, label: agentLabel(runtimeId) });
    }
    return out;
}

export { parseDetectedAgents, type DetectedAgent };
