// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/store/global", async () => {
    const { createStore } = await import("jotai");
    return { globalStore: createStore() };
});

vi.mock("./recoder-settings", () => ({
    RecoderSettingsView: () => null,
}));

import { globalStore } from "@/app/store/global";
import { describeConductorHealth, summarizeHealthReport } from "./recoder-settings-health";
import { RecoderSettingsViewModel } from "./recoder-settings-model";

describe("describeConductorHealth", () => {
    it("maps a healthy wrapped envelope to ok with tmux bin + socket lines", () => {
        const body = {
            success: true,
            data: {
                available: true,
                tmux: true,
                substrate: { tmuxBin: "/opt/homebrew/bin/tmux", tmuxSocket: "/tmp/tmux-501/default" },
            },
        };
        expect(describeConductorHealth(body, 200)).toEqual({
            status: "ok",
            lines: ["tmux substrate ready", "tmux: /opt/homebrew/bin/tmux", "socket: /tmp/tmux-501/default"],
        });
    });

    it("accepts a bare (unwrapped) body", () => {
        const body = { available: true, tmux: true, substrate: { tmuxBin: "/usr/bin/tmux", tmuxSocket: null } };
        expect(describeConductorHealth(body, 200)).toEqual({
            status: "ok",
            lines: ["tmux substrate ready", "tmux: /usr/bin/tmux"],
        });
    });

    it("surfaces the backend reason verbatim when no substrate is available", () => {
        const body = {
            success: true,
            data: {
                available: false,
                tmux: false,
                substrate: { tmuxBin: null, tmuxSocket: null },
                reason: "tmux is not installed on this host",
            },
        };
        expect(describeConductorHealth(body, 200)).toEqual({
            status: "fail",
            lines: ["tmux is not installed on this host"],
        });
    });

    it("falls back to the truthful default reason when the backend omits one", () => {
        const body = { success: true, data: { available: false, tmux: false } };
        expect(describeConductorHealth(body, 200)).toEqual({
            status: "fail",
            lines: ["no substrate available"],
        });
    });

    it("reports degraded when a substrate is available but tmux is not", () => {
        const body = {
            success: true,
            data: { available: true, tmux: false, substrate: { tmuxBin: null, tmuxSocket: null } },
        };
        expect(describeConductorHealth(body, 200)).toEqual({
            status: "degraded",
            lines: ["a substrate is available but tmux is not"],
        });
    });

    it("falls back to the reachability line on a garbage body", () => {
        expect(describeConductorHealth("nonsense", 200)).toEqual({
            status: "ok",
            lines: ["Reachable (HTTP 200)"],
        });
    });

    it("falls back to the reachability line on an undefined body", () => {
        expect(describeConductorHealth(undefined, 200)).toEqual({
            status: "ok",
            lines: ["Reachable (HTTP 200)"],
        });
    });

    it("falls back when `available` is not a boolean", () => {
        expect(describeConductorHealth({ success: true, data: { available: "yes" } }, 200)).toEqual({
            status: "ok",
            lines: ["Reachable (HTTP 200)"],
        });
    });
});

describe("summarizeHealthReport", () => {
    it("emits a per-source status line plus an indented reason when present", () => {
        const report = {
            status: "down",
            degraded: true,
            sources: [
                { name: "conductor", status: "up", degraded: false },
                { name: "engines", status: "down", degraded: false, reason: "sidecar unreachable" },
            ],
            checkedAt: "2026-08-01T00:00:00Z",
        };
        expect(summarizeHealthReport(report)).toEqual([
            "conductor: up",
            "engines: down",
            "  reason: sidecar unreachable",
        ]);
    });

    it("keeps an unknown status string raw for a degraded report", () => {
        const report = {
            status: "degraded",
            sources: [{ name: "memory", status: "degraded", reason: "mem0 sidecar down" }],
        };
        expect(summarizeHealthReport(report)).toEqual(["memory: degraded", "  reason: mem0 sidecar down"]);
    });

    it("returns [] for a missing sources array", () => {
        expect(summarizeHealthReport({ status: "up" })).toEqual([]);
    });

    it("returns [] for a malformed report", () => {
        expect(summarizeHealthReport(null)).toEqual([]);
        expect(summarizeHealthReport("junk")).toEqual([]);
        expect(summarizeHealthReport({ sources: "junk" })).toEqual([]);
    });

    it("skips malformed source entries but keeps the valid ones", () => {
        const report = { sources: [null, "junk", { status: "up" }, { name: "conductor", status: "up" }] };
        expect(summarizeHealthReport(report)).toEqual(["conductor: up"]);
    });
});

const Target = "http://127.0.0.1:9999";
const HealthyConductorBody = {
    success: true,
    data: {
        available: true,
        tmux: true,
        substrate: { tmuxBin: "/usr/bin/tmux", tmuxSocket: "/tmp/tmux-501/default" },
    },
};

function makeModel(): RecoderSettingsViewModel {
    return new RecoderSettingsViewModel({ blockId: "b1" } as ViewModelInitType);
}

function jsonResponse(status: number, body: unknown) {
    return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
}

describe("RecoderSettingsViewModel.test", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("diagnoses the conductor body and appends the /health/full rollup", async () => {
        const fetchMock = vi.fn().mockImplementation((url: string) => {
            if (String(url).endsWith("/health/full")) {
                return jsonResponse(200, {
                    status: "up",
                    sources: [{ name: "conductor", status: "up", degraded: false }],
                });
            }
            return jsonResponse(200, HealthyConductorBody);
        });
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.test(Target);

        expect(fetchMock).toHaveBeenCalledWith(`${Target}/api/conductor/health`);
        expect(fetchMock).toHaveBeenCalledWith(`${Target}/health/full`);
        expect(globalStore.get(model.testStatusAtom)).toBe("ok");
        expect(globalStore.get(model.testMessageAtom)).toBe("tmux substrate ready");
        expect(globalStore.get(model.testDetailAtom)).toEqual([
            "tmux: /usr/bin/tmux",
            "socket: /tmp/tmux-501/default",
            "conductor: up",
        ]);
    });

    it("surfaces available:false as a truthful fail with the backend reason", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockImplementation((url: string) => {
                if (String(url).endsWith("/health/full")) {
                    return jsonResponse(200, { status: "up", sources: [] });
                }
                return jsonResponse(200, {
                    success: true,
                    data: { available: false, tmux: false, reason: "tmux is not installed on this host" },
                });
            })
        );

        const model = makeModel();
        await model.test(Target);

        expect(globalStore.get(model.testStatusAtom)).toBe("fail");
        expect(globalStore.get(model.testMessageAtom)).toBe("tmux is not installed on this host");
    });

    it("parses the /health/full body even on HTTP 503 (down report)", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockImplementation((url: string) => {
                if (String(url).endsWith("/health/full")) {
                    return jsonResponse(503, {
                        status: "down",
                        sources: [{ name: "engines", status: "down", reason: "sidecar unreachable" }],
                    });
                }
                return jsonResponse(200, HealthyConductorBody);
            })
        );

        const model = makeModel();
        await model.test(Target);

        expect(globalStore.get(model.testStatusAtom)).toBe("ok");
        expect(globalStore.get(model.testDetailAtom)).toEqual([
            "tmux: /usr/bin/tmux",
            "socket: /tmp/tmux-501/default",
            "engines: down",
            "  reason: sidecar unreachable",
        ]);
    });

    it("keeps the conductor diagnosis when the rollup fetch faults", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockImplementation((url: string) => {
                if (String(url).endsWith("/health/full")) {
                    return Promise.reject(new Error("ECONNRESET"));
                }
                return jsonResponse(200, HealthyConductorBody);
            })
        );

        const model = makeModel();
        await model.test(Target);

        expect(globalStore.get(model.testStatusAtom)).toBe("ok");
        expect(globalStore.get(model.testMessageAtom)).toBe("tmux substrate ready");
        expect(globalStore.get(model.testDetailAtom)).toEqual(["tmux: /usr/bin/tmux", "socket: /tmp/tmux-501/default"]);
    });

    it("falls back to the reachability line on an unparseable conductor body", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockImplementation((url: string) => {
                if (String(url).endsWith("/health/full")) {
                    return jsonResponse(200, { sources: [] });
                }
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: async () => {
                        throw new Error("bad json");
                    },
                });
            })
        );

        const model = makeModel();
        await model.test(Target);

        expect(globalStore.get(model.testStatusAtom)).toBe("ok");
        expect(globalStore.get(model.testMessageAtom)).toBe("Reachable (HTTP 200)");
        expect(globalStore.get(model.testDetailAtom)).toEqual([]);
    });

    it("keeps the truthful non-2xx and transport failure states", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockImplementation(() => jsonResponse(502, {}))
        );
        const model = makeModel();
        await model.test(Target);
        expect(globalStore.get(model.testStatusAtom)).toBe("fail");
        expect(globalStore.get(model.testMessageAtom)).toBe("Backend returned HTTP 502");

        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
        await model.test(Target);
        expect(globalStore.get(model.testStatusAtom)).toBe("fail");
        expect(globalStore.get(model.testMessageAtom)).toBe("Not reachable");
        expect(globalStore.get(model.testDetailAtom)).toEqual([]);
    });
});
