import { expect, test } from "@playwright/test";

test.describe("Admin delivery ops SLA breach section", () => {
	const baseUrl = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

	test("renders SLA breaches summary and panel", async ({ page }) => {
		await page.goto(`${baseUrl}/delivery-ops`);
		await page.waitForLoadState("networkidle");

		await expect(
			page.getByRole("heading", { name: "Delivery Ops" }),
		).toBeVisible();
		await expect(
			page.getByRole("heading", { name: "SLA Breaches" }),
		).toBeVisible();
		await expect(
			page.getByRole("heading", { name: "SLA Breached Projects" }),
		).toBeVisible();
	});
});
