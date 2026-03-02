import { afterEach, describe, expect, it, vi } from "vitest";

let edgeConfigValues: Record<string, unknown> = {};

vi.mock("flags/next", () => ({
	flag: <T>(definition: { key: string; decide: () => T | Promise<T> }) => {
		return async () => definition.decide.call({ key: definition.key });
	},
}));

vi.mock("@vercel/edge-config", () => ({
	get: vi.fn(async (key: string) => edgeConfigValues[key]),
}));

import { getStudioInteropRolloutConfig, shouldEnableInterop } from "./flags";

const ORIGINAL_ENV = { ...process.env };

function applyEnv(next: Record<string, string | undefined>) {
	for (const [key, value] of Object.entries(next)) {
		if (value === undefined) {
			delete process.env[key];
			continue;
		}
		process.env[key] = value;
	}
}

afterEach(() => {
	edgeConfigValues = {};
	process.env = { ...ORIGINAL_ENV };
	vi.restoreAllMocks();
});

describe("interop rollout config", () => {
	it("uses local env values in development", async () => {
		applyEnv({
			NODE_ENV: "development",
			STUDIO_INTEROP_MVP_FLAG: "true",
			STUDIO_INTEROP_ROLLOUT_STAGE: "beta",
			STUDIO_INTEROP_KILL_SWITCH: "true",
			STUDIO_INTEROP_ROLLOUT_PERCENT: "42",
		});

		const config = await getStudioInteropRolloutConfig();

		expect(config).toEqual({
			mvpFlag: true,
			stage: "beta",
			killSwitch: true,
			rolloutPercent: 42,
		});
	});

	it("prioritizes edge config in non-development", async () => {
		applyEnv({
			NODE_ENV: "production",
			STUDIO_INTEROP_MVP_FLAG: "false",
			STUDIO_INTEROP_ROLLOUT_STAGE: "internal",
			STUDIO_INTEROP_KILL_SWITCH: "false",
			STUDIO_INTEROP_ROLLOUT_PERCENT: "0",
		});
		edgeConfigValues = {
			"flag__studio-interop-mvp": true,
			"flag__studio-interop-rollout-stage": "ga",
			"flag__studio-interop-kill-switch": true,
			"flag__studio-interop-rollout-percent": 77,
		};

		const config = await getStudioInteropRolloutConfig();

		expect(config).toEqual({
			mvpFlag: true,
			stage: "ga",
			killSwitch: true,
			rolloutPercent: 77,
		});
	});
});

describe("shouldEnableInterop", () => {
	it("uses server-safe beta fallback for requests without user id", async () => {
		applyEnv({ NODE_ENV: "production" });
		edgeConfigValues = {
			"flag__studio-interop-mvp": false,
			"flag__studio-interop-rollout-stage": "beta",
			"flag__studio-interop-kill-switch": false,
			"flag__studio-interop-rollout-percent": 15,
		};

		const enabled = await shouldEnableInterop();
		expect(enabled).toBe(true);
	});

	it("keeps deterministic user bucketing in beta", async () => {
		applyEnv({ NODE_ENV: "production" });
		edgeConfigValues = {
			"flag__studio-interop-mvp": true,
			"flag__studio-interop-rollout-stage": "beta",
			"flag__studio-interop-kill-switch": false,
			"flag__studio-interop-rollout-percent": 30,
		};

		const first = await shouldEnableInterop("user_123");
		const second = await shouldEnableInterop("user_123");

		expect(first).toBe(second);
	});
});
