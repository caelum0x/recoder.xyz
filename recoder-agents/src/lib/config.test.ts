import { describe, expect, it } from "vitest";
import { config, EnvMode, isLocalMode, isProductionMode, isStagingMode } from "./config";

describe("config", () => {
	it("defaults to local mode when NEXT_PUBLIC_ENV_MODE is not set", () => {
		expect(config.ENV_MODE).toBe(EnvMode.LOCAL);
		expect(isLocalMode()).toBe(true);
		expect(isStagingMode()).toBe(false);
		expect(isProductionMode()).toBe(false);
	});

	it("exposes tier-key subscription mapping", () => {
		expect(config.SUBSCRIPTION_TIERS.FREE_TIER.tierKey).toBe("free");
		expect(config.SUBSCRIPTION_TIERS.TIER_6_50.tierKey).toBe("tier_6_50");
		expect(config.SUBSCRIPTION_TIERS.TIER_200_1000.name).toContain("$1000");
	});
});
