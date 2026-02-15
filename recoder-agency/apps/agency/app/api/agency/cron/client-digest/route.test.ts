import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => {
	return {
		db: {
			selectDistinct: vi.fn(),
		},
		clientDigestSchedules: {
			teamDbId: "clientDigestSchedules.teamDbId",
			isActive: "clientDigestSchedules.isActive",
		},
	};
});

vi.mock("@/lib/agency/client-digest", () => {
	return {
		processDigestBatch: vi.fn(),
	};
});

vi.mock("@/app/api/_lib/cron-rate-limit", () => {
	return {
		consumeCronRateLimit: vi.fn(),
		buildCronRateLimitHeaders: vi.fn(() => new Headers()),
	};
});

import { consumeCronRateLimit } from "@/app/api/_lib/cron-rate-limit";
import { db } from "@/db";
import { processDigestBatch } from "@/lib/agency/client-digest";
import { GET } from "./route";

describe("GET /api/agency/cron/client-digest", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		process.env.CRON_SECRET = "test-secret";
	});

	it("returns 429 when cron rate limit is exceeded", async () => {
		// @ts-expect-error mocked function
		consumeCronRateLimit.mockReturnValue({
			allowed: false,
			limit: 5,
			remaining: 0,
			resetAt: new Date("2026-02-10T00:00:00.000Z"),
			retryAfterSeconds: 30,
		});

		const request = new Request(
			"https://example.com/api/agency/cron/client-digest",
			{
				headers: {
					authorization: "Bearer test-secret",
				},
			},
		);

		const response = await GET(request);
		expect(response.status).toBe(429);
		expect(processDigestBatch).not.toHaveBeenCalled();
	});

	it("processes active teams when rate limit allows", async () => {
		// @ts-expect-error mocked function
		consumeCronRateLimit.mockReturnValue({
			allowed: true,
			limit: 5,
			remaining: 4,
			resetAt: new Date("2026-02-10T00:00:00.000Z"),
			retryAfterSeconds: 0,
		});
		// @ts-expect-error mocked select chain
		db.selectDistinct.mockReturnValue({
			from: () => ({
				where: async () => [{ teamDbId: 1 }, { teamDbId: 2 }],
			}),
		});
		// @ts-expect-error mocked function
		processDigestBatch.mockResolvedValue(undefined);

		const request = new Request(
			"https://example.com/api/agency/cron/client-digest",
			{
				headers: {
					authorization: "Bearer test-secret",
				},
			},
		);

		const response = await GET(request);
		expect(response.status).toBe(200);
		const payload = await response.json();
		expect(payload).toEqual({ ok: true, teamsProcessed: 2 });
		expect(processDigestBatch).toHaveBeenCalledTimes(2);
	});
});
