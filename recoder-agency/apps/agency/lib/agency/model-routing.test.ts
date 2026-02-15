import { describe, expect, it } from "vitest";
import { pickBestPolicyForProject } from "./model-routing";

const basePolicy = {
	teamDbId: 1,
	name: "policy",
	preferredModelId: "openai/gpt-4.1-mini",
	fallbackModelId: "openai/gpt-4o-mini",
	costCeilingCentsPerGeneration: 20,
};

describe("pickBestPolicyForProject", () => {
	it("prefers project-scoped policy over team-wide policy", () => {
		const selected = pickBestPolicyForProject(
			[
				{
					...basePolicy,
					dbId: 1,
					projectDbId: null,
					priority: 999,
				},
				{
					...basePolicy,
					dbId: 2,
					projectDbId: 42,
					priority: 1,
				},
			],
			42,
		);
		expect(selected?.dbId).toBe(2);
	});

	it("uses highest-priority project policy when multiple project policies exist", () => {
		const selected = pickBestPolicyForProject(
			[
				{
					...basePolicy,
					dbId: 2,
					projectDbId: 42,
					priority: 5,
				},
				{
					...basePolicy,
					dbId: 3,
					projectDbId: 42,
					priority: 20,
				},
			],
			42,
		);
		expect(selected?.dbId).toBe(3);
	});

	it("falls back to highest-priority team-wide policy when project policy is absent", () => {
		const selected = pickBestPolicyForProject(
			[
				{
					...basePolicy,
					dbId: 11,
					projectDbId: null,
					priority: 3,
				},
				{
					...basePolicy,
					dbId: 12,
					projectDbId: null,
					priority: 50,
				},
			],
			42,
		);
		expect(selected?.dbId).toBe(12);
	});
});
