// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// One honest liveness verdict for the whole recoder surface, derived from the
// age of the last successful backend poll. Pure so it can be unit-proven without
// jotai or fetch; the model layers the "last poll failed but stale data is still
// on screen" case on top of this time comparison.

type RecoderConnectionState = "live" | "stale" | "offline";

function deriveConnectionState(lastOkMs: number | null, now: number, staleAfterMs: number): RecoderConnectionState {
    if (lastOkMs == null) {
        return "offline";
    }
    if (now - lastOkMs > staleAfterMs) {
        return "stale";
    }
    return "live";
}

export { deriveConnectionState, type RecoderConnectionState };
