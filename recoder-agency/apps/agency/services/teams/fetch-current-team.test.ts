import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getCurrentUserMock: vi.fn(),
	getGiselleSessionMock: vi.fn(),
	dbSelectMock: vi.fn(),
}));

vi.mock("@/lib/get-current-user", () => ({
	getCurrentUser: mocks.getCurrentUserMock,
}));

vi.mock("@/lib/giselle-session", () => ({
	getGiselleSession: mocks.getGiselleSessionMock,
}));

vi.mock("@/lib/utils", () => ({
	isEmailFromRoute06: (email: string) => email.endsWith("@route06.com"),
}));

vi.mock("@/db", () => ({
	db: {
		select: mocks.dbSelectMock,
	},
	teamMemberships: {},
	teams: {},
}));

import { fetchCurrentTeam } from "./fetch-current-team";

describe("fetchCurrentTeam bootstrap fallback", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns a synthetic team when user dbId is not provisioned", async () => {
		mocks.getCurrentUserMock.mockResolvedValue({
			id: "usr_1",
			dbId: 0,
			displayName: "Bootstrap User",
			email: "bootstrap@example.com",
			avatarUrl: null,
		});

		const team = await fetchCurrentTeam();

		expect(team.id).toBe("tm_bootstrap");
		expect(team.dbId).toBe(0);
		expect(team.plan).toBe("free");
		expect(mocks.dbSelectMock).not.toHaveBeenCalled();
		expect(mocks.getGiselleSessionMock).not.toHaveBeenCalled();
	});
});
