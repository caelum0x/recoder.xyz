// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Pure derivation for the single navbar health dot (DESIGN-REFERENCE 3C: ONE
// quiet dot for overall up/degraded — never a per-engine grid). Kept free of
// jotai/fetch so vitest covers every branch. The detail (which component is
// impaired, or why the backend is unreachable) lives only in the returned
// `label`, which the dot hangs in a tooltip — never on screen.
//
// Truthfulness is the whole point: a backend we cannot reach must NEVER read as a
// green "all good". We fold the worst-of `status` rollup from GET /health/full
// (backend/src/domains/observability — a raw HealthReport, HTTP 503 when down,
// with a per-domain `sources` array) plus the transport outcome into three tones.

import type { RecoderConnectionState } from "./recoder-connection";

type HealthTone = "up" | "degraded" | "down";

interface HealthDotState {
    readonly tone: HealthTone;
    readonly label: string;
}

// The outcome of one poll cycle, resolved by the model:
// - loading:     the first probe is still in flight (no answer yet) → neutral.
// - unreachable: the fetch threw / there was no HTTP answer. `everConnected`
//                separates a cold boot ("Starting…", amber) from a backend that
//                WAS up and has since gone away ("unreachable", red) — the latter
//                is never excused as "starting" and never reads as up.
// - payload:     a parsed /health/full body; we trust its worst-of `status`.
type HealthInput =
    | { kind: "loading" }
    | { kind: "unreachable"; everConnected: boolean; reason?: string }
    | { kind: "payload"; body: unknown };

function asString(value: unknown): string {
    return typeof value == "string" ? value : "";
}

// Names (with status) of every source NOT fully up, so the tooltip can say WHICH
// component is impaired. Order-preserving; a malformed/absent sources array
// yields [] — the rollup `status` alone still decides the tone.
function impairedComponents(body: Record<string, unknown>): string[] {
    const sources = body.sources;
    if (!Array.isArray(sources)) {
        return [];
    }
    const names: string[] = [];
    for (const raw of sources) {
        if (raw == null || typeof raw != "object") {
            continue;
        }
        const source = raw as Record<string, unknown>;
        const status = asString(source.status);
        if (status == "up") {
            continue;
        }
        const name = asString(source.name);
        if (name == "") {
            continue;
        }
        names.push(`${name} (${status || "unknown"})`);
    }
    return names;
}

function deriveFromPayload(rawBody: unknown): HealthDotState {
    // /health/full answers a RAW HealthReport, but defensively unwrap a
    // sendSuccess envelope so an enveloped health endpoint still derives right.
    const outer = rawBody as { data?: unknown } | null;
    const body =
        outer != null && typeof outer == "object" && outer.data != null && typeof outer.data == "object"
            ? (outer.data as Record<string, unknown>)
            : (rawBody as Record<string, unknown> | null);
    if (body == null || typeof body != "object") {
        // Reachable but unparseable — honest neutral, never a fabricated "up".
        return { tone: "degraded", label: "Backend health unknown" };
    }
    const status = asString(body.status);
    const impaired = impairedComponents(body);
    if (status == "up") {
        return { tone: "up", label: "Backend healthy" };
    }
    if (status == "down") {
        return {
            tone: "down",
            label: impaired.length > 0 ? `Backend down — ${impaired.join(", ")}` : "Backend down",
        };
    }
    if (status == "degraded" || status == "unknown") {
        return {
            tone: "degraded",
            label: impaired.length > 0 ? `Degraded — ${impaired.join(", ")}` : `Backend ${status}`,
        };
    }
    // Missing/unrecognized status: never assume healthy.
    return { tone: "degraded", label: "Backend health unknown" };
}

function deriveHealthDot(input: HealthInput): HealthDotState {
    if (input.kind == "loading") {
        return { tone: "degraded", label: "Checking backend…" };
    }
    if (input.kind == "unreachable") {
        if (!input.everConnected) {
            return { tone: "degraded", label: "Backend starting…" };
        }
        const reason = asString(input.reason);
        return {
            tone: "down",
            label: reason != "" ? `Backend unreachable — ${reason}` : "Backend unreachable",
        };
    }
    return deriveFromPayload(input.body);
}

const TONE_RANK: Record<HealthTone, number> = { up: 0, degraded: 1, down: 2 };

// Map poll-freshness onto the health tone axis so ONE dot can carry both signals
// (DESIGN-REFERENCE 3C: a single quiet dot, never a dot + a separate colored badge).
function connectionTone(state: RecoderConnectionState): HealthTone {
    if (state == "offline") {
        return "down";
    }
    if (state == "stale") {
        return "degraded";
    }
    return "up";
}

// Fold backend health and poll freshness into the single navbar dot: the worse of
// the two tones wins (reachable-but-stale → degraded, offline → down), and a real
// connection problem — the most actionable signal — claims the tooltip. A live
// connection leaves the dot reading exactly as backend health.
function deriveNavDot(health: HealthDotState, connection: RecoderConnectionState): HealthDotState {
    const connTone = connectionTone(connection);
    const tone = TONE_RANK[connTone] >= TONE_RANK[health.tone] ? connTone : health.tone;
    if (connection == "offline") {
        return { tone, label: "Offline — reconnecting" };
    }
    if (connection == "stale") {
        return {
            tone,
            label: health.tone == "up" ? "Stale — reconnecting" : `Stale — reconnecting · ${health.label}`,
        };
    }
    return { tone, label: health.label };
}

export { deriveHealthDot, deriveNavDot, type HealthDotState, type HealthInput, type HealthTone };
