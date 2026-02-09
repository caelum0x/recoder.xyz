import { expect, test } from "@playwright/test";

test.describe("Admin transition history roundtrip", () => {
	const baseUrl = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

	test("preserves filters when paginating forward and back", async ({
		page,
	}) => {
		await page.goto(`${baseUrl}/projects`);
		await page.waitForLoadState("networkidle");

		const projectLinks = page.locator('a[href^="/projects/"]');
		const projectCount = await projectLinks.count();
		if (projectCount === 0) {
			test.skip(
				true,
				"No projects available for transition history roundtrip.",
			);
		}

		await projectLinks.first().click();
		await page.waitForLoadState("networkidle");
		await expect(
			page.getByRole("heading", { name: "Status Transition History" }),
		).toBeVisible();
		await expect(
			page.getByRole("heading", { name: "Recent QA Gate Runs" }),
		).toBeVisible();

		await page
			.getByPlaceholder("Source (exact)")
			.fill("client.portal.deliverables.review");
		await page.selectOption('select[name="forced"]', "false");
		await page.selectOption('select[name="pageSize"]', "10");
		await page.getByRole("button", { name: "Apply" }).click();
		await expect(page).toHaveURL(/source=client\.portal\.deliverables\.review/);
		await expect(page).toHaveURL(/forced=false/);
		await expect(page).toHaveURL(/pageSize=10/);
		await expect(page).toHaveURL(/page=1/);

		const nextLink = page.getByRole("link", { name: "Next" });
		if (!(await nextLink.isVisible().catch(() => false))) {
			test.skip(true, "Not enough transition rows for pagination roundtrip.");
		}

		await nextLink.click();
		await expect(page).toHaveURL(/page=2/);
		await expect(page).toHaveURL(/source=client\.portal\.deliverables\.review/);
		await expect(page).toHaveURL(/forced=false/);
		await expect(page).toHaveURL(/pageSize=10/);

		await page.getByRole("link", { name: "Previous" }).click();
		await expect(page).toHaveURL(/page=1/);
		await expect(page).toHaveURL(/source=client\.portal\.deliverables\.review/);
		await expect(page).toHaveURL(/forced=false/);
	});
});
