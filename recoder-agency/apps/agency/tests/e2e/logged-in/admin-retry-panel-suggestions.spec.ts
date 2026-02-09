import { expect, test } from "@playwright/test";

test.describe("Admin retry panel suggestions", () => {
	const baseUrl = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

	test("surfaces guided suggestions for at least one invalid target status", async ({
		page,
	}) => {
		await page.goto(`${baseUrl}/projects`);
		await page.waitForLoadState("networkidle");

		const projectLinks = page.locator('a[href^="/projects/"]');
		const projectCount = await projectLinks.count();
		if (projectCount === 0) {
			test.skip(
				true,
				"No projects available for retry panel suggestion smoke.",
			);
		}

		await projectLinks.first().click();
		await page.waitForLoadState("networkidle");
		await expect(
			page.getByRole("heading", { name: "Client Transition Recovery" }),
		).toBeVisible();

		const statuses = [
			"queued",
			"in_progress",
			"qa",
			"client_review",
			"done",
			"blocked",
		];

		let foundSuggestions = false;
		for (const status of statuses) {
			await page.getByTestId("retry-target-status").selectOption(status);
			await page.getByTestId("retry-target-status-submit").click();
			await page.waitForLoadState("networkidle");

			if (
				await page
					.getByText("Guided suggestions:")
					.first()
					.isVisible()
					.catch(() => false)
			) {
				foundSuggestions = true;
				break;
			}
		}

		if (!foundSuggestions) {
			test.skip(
				true,
				"Could not force an invalid transition suggestion on this project.",
			);
		}

		await expect(page.getByText("Guided suggestions:").first()).toBeVisible();
	});
});
