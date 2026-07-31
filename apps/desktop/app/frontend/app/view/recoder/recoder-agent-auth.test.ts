// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import {
    AGENT_LOGIN_GUIDES,
    agentAuthOptionSuffix,
    agentAuthPresentation,
    agentLoginGuide,
    parseAgentAuthState,
} from "./recoder-agent-auth";
import { AGENT_LABELS } from "./recoder-agent-labels";

describe("AGENT_LOGIN_GUIDES", () => {
    it("every guide has a friendly label, a login command, and an https docs url", () => {
        expect(AGENT_LOGIN_GUIDES.length).toBeGreaterThan(0);
        for (const guide of AGENT_LOGIN_GUIDES) {
            expect(AGENT_LABELS[guide.runtimeId]).toBeDefined();
            expect(guide.loginCommand.trim().length).toBeGreaterThan(0);
            expect(guide.docsUrl).toMatch(/^https:\/\//);
        }
    });

    it("has no duplicate runtimeIds", () => {
        const ids = AGENT_LOGIN_GUIDES.map((g) => g.runtimeId);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe("agentLoginGuide", () => {
    it("returns the guide for a known runtime and undefined for an unknown one", () => {
        expect(agentLoginGuide("claude_code")?.runtimeId).toBe("claude_code");
        expect(agentLoginGuide("not_a_real_agent")).toBeUndefined();
    });
});

describe("parseAgentAuthState", () => {
    it("passes through the three documented verdicts", () => {
        expect(parseAgentAuthState("authenticated")).toBe("authenticated");
        expect(parseAgentAuthState("unauthenticated")).toBe("unauthenticated");
        expect(parseAgentAuthState("unknown")).toBe("unknown");
    });

    it("degrades any garbage/untrusted value to unknown (never a fabricated authenticated)", () => {
        expect(parseAgentAuthState("yes")).toBe("unknown");
        expect(parseAgentAuthState("")).toBe("unknown");
        expect(parseAgentAuthState(null)).toBe("unknown");
        expect(parseAgentAuthState(undefined)).toBe("unknown");
        expect(parseAgentAuthState(true)).toBe("unknown");
        expect(parseAgentAuthState({ authenticated: true })).toBe("unknown");
    });
});

describe("agentAuthPresentation", () => {
    it("not installed is never launch-ready and shows no auth affordance", () => {
        expect(agentAuthPresentation(false, "unknown")).toEqual({
            launchReady: false,
            badge: "not installed",
            needsAuth: false,
        });
        // A stray auth verdict on an uninstalled agent still reads "not installed".
        expect(agentAuthPresentation(false, "authenticated").badge).toBe("not installed");
    });

    it("a confirmed login reads ready with no nag", () => {
        expect(agentAuthPresentation(true, "authenticated")).toEqual({
            launchReady: true,
            badge: "ready",
            needsAuth: false,
        });
    });

    it("a positive signed-out verdict stays launchable but surfaces authenticate", () => {
        expect(agentAuthPresentation(true, "unauthenticated")).toEqual({
            launchReady: true,
            badge: "sign-in needed",
            needsAuth: true,
        });
    });

    it("detected-but-unverified is launchable, honestly labelled, and offers authenticate", () => {
        // The critical truthfulness case: no false "ready", never hard-blocked.
        expect(agentAuthPresentation(true, "unknown")).toEqual({
            launchReady: true,
            badge: "detected",
            needsAuth: true,
        });
    });
});

describe("agentAuthOptionSuffix", () => {
    it("labels every state except a confirmed ready login", () => {
        expect(agentAuthOptionSuffix(false, "unknown")).toBe(" (not installed)");
        expect(agentAuthOptionSuffix(true, "authenticated")).toBe("");
        expect(agentAuthOptionSuffix(true, "unknown")).toBe(" (detected)");
        expect(agentAuthOptionSuffix(true, "unauthenticated")).toBe(" (sign-in needed)");
    });
});
