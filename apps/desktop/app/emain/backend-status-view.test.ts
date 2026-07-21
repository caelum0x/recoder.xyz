// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { projectBackendStatus } from "./backend-status-view";
import type { SupervisorStatus } from "./emain-backend-core";

/**
 * A full SupervisorStatus-shaped fixture carrying EVERY sensitive field the real
 * status object holds (backendUrl/port/hasApiKey/error/engines URLs/vector), so
 * the redaction test proves those never survive the projection.
 */
function fullStatus(overrides: Partial<SupervisorStatus> = {}): SupervisorStatus {
    return {
        phase: "ready",
        ready: true,
        backendUrl: "http://127.0.0.1:3100",
        port: 3100,
        hasApiKey: true,
        restartCount: 0,
        error: null,
        logPath: "/Users/x/Library/Application Support/recoder/logs/backend-supervisor.log",
        userMessage: null,
        engines: {
            known: true,
            alive: ["beads:cli"],
            degraded: [],
            entries: [{ name: "beads:cli", status: "up", reason: null }],
            reason: null,
        },
        vector: { lance: "alive", dataDir: "/Users/x/lance", reason: null },
        ...overrides,
    };
}

describe("projectBackendStatus", () => {
    it("mirrors the allowlisted fields verbatim", () => {
        const status = fullStatus({
            phase: "failed",
            ready: false,
            restartCount: 3,
            userMessage: "the backend could not start",
            logPath: "/tmp/backend.log",
        });
        const result = projectBackendStatus(status);
        expect(result).not.toBeNull();
        expect(result!.phase).toBe(status.phase);
        expect(result!.ready).toBe(status.ready);
        expect(result!.restartCount).toBe(status.restartCount);
        expect(result!.userMessage).toBe(status.userMessage);
        expect(result!.logPath).toBe(status.logPath);
    });

    it("REDACTS: exposes exactly the 5 allowlisted keys and no secret-shaped ones", () => {
        const result = projectBackendStatus(fullStatus());
        expect(result).not.toBeNull();
        expect(Object.keys(result!).sort()).toEqual(
            ["logPath", "phase", "ready", "restartCount", "userMessage"].sort(),
        );
        // The sensitive fields the real status carries must not appear at all.
        for (const leaked of ["backendUrl", "port", "hasApiKey", "error", "engines", "vector"]) {
            expect(result).not.toHaveProperty(leaked);
        }
        const serialized = JSON.stringify(result);
        expect(serialized).not.toContain("apiKey");
        expect(serialized).not.toContain("token");
        expect(serialized).not.toContain("backendUrl");
        expect(serialized).not.toContain("127.0.0.1");
    });

    it("returns null for a null status (supervisor absent / not yet started)", () => {
        expect(projectBackendStatus(null)).toBeNull();
    });

    it("is an ALLOWLIST, not a blocklist: a future secret-shaped field is dropped", () => {
        const withSecret = {
            ...fullStatus(),
            apiKey: "sk_live_should_never_leak",
            authToken: "bearer_should_never_leak",
        } as unknown as SupervisorStatus;
        const result = projectBackendStatus(withSecret);
        expect(Object.keys(result!).sort()).toEqual(
            ["logPath", "phase", "ready", "restartCount", "userMessage"].sort(),
        );
        expect(JSON.stringify(result)).not.toContain("sk_live");
        expect(JSON.stringify(result)).not.toContain("bearer_should_never_leak");
    });

    it("normalizes absent userMessage/logPath to null (never undefined)", () => {
        const status = fullStatus({ userMessage: undefined as never, logPath: undefined as never });
        const result = projectBackendStatus(status);
        expect(result!.userMessage).toBeNull();
        expect(result!.logPath).toBeNull();
    });
});
