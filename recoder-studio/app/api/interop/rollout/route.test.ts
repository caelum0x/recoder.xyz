import { describe, expect, it, vi } from "vitest";

vi.mock("@/flags", () => ({
	getStudioInteropRolloutConfig: vi.fn(async () => ({
		mvpFlag: true,
		stage: "beta",
		killSwitch: false,
		rolloutPercent: 25,
	})),
}));

import { GET } from "./route";

describe("GET /api/interop/rollout", () => {
	it("returns rollout config payload", async () => {
		const response = await GET();
		expect(response.status).toBe(200);
		const json = await response.json();
		expect(json).toEqual({
			ok: true,
			rollout: {
				mvpFlag: true,
				stage: "beta",
				killSwitch: false,
				rolloutPercent: 25,
			},
		});
	});
});
