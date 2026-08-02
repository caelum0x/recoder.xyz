// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// The per-workspace cost/token strip's data seam: build the scoped usage URL,
// fold the backend envelope through the pure metering formatter, and fetch it
// degrade-truthful. null always means "usage unavailable" (transport/backend
// failure or malformed body) — never an all-zero strip faked from a failure.

import { buildUsagePath, summarizeUsage, type MeteringDisplay, type UsagePayloadLike } from "./recoder-metering";

// The workspaceId scope narrows the caller's own ledger rows to this workspace;
// path construction (mount base + scope encoding) lives in buildUsagePath so the
// strip and any other usage reader share one source of truth.
function workspaceUsageUrl(baseUrl: string, workspaceId: string): string {
    return `${baseUrl}${buildUsagePath({ workspaceId })}`;
}

// Fold the { success, data: { totals, recent } } envelope into the strip's
// display model. Anything that is not a successful envelope with an object data
// payload yields null (unavailable) — only a real payload reaches summarizeUsage.
function parseUsageEnvelope(body: unknown): MeteringDisplay {
    if (body == null || typeof body != "object") return null;
    const envelope = body as { success?: unknown; data?: unknown };
    if (envelope.success != true) return null;
    if (envelope.data == null || typeof envelope.data != "object") return null;
    return summarizeUsage(envelope.data as UsagePayloadLike);
}

async function fetchWorkspaceUsage(baseUrl: string, workspaceId: string): Promise<MeteringDisplay> {
    if (workspaceId == "") return null;
    try {
        const res = await fetch(workspaceUsageUrl(baseUrl, workspaceId));
        if (!res.ok) return null;
        const body = await res.json().catch(() => null);
        return parseUsageEnvelope(body);
    } catch {
        return null;
    }
}

export { fetchWorkspaceUsage, parseUsageEnvelope, workspaceUsageUrl };
