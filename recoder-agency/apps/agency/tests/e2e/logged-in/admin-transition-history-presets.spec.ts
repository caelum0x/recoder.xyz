import { expect, test } from "@playwright/test";

test.describe("Admin transition history presets", () => {
	const baseUrl = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

	test("applies quick preset filters via URL params", async ({ page }) => {
		await page.goto(`${baseUrl}/projects`);
		await page.waitForLoadState("networkidle");

		const projectLinks = page.locator('a[href^="/projects/"]');
		const projectCount = await projectLinks.count();
		if (projectCount === 0) {
			test.skip(
				true,
				"No projects available for transition history preset test.",
			);
		}

		await projectLinks.first().click();
		await page.waitForLoadState("networkidle");

		await expect(
			page.getByRole("heading", { name: "Status Transition History" }),
		).toBeVisible();

		await page.getByRole("link", { name: "Last 7d" }).click();
		await expect(page).toHaveURL(/startDate=\d{4}-\d{2}-\d{2}/);
		await expect(page).toHaveURL(/endDate=\d{4}-\d{2}-\d{2}/);
		await expect(page).toHaveURL(/page=1/);

		await page.getByRole("link", { name: "Forced Only" }).click();
		await expect(page).toHaveURL(/forced=true/);

		await page.selectOption('select[name="pageSize"]', "25");
		await page.getByRole("button", { name: "Apply" }).click();
		await expect(page).toHaveURL(/pageSize=25/);

		const currentPath = new URL(page.url()).pathname;
		await page.goto(`${baseUrl}${currentPath}?page=999999&pageSize=13`);
		await expect(page).toHaveURL(/pageSize=10/);
		await expect(page).not.toHaveURL(/page=999999/);

		await page.goto(
			`${baseUrl}${currentPath}?startDate=2026-12-31&endDate=2026-01-01&page=1`,
		);
		await expect(page).toHaveURL(/startDate=2026-01-01/);
		await expect(page).toHaveURL(/endDate=2026-12-31/);
	});
});
