import { expect, test } from "@playwright/test";

test.describe("Client portal seeded state transition smoke", () => {
	const baseUrl = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
	const seededProjectId =
		process.env.PLAYWRIGHT_SEEDED_PROJECT_ID || "e2e_client_review_project";

	test("approves one deliverable and rejects one deliverable with required reason", async ({
		page,
	}) => {
		await page.goto(`${baseUrl}/portal/projects/${seededProjectId}`);
		await page.waitForLoadState("networkidle");

		await expect(
			page.getByRole("heading", {
				name: "Playwright Seeded Client Review Project",
			}),
		).toBeVisible();
		await expect(page.getByText("2 pending review")).toBeVisible();

		await page.getByRole("button", { name: "Approve" }).first().click();
		await page.waitForLoadState("networkidle");
		await expect(page.getByText("1 pending review")).toBeVisible();

		await page.getByRole("button", { name: "Request Changes" }).first().click();
		await page
			.getByPlaceholder("What changes would you like? (required)")
			.first()
			.fill("Please refine layout spacing and polish CTA hierarchy.");
		await page.getByRole("button", { name: "Submit Feedback" }).first().click();
		await page.waitForLoadState("networkidle");

		await expect(page.getByText("0 pending review")).toBeVisible();
		await expect(page.getByText(/^approved$/i).first()).toBeVisible();
		await expect(page.getByText(/^rejected$/i).first()).toBeVisible();
	});
});
