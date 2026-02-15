import { afterEach, describe, expect, it, vi } from "vitest";
import {
	__resetCronRateLimitStoreForTests,
	buildCronRateLimitHeaders,
	consumeCronRateLimit,
} from "./cron-rate-limit";

describe("cron rate limit", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		__resetCronRateLimitStoreForTests();
	});

	it("allows up to default limit per route and blocks above limit", () => {
		const now = new Date("2026-02-10T10:00:00.000Z");
		let result = consumeCronRateLimit({
			routeKey: "agency_cron_delivery_alerts",
			now,
		});
		expect(result.allowed).toBe(true);
		expect(result.limit).toBe(5);
		expect(result.remaining).toBe(4);

		for (let i = 0; i < 4; i++) {
			result = consumeCronRateLimit({
				routeKey: "agency_cron_delivery_alerts",
				now,
			});
		}

		expect(result.allowed).toBe(true);
		expect(result.remaining).toBe(0);

		const blocked = consumeCronRateLimit({
			routeKey: "agency_cron_delivery_alerts",
			now,
		});
		expect(blocked.allowed).toBe(false);
		expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
	});

	it("isolates buckets per route key", () => {
		const now = new Date("2026-02-10T10:00:00.000Z");
		for (let i = 0; i < 5; i++) {
			consumeCronRateLimit({ routeKey: "agency_cron_delivery_alerts", now });
		}
		const otherRoute = consumeCronRateLimit({
			routeKey: "agency_cron_client_digest",
			now,
		});
		expect(otherRoute.allowed).toBe(true);
		expect(otherRoute.remaining).toBe(4);
	});

	it("respects env overrides for window and max requests", () => {
		vi.stubEnv("CRON_RATE_LIMIT_MAX_REQUESTS", "2");
		vi.stubEnv("CRON_RATE_LIMIT_WINDOW_MS", "1000");
		const now = new Date("2026-02-10T10:00:00.500Z");

		const first = consumeCronRateLimit({
			routeKey: "agency_cron_client_digest",
			now,
		});
		const second = consumeCronRateLimit({
			routeKey: "agency_cron_client_digest",
			now,
		});
		const third = consumeCronRateLimit({
			routeKey: "agency_cron_client_digest",
			now,
		});

		expect(first.allowed).toBe(true);
		expect(second.allowed).toBe(true);
		expect(third.allowed).toBe(false);
	});

	it("builds rate limit headers", () => {
		const resetAt = new Date("2026-02-10T10:01:00.000Z");
		const headers = buildCronRateLimitHeaders({
			limit: 5,
			remaining: 2,
			resetAt,
			retryAfterSeconds: 30,
		});
		expect(headers.get("RateLimit-Limit")).toBe("5");
		expect(headers.get("RateLimit-Remaining")).toBe("2");
		expect(headers.get("Retry-After")).toBe("30");
	});
});
