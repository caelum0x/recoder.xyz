import { expect, test } from "@playwright/test";

test.describe("Admin dashboard rollout flags", () => {
	const baseUrl = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

	test("shows rollout flag cards including weekly metrics auto-refresh", async ({
		page,
	}) => {
		await page.goto(`${baseUrl}/dashboard`);
		await page.waitForLoadState("networkidle");

		await expect(
			page.getByRole("heading", { name: "Rollout Flags" }),
		).toBeVisible();

		await expect(page.getByText("FEATURE_RETRY_PANEL")).toBeVisible();
		await expect(
			page.getByText("NEXT_PUBLIC_FEATURE_FUNNEL_ANALYTICS"),
		).toBeVisible();
		await expect(
			page.getByText("FEATURE_AUTO_REFRESH_WEEKLY_METRICS"),
		).toBeVisible();
		await expect(
			page.getByText("FEATURE_MANUAL_REFRESH_WEEKLY_METRICS"),
		).toBeVisible();
		await expect(page.getByText("AGENCY_STAGING_DATABASE_URL")).toBeVisible();
		await expect(
			page.getByText("WEEKLY_METRICS_STALE_AFTER_DAYS"),
		).toBeVisible();
		await expect(
			page.getByText("RESTORE_DRILL_STALE_AFTER_DAYS"),
		).toBeVisible();
		await expect(
			page.getByRole("heading", { name: "Release Readiness" }),
		).toBeVisible();
		await expect(
			page.getByRole("heading", { name: "Audit Events" }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Refresh KPIs" }),
		).toBeVisible();
	});
});
