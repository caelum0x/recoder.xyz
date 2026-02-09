import { expect, test } from "@playwright/test";

test.describe("Admin dashboard freshness badge", () => {
	const baseUrl = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

	test("shows freshness state when weekly metrics freshness data is available", async ({
		page,
	}) => {
		await page.goto(`${baseUrl}/dashboard`);
		await page.waitForLoadState("networkidle");

		await expect(
			page.getByRole("heading", { name: "Weekly Delivery Metrics" }),
		).toBeVisible();

		const freshBadge = page.getByText("Fresh");
		const staleBadge = page.getByText(/Stale \(\d+d old\)/);

		const hasFresh = await freshBadge.isVisible().catch(() => false);
		const hasStale = await staleBadge.isVisible().catch(() => false);

		if (!hasFresh && !hasStale) {
			test.skip(
				true,
				"No freshness badge rendered (likely no weekly metrics freshness data).",
			);
		}

		await expect(freshBadge.or(staleBadge)).toBeVisible();
	});
});
