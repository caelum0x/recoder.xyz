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

export { readErrorReason, readFetchError };
