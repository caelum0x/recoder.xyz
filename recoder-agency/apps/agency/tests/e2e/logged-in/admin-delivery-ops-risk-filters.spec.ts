import { expect, test } from "@playwright/test";

test.describe("Admin delivery ops risk filters", () => {
	const baseUrl = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

	test("roundtrips minRiskScore and hasForcedOnly filters", async ({
		page,
	}) => {
		await page.goto(`${baseUrl}/delivery-ops`);
		await page.waitForLoadState("networkidle");

		await expect(
			page.getByRole("heading", { name: "Delivery Ops" }),
		).toBeVisible();
		await expect(
			page.getByRole("heading", { name: "Exception Queue" }),
		).toBeVisible();

		const minRiskInput = page.locator('input[name="minRiskScore"]');
		const forcedOnlyCheckbox = page.locator('input[name="hasForcedOnly"]');
		await expect(minRiskInput).toBeVisible();
		await expect(forcedOnlyCheckbox).toBeVisible();

		await minRiskInput.fill("3");
		await forcedOnlyCheckbox.check();
		await page.getByRole("button", { name: "Apply" }).click();

		await expect(page).toHaveURL(/minRiskScore=3/);
		await expect(page).toHaveURL(/hasForcedOnly=1/);

		await page.getByRole("link", { name: "Reset" }).click();
		await expect(page).toHaveURL(/\/delivery-ops$/);
		await expect(page).not.toHaveURL(/minRiskScore=/);
		await expect(page).not.toHaveURL(/hasForcedOnly=/);
	});
});
