import { describe, expect, it, vi } from "vitest";

// Mock heavy dependencies that trigger module-level side-effects (database
// connections, env var checks) — buildDeploymentDiff is a pure function and
// doesn't need them.
vi.mock("@/app/giselle", () => ({ giselle: {} }));
vi.mock("@/db", () => ({ db: {}, workspaces: {} }));

import { buildDeploymentDiff, type DeploymentHistoryEvent } from "./deployment";

function makeEvent(input: Partial<DeploymentHistoryEvent>): DeploymentHistoryEvent {
	return {
		fromStage: "draft",
		toStage: "canary",
		reason: "test",
		changedAt: "2026-02-14T00:00:00.000Z",
		actorUserId: "usr_test",
		...input,
	};
}

describe("buildDeploymentDiff", () => {
	it("returns null when history has fewer than two events", () => {
		const history: DeploymentHistoryEvent[] = [makeEvent({})];
		expect(buildDeploymentDiff(history)).toBeNull();
	});

	it("returns structural changes between latest two snapshots", () => {
		const history: DeploymentHistoryEvent[] = [
			makeEvent({
				toStage: "canary",
				changedAt: "2026-02-14T00:00:00.000Z",
				snapshot: {
					workspaceId: "ws_1",
					workspaceName: "Workspace",
					workspaceUpdatedAt: "2026-02-14T00:00:00.000Z",
					nodeCount: 4,
					nodeTypeCounts: { textGeneration: 2 },
					modelIds: ["gpt-4o-mini"],
					sourceNodes: ["documentVectorStore"],
					objective: "old objective",
					canaryPolicy: { rolloutPercentage: 10, audience: "beta" },
				},
			}),
			makeEvent({
				fromStage: "canary",
				toStage: "live",
				changedAt: "2026-02-14T00:05:00.000Z",
				snapshot: {
					workspaceId: "ws_1",
					workspaceName: "Workspace",
					workspaceUpdatedAt: "2026-02-14T00:05:00.000Z",
					nodeCount: 6,
					nodeTypeCounts: { textGeneration: 3, imageGeneration: 1 },
					modelIds: ["gpt-4.1", "gpt-4o-mini"],
					sourceNodes: ["documentVectorStore", "githubVectorStore"],
					objective: "new objective",
					canaryPolicy: { rolloutPercentage: 35, audience: "internal" },
				},
			}),
		];

		const diff = buildDeploymentDiff(history);
		expect(diff).not.toBeNull();
		expect(diff?.fromChangedAt).toBe("2026-02-14T00:00:00.000Z");
		expect(diff?.toChangedAt).toBe("2026-02-14T00:05:00.000Z");
		expect(diff?.changes).toEqual(
			expect.arrayContaining([
				"Stage changed from CANARY to LIVE.",
				"Canary rollout changed from 10% to 35%.",
				"Canary audience changed from beta to internal.",
				"Workflow node count changed from 4 to 6.",
				"Model mix changed for this release.",
				"Source requirements changed.",
				"Workflow objective changed.",
			]),
		);
	});
});
