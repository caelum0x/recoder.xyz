// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Electron-free so the redaction seam can be unit-tested with plain objects
// (see backend-status-view.test.ts). The IPC glue lives in emain-ipc.ts.

import type { SupervisorPhase, SupervisorStatus } from "./emain-backend-core";

/**
 * The secret-free projection of the embedded backend's SupervisorStatus that the
 * cockpit is allowed to read. Only the 5 non-sensitive fields the phase banner
 * needs — never backendUrl/port/hasApiKey/error/engines(URLs)/vector.
 */
export interface RedactedBackendStatus {
    phase: SupervisorPhase;
    ready: boolean;
    restartCount: number;
    userMessage: string | null;
    logPath: string | null;
}

/**
 * Project a SupervisorStatus down to the redacted, secret-free shape the cockpit
 * banner reads. Built field-by-field (ALLOWLIST) — NEVER `{...status}` — so
 * backendUrl/port/hasApiKey/error/engines/vector can never leak, even if
 * SupervisorStatus grows new sensitive fields later. Null in ⇒ null out.
 */
export function projectBackendStatus(status: SupervisorStatus | null): RedactedBackendStatus | null {
    if (status == null) {
        return null;
    }
    return {
        phase: status.phase,
        ready: status.ready,
        restartCount: status.restartCount,
        userMessage: status.userMessage ?? null,
        logPath: status.logPath ?? null,
    };
}
