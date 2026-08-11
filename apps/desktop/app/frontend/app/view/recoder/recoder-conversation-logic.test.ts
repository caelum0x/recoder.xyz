// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import {
    deriveTranscript,
    isPlumbingLog,
    messagesToTurns,
    stripAnsi,
    type ConversationEntry,
    type HydratedMessage,
} from "./recoder-conversation-logic";
import type { RunEventDescriptor, RunEventSeverity } from "./recoder-run-event";

function msg(role: HydratedMessage["role"], text: string, timestamp = ""): HydratedMessage {
    return { role, text, timestamp };
}

function ev(
    kind: string,
    detail: string,
    overrides: Partial<RunEventDescriptor> = {}
): ConversationEntry {
    const severity: RunEventSeverity = overrides.severity ?? "info";
    return {
        kind: "event",
        descriptor: {
            time: overrides.time ?? "12:00:00",
            kind,
            label: overrides.label ?? kind,
            icon: overrides.icon ?? "circle",
            severity,
            detail,
            origin: overrides.origin ?? "run",
            ...(overrides.approvalId != null ? { approvalId: overrides.approvalId } : {}),
        },
    };
}

function sys(text: string, tone: "error" | "muted" = "muted"): ConversationEntry {
    return { kind: "system", text, tone };
}

describe("deriveTranscript — grouping consecutive same-speaker entries", () => {
    it("folds a run of agent events into ONE agent turn", () => {
        const turns = deriveTranscript([
            ev("started", ""),
            ev("log", "reading the router"),
            ev("verified", "tests pass"),
        ]);
        expect(turns).toHaveLength(1);
        expect(turns[0].speaker).toBe("agent");
        expect(turns[0].lines.map((l) => l.text)).toEqual(["", "reading the router", "tests pass"]);
    });

    it("splits into alternating turns when the speaker changes", () => {
        const turns = deriveTranscript([
            ev("user_message", "add a health check"),
            ev("log", "on it"),
            ev("completed", "done"),
            ev("user_message", "now write a test"),
        ]);
        expect(turns.map((t) => t.speaker)).toEqual(["you", "agent", "you"]);
        expect(turns[0].lines[0].text).toBe("add a health check");
        expect(turns[1].lines.map((l) => l.text)).toEqual(["on it", "done"]);
        expect(turns[2].lines[0].text).toBe("now write a test");
    });

    it("anchors a turn's time to its first entry that carries one", () => {
        const turns = deriveTranscript([sys("[stream complete]"), ev("log", "hi", { time: "09:15:00" })]);
        expect(turns).toHaveLength(1);
        expect(turns[0].time).toBe("09:15:00");
    });
});

describe("deriveTranscript — noise drop (plumbing / ANSI / system frames)", () => {
    it("diverts ANSI paint, empty control frames, and tool-call plumbing into the noise bucket", () => {
        const turns = deriveTranscript([
            ev("log", "the agent said something real"),
            ev("log", "\u001b[2K\u001b[1Gspinner"),
            ev("log", "   "),
            ev("log", "tool_call: fs.read {\"path\":\"a\"}"),
        ]);
        expect(turns).toHaveLength(1);
        expect(turns[0].lines.map((l) => l.text)).toEqual(["the agent said something real"]);
        expect(turns[0].noise).toHaveLength(3);
    });

    it("collapses transport system frames (stream error/complete) into noise, not the flow", () => {
        const turns = deriveTranscript([ev("log", "working"), sys("[stream error] boom", "error"), sys("[stream complete]")]);
        expect(turns).toHaveLength(1);
        expect(turns[0].lines.map((l) => l.text)).toEqual(["working"]);
        expect(turns[0].noise).toEqual(["[stream error] boom", "[stream complete]"]);
    });

    it("keeps sandbox lifecycle logs as salient (only run-origin plumbing is noise)", () => {
        const turns = deriveTranscript([
            ev("log", "Provisioning", { origin: "sandbox", label: "Sandbox provisioning", severity: "active" }),
        ]);
        expect(turns[0].lines).toHaveLength(1);
        expect(turns[0].lines[0].label).toBe("Sandbox provisioning");
    });

    it("a turn that produced only plumbing is still a real (collapsed) turn, never dropped", () => {
        const turns = deriveTranscript([ev("log", "tool_result: ok"), sys("[stream complete]")]);
        expect(turns).toHaveLength(1);
        expect(turns[0].lines).toEqual([]);
        expect(turns[0].noise).toHaveLength(2);
    });
});

describe("deriveTranscript — steer vs agent attribution", () => {
    it("attributes user_message to you and every other event to the agent", () => {
        const turns = deriveTranscript([ev("user_message", "hi"), ev("state_transition", "→ running")]);
        expect(turns[0].speaker).toBe("you");
        expect(turns[1].speaker).toBe("agent");
    });

    it("a blank user_message still renders a truthful placeholder line (never empty)", () => {
        const turns = deriveTranscript([ev("user_message", "")]);
        expect(turns[0].lines[0].text).toBe("(message)");
    });

    it("carries an approval id onto the exact line so inline approve/deny lands in place", () => {
        const turns = deriveTranscript([
            ev("approval_requested", "allow writing to disk?", { label: "Needs approval", approvalId: "appr-7", severity: "warn" }),
        ]);
        expect(turns[0].lines[0]).toMatchObject({ label: "Needs approval", approvalId: "appr-7" });
    });
});

describe("deriveTranscript — empty and degrade-safe", () => {
    it("an empty stream derives to [] (the view owns the calm waiting state)", () => {
        expect(deriveTranscript([])).toEqual([]);
    });

    it("tolerates a null/undefined stream", () => {
        expect(deriveTranscript(null as unknown as ConversationEntry[])).toEqual([]);
        expect(deriveTranscript(undefined as unknown as ConversationEntry[])).toEqual([]);
    });
});

describe("messagesToTurns — hydrated history projects like the live stream", () => {
    it("attributes user to you and assistant/system to the agent", () => {
        const turns = messagesToTurns([
            msg("user", "add a health check", "09:00:00"),
            msg("assistant", "on it"),
            msg("system", "context compacted"),
        ]);
        expect(turns.map((t) => t.speaker)).toEqual(["you", "agent"]);
        expect(turns[0].lines[0].text).toBe("add a health check");
        expect(turns[0].time).toBe("09:00:00");
        expect(turns[1].lines.map((l) => l.text)).toEqual(["on it", "context compacted"]);
    });

    it("renders each message as plain prose (empty label) so it reads identically to live", () => {
        const turns = messagesToTurns([msg("assistant", "I edited the router")]);
        expect(turns[0].lines[0]).toMatchObject({ label: "", text: "I edited the router" });
        expect(turns[0].noise).toEqual([]);
    });

    it("skips blank-text messages and never fabricates a turn from empty history", () => {
        expect(messagesToTurns([])).toEqual([]);
        expect(messagesToTurns(null as unknown as HydratedMessage[])).toEqual([]);
        expect(messagesToTurns([msg("assistant", "")])).toEqual([]);
    });

    it("anchors a turn's time to its first message that carries one", () => {
        const turns = messagesToTurns([msg("assistant", "first", ""), msg("assistant", "second", "10:11:12")]);
        expect(turns).toHaveLength(1);
        expect(turns[0].time).toBe("10:11:12");
    });
});

describe("noise predicates", () => {
    it("stripAnsi removes CSI escapes but keeps residual text", () => {
        expect(stripAnsi("\u001b[31mred\u001b[0m")).toBe("red");
    });

    it("isPlumbingLog flags empty, ANSI, and tool frames — not plain prose", () => {
        expect(isPlumbingLog("")).toBe(true);
        expect(isPlumbingLog("   ")).toBe(true);
        expect(isPlumbingLog("\u001b[2Kpaint")).toBe(true);
        expect(isPlumbingLog("tool_result: {}")).toBe(true);
        expect(isPlumbingLog("I edited server.ts to add the route")).toBe(false);
    });
});
