// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Degrade-safe reason read tolerant of BOTH envelope shapes: the real error body
// is { error: { message } }, but an older/leaner backend may send a bare string
// error. Missing/odd shapes fall to "" so the caller shows a truthful fallback.
function readErrorReason(body: unknown): string {
    if (body == null || typeof body != "object") {
        return "";
    }
    const err = (body as { error?: unknown }).error;
    if (typeof err == "string") {
        return err;
    }
    if (err != null && typeof err == "object") {
        const msg = (err as { message?: unknown }).message;
        if (typeof msg == "string") {
            return msg;
        }
    }
    return "";
}

function readErrorOutcome(body: unknown): "escalated" | "trust_blocked" | "" {
    if (body == null || typeof body != "object") return "";
    const error = (body as { error?: unknown }).error;
    if (error == null || typeof error != "object") return "";
    const details = (error as { details?: unknown }).details;
    if (details == null || typeof details != "object") return "";
    const outcome = (details as { outcome?: unknown }).outcome;
    return outcome === "escalated" ? "escalated" : outcome === "trust_blocked" ? "trust_blocked" : "";
}

// Response convenience: parse the body once and pull the real reason out of it.
// A body that isn't JSON (or an already-consumed stream) falls to "" so the
// caller can substitute a truthful capability-scoped fallback.
async function readFetchError(res: Response): Promise<string> {
    try {
        const body = await res.json();
        return readErrorReason(body);
    } catch {
        return "";
    }
}

// A cold-start backend on loopback :3100 surfaces as a raw transport failure
// (fetch/network/ECONNREFUSED) rather than a structured error body. On an empty
// board that means "still starting", not a real failure, so the caller can show
// the calm getting-started state instead of an alarming error row.
function isConnectivityError(message: string): boolean {
    if (message == null || message == "") {
        return false;
    }
    return /failed to fetch|networkerror|econnrefused|network request failed|load failed|fetch failed/i.test(message);
}

export { isConnectivityError, readErrorOutcome, readErrorReason, readFetchError };
