import { expect, test } from "@playwright/test";

test.describe("Admin playbook bootstrap smoke", () => {
	const baseUrl = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

	test("can start project creation from playbook when playbooks and clients exist", async ({
		page,
	}) => {
		await page.goto(`${baseUrl}/projects?new=1`);
		await page.waitForLoadState("networkidle");

		await expect(
			page.getByRole("heading", { name: "New Project" }),
		).toBeVisible();

		const playbookSelect = page.locator('select[name="playbookDbId"]');
		const clientSelect = page.locator('select[name="clientId"]');
		await expect(playbookSelect).toBeVisible();
		await expect(clientSelect).toBeVisible();

		const playbookOptionCount = await playbookSelect.locator("option").count();
		const clientOptionCount = await clientSelect.locator("option").count();

		if (playbookOptionCount < 2 || clientOptionCount < 2) {
			test.skip(
				true,
				"Playbook or client options are unavailable; bootstrap smoke is not applicable.",
			);
		}

		await page
			.locator('input[name="name"]')
			.fill(`Playbook Smoke ${Date.now()}`);
		await clientSelect.selectOption({ index: 1 });
		await playbookSelect.selectOption({ index: 1 });

		await page.getByRole("button", { name: "Create Project" }).click();
		await page.waitForLoadState("networkidle");

		await expect(page).toHaveURL(/\/projects\/prj_/);
	});
});
