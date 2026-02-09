import { expect, test } from "@playwright/test";

test.describe("Client portal review smoke", () => {
	const baseUrl = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

	test("shows review controls and validates reject feedback input", async ({
		page,
	}) => {
		await page.goto(`${baseUrl}/portal/projects`);

		const noClientProfile = page.getByText("No client profile found.");
		if (await noClientProfile.isVisible().catch(() => false)) {
			test.skip(true, "Authenticated test account is not mapped to a client.");
		}

		const projectLinks = page.locator('a[href^="/portal/projects/"]');
		const projectCount = await projectLinks.count();
		if (projectCount === 0) {
			test.skip(true, "No client projects available for review smoke test.");
		}

		await projectLinks.first().click();
		await page.waitForLoadState("networkidle");

		const approveButtons = page.getByRole("button", { name: "Approve" });
		const reviewCount = await approveButtons.count();
		if (reviewCount === 0) {
			test.skip(
				true,
				"No pending_review deliverable found with review controls.",
			);
		}

		await page.getByRole("button", { name: "Request Changes" }).first().click();

		const submitButton = page
			.getByRole("button", { name: "Submit Feedback" })
			.first();
		await expect(submitButton).toBeDisabled();

		const feedbackInput = page
			.getByPlaceholder("What changes would you like?")
			.first();
		await feedbackInput.fill("Spacing needs refinement on mobile.");
		await expect(submitButton).toBeEnabled();

		await page.getByRole("button", { name: "Cancel" }).first().click();
		await expect(
			page.getByRole("button", { name: "Request Changes" }).first(),
		).toBeVisible();

		await page.getByRole("button", { name: "Request Changes (Bulk)" }).click();
		const bulkSubmit = page.getByRole("button", { name: "Apply Bulk Reject" });
		await expect(bulkSubmit).toBeDisabled();
		await page
			.getByPlaceholder("Required reason for all pending deliverables")
			.fill("Please revise interactions and spacing.");
		await expect(bulkSubmit).toBeEnabled();
	});
});
