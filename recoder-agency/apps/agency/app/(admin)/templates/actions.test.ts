import { describe, expect, it } from "vitest";
import { normalizePlaybookPhases } from "@/lib/agency/playbook-phase-validation";

describe("normalizePlaybookPhases", () => {
	it("normalizes valid phases", () => {
		const phases = normalizePlaybookPhases([
			{
				order: 3,
				name: " Discovery ",
				deliverableType: "document",
				isBillableMilestone: true,
				description: "  kickoff docs ",
				milestoneLabel: " M1 ",
			},
		]);

		expect(phases).toEqual([
			{
				order: 3,
				name: "Discovery",
				deliverableType: "document",
				isBillableMilestone: true,
				description: "kickoff docs",
				milestoneLabel: "M1",
			},
		]);
	});

	it("throws when phase is not an object", () => {
		expect(() => normalizePlaybookPhases(["bad"])).toThrow(
			"Phase #1 must be an object.",
		);
	});

	it("throws when name is missing", () => {
		expect(() =>
			normalizePlaybookPhases([
				{
					deliverableType: "document",
					isBillableMilestone: false,
				},
			]),
		).toThrow("Phase #1 is missing a valid name.");
	});

	it("throws when deliverableType is invalid", () => {
		expect(() =>
			normalizePlaybookPhases([
				{
					name: "Build",
					deliverableType: "video",
					isBillableMilestone: false,
				},
			]),
		).toThrow('Phase #1 has invalid deliverableType "video".');
	});
});
