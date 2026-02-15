import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/teams", () => ({
	fetchCurrentTeam: vi.fn(),
}));

vi.mock("@/services/accounts", () => ({
	fetchCurrentUser: vi.fn(),
}));

vi.mock("@/lib/use-cases/evaluate-readiness", () => ({
	isKnownUseCaseId: vi.fn(() => true),
}));

vi.mock("@/lib/use-cases/simulation", () => ({
	simulateUseCaseForTeam: vi.fn(),
}));

vi.mock("@/lib/use-cases/deployment", () => ({
	buildDeploymentDiff: vi.fn(() => ({ fromChangedAt: "a", toChangedAt: "b", changes: [] })),
	getUseCaseDeploymentSnapshot: vi.fn(),
	updateUseCaseDeploymentStage: vi.fn(),
}));

import { fetchCurrentUser } from "@/services/accounts";
import { fetchCurrentTeam } from "@/services/teams";
import { simulateUseCaseForTeam } from "@/lib/use-cases/simulation";
import { updateUseCaseDeploymentStage } from "@/lib/use-cases/deployment";
import { POST } from "./route";

describe("POST /api/use-cases/deploy", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(fetchCurrentTeam).mockResolvedValue({ dbId: 42 } as never);
		vi.mocked(fetchCurrentUser).mockResolvedValue({ id: "usr_1" } as never);
	});

	it("blocks promote_live when simulation does not pass", async () => {
		vi.mocked(simulateUseCaseForTeam).mockResolvedValue({
			useCaseId: "agent-ops-platform",
			status: "warn",
			summary: "warn",
			objective: "obj",
			readiness: { status: "ready", message: "ok", actionPath: null },
			checks: [],
			generatedAt: "2026-02-14T00:00:00.000Z",
		} as never);

		const response = await POST(
			new Request("http://localhost/api/use-cases/deploy", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					useCaseId: "agent-ops-platform",
					action: "promote_live",
				}),
			}),
		);

		expect(response.status).toBe(409);
		expect(updateUseCaseDeploymentStage).not.toHaveBeenCalled();
		const json = await response.json();
		expect(json.error).toContain("Simulation must pass before promoting to live");
	});

	it("allows promote_live when simulation passes", async () => {
		vi.mocked(simulateUseCaseForTeam).mockResolvedValue({
			useCaseId: "agent-ops-platform",
			status: "pass",
			summary: "pass",
			objective: "obj",
			readiness: { status: "ready", message: "ok", actionPath: null },
			checks: [],
			generatedAt: "2026-02-14T00:00:00.000Z",
		} as never);

		vi.mocked(updateUseCaseDeploymentStage).mockResolvedValue({
			useCaseId: "agent-ops-platform",
			stage: "live",
			canaryPolicy: { rolloutPercentage: 10, audience: "beta" },
			updatedAt: "2026-02-14T00:10:00.000Z",
			workspaceId: "ws_1",
			history: [],
		} as never);

		const response = await POST(
			new Request("http://localhost/api/use-cases/deploy", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					useCaseId: "agent-ops-platform",
					action: "promote_live",
				}),
			}),
		);

		expect(response.status).toBe(200);
		expect(updateUseCaseDeploymentStage).toHaveBeenCalledWith(
			expect.objectContaining({
				teamDbId: 42,
				useCaseId: "agent-ops-platform",
				nextStage: "live",
				actorUserId: "usr_1",
			}),
		);
	});
});
