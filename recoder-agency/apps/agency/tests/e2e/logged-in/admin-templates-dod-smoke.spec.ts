import { expect, test } from "@playwright/test";

test.describe("Admin templates DoD management", () => {
	const baseUrl = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

	test("renders DoD template editor and can submit a no-op save", async ({
		page,
	}) => {
		await page.goto(`${baseUrl}/templates`);
		await page.waitForLoadState("networkidle");

		await expect(
			page.getByRole("heading", { name: "Templates" }),
		).toBeVisible();
		await expect(
			page.getByRole("heading", { name: "Definition of Done Templates" }),
		).toBeVisible();

		const documentForm = page
			.locator('form:has(input[name="deliverableType"][value="document"])')
			.first();
		await expect(documentForm).toBeVisible();

		const minInput = documentForm.locator('input[name="minContentLength"]');
		const existingValue = await minInput.inputValue();
		await documentForm.locator('button[type="submit"]').click();
		await page.waitForLoadState("networkidle");

		await expect(
			page.getByRole("heading", { name: "Definition of Done Templates" }),
		).toBeVisible();
		await expect(
			page
				.locator('form:has(input[name="deliverableType"][value="document"])')
				.first()
				.locator('input[name="minContentLength"]'),
		).toHaveValue(existingValue);
	});
});
