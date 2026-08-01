// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { describeRunEvent, extractApprovalId, formatRunEventLine, isTerminalRunEvent } from "./recoder-run-event";

describe("describeRunEvent", () => {
    it("classifies each known RunEvent type with a friendly label + severity", () => {
        const cases: [string, string, string][] = [
            ["started", "Started", "active"],
            ["log", "Log", "info"],
            ["needs_input", "Needs input", "warn"],
            ["approval_requested", "Needs approval", "warn"],
            ["verified", "Verified", "success"],
            ["completed", "Completed", "success"],
            ["failed", "Failed", "danger"],
        ];
        for (const [type, label, severity] of cases) {
            const d = describeRunEvent({ type });
            expect(d.kind).toBe(type);
            expect(d.label).toBe(label);
            expect(d.severity).toBe(severity);
            expect(d.icon).not.toBe("");
        }
    });

    it("falls back to a neutral descriptor for an unknown or missing type", () => {
        expect(describeRunEvent({ type: "mystery" })).toMatchObject({ kind: "mystery", label: "Event", severity: "info" });
        expect(describeRunEvent({}).kind).toBe("event");
    });

    it("prefers message, then state, then artifactId for the detail", () => {
        expect(describeRunEvent({ type: "log", message: "hi", state: "x", artifactId: "a" }).detail).toBe("hi");
        expect(describeRunEvent({ type: "state_transition", state: "running" }).detail).toBe("→ running");
        expect(describeRunEvent({ type: "artifact", artifactId: "art-1" }).detail).toBe("artifact art-1");
        expect(describeRunEvent({ type: "log" }).detail).toBe("");
    });

    it("formats the time as HH:MM:SS and degrades truthfully on a bad/missing timestamp", () => {
        expect(describeRunEvent({ type: "log", createdAt: "2026-07-25T12:34:56.000Z" }).time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
        expect(describeRunEvent({ type: "log", createdAt: "not-a-date" }).time).toBe("--:--:--");
        expect(describeRunEvent({ type: "log" }).time).toBe("--:--:--");
    });
});

describe("formatRunEventLine", () => {
    // Time is rendered in local time (legacy behavior), so assert structure from
    // the descriptor's own time rather than hardcoding a tz-dependent clock.
    it("reproduces the legacy `[time] kind  detail` text form", () => {
        const d = describeRunEvent({ type: "log", message: "hello", createdAt: "2026-07-25T12:00:00.000Z" });
        expect(formatRunEventLine(d)).toBe(`[${d.time}] log  hello`);
    });

    it("omits the trailing detail separator when there is no detail", () => {
        const d = describeRunEvent({ type: "completed", createdAt: "2026-07-25T12:00:00.000Z" });
        expect(formatRunEventLine(d)).toBe(`[${d.time}] completed`);
    });
});

describe("extractApprovalId / descriptor.approvalId", () => {
    it("pulls data.approvalId (backend emits it there), with data.id tolerated", () => {
        expect(extractApprovalId({ type: "approval_requested", data: { approvalId: "appr-1" } })).toBe("appr-1");
        expect(extractApprovalId({ type: "approval_requested", data: { id: "appr-2" } })).toBe("appr-2");
    });

    it("returns null when there is no decidable id", () => {
        expect(extractApprovalId({ type: "approval_requested" })).toBeNull();
        expect(extractApprovalId({ type: "approval_requested", data: {} })).toBeNull();
        expect(extractApprovalId({ type: "log", data: { approvalId: "x" } })).toBe("x"); // extractor is type-agnostic
    });

    it("attaches approvalId to the descriptor ONLY for approval_requested events", () => {
        const appr = describeRunEvent({ type: "approval_requested", data: { approvalId: "appr-9" } });
        expect(appr.severity).toBe("warn");
        expect(appr.approvalId).toBe("appr-9");

        const log = describeRunEvent({ type: "log", data: { approvalId: "appr-9" } });
        expect(log.approvalId).toBeUndefined();

        const bare = describeRunEvent({ type: "approval_requested" });
        expect(bare.approvalId).toBeUndefined();
    });
});

describe("isTerminalRunEvent", () => {
    it("is true only for completed/failed", () => {
        expect(isTerminalRunEvent({ type: "completed" })).toBe(true);
        expect(isTerminalRunEvent({ type: "failed" })).toBe(true);
        expect(isTerminalRunEvent({ type: "log" })).toBe(false);
        expect(isTerminalRunEvent({})).toBe(false);
    });
});
