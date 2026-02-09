import { expect, test } from "@playwright/test";

test.describe("Admin DoD blocking panel", () => {
	const baseUrl = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

	test("shows QA blocking panel when send-for-review fails DoD checks", async ({
		page,
	}) => {
		await page.goto(`${baseUrl}/templates`);
		await page.waitForLoadState("networkidle");

		const documentForm = page
			.locator('form:has(input[name="deliverableType"][value="document"])')
			.first();
		await expect(documentForm).toBeVisible();

		const minInput = documentForm.locator('input[name="minContentLength"]');
		const checklistInput = documentForm.locator(
			'textarea[name="checklistItems"]',
		);
		const requiresFileCheckbox = documentForm.locator(
			'input[name="requiresFile"]',
		);
		const isActiveCheckbox = documentForm.locator('input[name="isActive"]');

		const originalMin = await minInput.inputValue();
		const originalChecklist = await checklistInput.inputValue();
		const originalRequiresFile = await requiresFileCheckbox.isChecked();
		const originalIsActive = await isActiveCheckbox.isChecked();

		try {
			await minInput.fill("99999");
			await checklistInput.fill("never-match-checklist-token");
			if (await requiresFileCheckbox.isChecked()) {
				await requiresFileCheckbox.uncheck();
			}
			if (!(await isActiveCheckbox.isChecked())) {
				await isActiveCheckbox.check();
			}
			await documentForm.locator('button[type="submit"]').click();
			await page.waitForLoadState("networkidle");
			await expect(minInput).toHaveValue("99999");

			await page.goto(`${baseUrl}/projects`);
			await page.waitForLoadState("networkidle");

			const projectLinks = page.locator('a[href^="/projects/"]');
			const projectCount = await projectLinks.count();
			if (projectCount === 0) {
				test.skip(true, "No projects available for DoD blocking panel smoke.");
			}

			await projectLinks.first().click();
			await page.waitForLoadState("networkidle");
			await expect(
				page.getByRole("heading", { name: "Deliverables" }),
			).toBeVisible();

			let sendButton = page
				.getByRole("button", { name: "Send for Review" })
				.first();
			if (!(await sendButton.isVisible().catch(() => false))) {
				await page.getByRole("button", { name: "Add Deliverable" }).click();
				await page
					.locator('input[name="name"]')
					.fill("QA Block Smoke Deliverable");
				await page.locator('select[name="type"]').selectOption("document");
				await page
					.locator('textarea[name="content"]')
					.fill("short content for forced DoD fail");
				await page.getByRole("button", { name: "Add" }).click();
				await page.waitForLoadState("networkidle");
				sendButton = page
					.getByRole("button", { name: "Send for Review" })
					.first();
			}

			await expect(sendButton).toBeVisible();
			await sendButton.click();

			await expect(page.getByTestId("dod-blocking-panel")).toBeVisible();
			await expect(page.getByTestId("dod-blocking-panel-title")).toHaveText(
				"Blocked by QA Gate",
			);
			await expect(
				page.getByTestId("dod-blocking-panel-details"),
			).toContainText("Content below 99999 chars.");
		} finally {
			await page.goto(`${baseUrl}/templates`);
			await page.waitForLoadState("networkidle");
			const restoreForm = page
				.locator('form:has(input[name="deliverableType"][value="document"])')
				.first();
			const restoreMinInput = restoreForm.locator(
				'input[name="minContentLength"]',
			);
			const restoreChecklistInput = restoreForm.locator(
				'textarea[name="checklistItems"]',
			);
			const restoreRequiresFileCheckbox = restoreForm.locator(
				'input[name="requiresFile"]',
			);
			const restoreIsActiveCheckbox = restoreForm.locator(
				'input[name="isActive"]',
			);

			await restoreMinInput.fill(originalMin);
			await restoreChecklistInput.fill(originalChecklist);
			if (originalRequiresFile) {
				if (!(await restoreRequiresFileCheckbox.isChecked())) {
					await restoreRequiresFileCheckbox.check();
				}
			} else if (await restoreRequiresFileCheckbox.isChecked()) {
				await restoreRequiresFileCheckbox.uncheck();
			}
			if (originalIsActive) {
				if (!(await restoreIsActiveCheckbox.isChecked())) {
					await restoreIsActiveCheckbox.check();
				}
			} else if (await restoreIsActiveCheckbox.isChecked()) {
				await restoreIsActiveCheckbox.uncheck();
			}
			await restoreForm.locator('button[type="submit"]').click();
			await page.waitForLoadState("networkidle");
		}
	});
});
