import { expect, test } from "@playwright/test";

test.describe("Admin dashboard KPI cards", () => {
	const baseUrl = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

	test("shows populated weekly KPI state when metrics rows exist", async ({
		page,
	}) => {
		await page.goto(`${baseUrl}/dashboard`);
		await page.waitForLoadState("networkidle");

		await expect(
			page.getByRole("heading", { name: "Weekly Delivery Metrics" }),
		).toBeVisible();

		const snapshotLabel = page.getByText("Snapshot week of");
		if (!(await snapshotLabel.isVisible().catch(() => false))) {
			test.skip(
				true,
				"No weekly metrics rows available for populated KPI state.",
			);
		}

		await expect(snapshotLabel).toBeVisible();
		await expect(page.getByText("Avg Cycle Time")).toBeVisible();
		await expect(page.getByText("First-Pass Approval")).toBeVisible();
		await expect(page.getByText("Forced Transition Rate")).toBeVisible();

		await expect(
			page.getByRole("heading", { name: "Project Unit Economics" }),
		).toBeVisible();
		const pAndLEmptyState = page.getByText(
			"No unit-economics rows yet. Add invoices and cost entries to see project P&L.",
		);
		if (!(await pAndLEmptyState.isVisible().catch(() => false))) {
			await expect(page.getByText("Gross Margin")).toBeVisible();
			await expect(page.getByText("AI/Tool Cost")).toBeVisible();
		}
	});

	test("shows empty weekly KPI state when metrics rows are unavailable", async ({
		page,
	}) => {
		await page.goto(`${baseUrl}/dashboard`);
		await page.waitForLoadState("networkidle");

		await expect(
			page.getByRole("heading", { name: "Weekly Delivery Metrics" }),
		).toBeVisible();

		const emptyState = page.getByText(
			"Run migration 0082 to enable materialized KPI snapshots.",
		);
		if (!(await emptyState.isVisible().catch(() => false))) {
			test.skip(
				true,
				"Weekly metrics rows exist; empty-state assertion not applicable.",
			);
		}

		await expect(emptyState).toBeVisible();

		await expect(
			page.getByRole("heading", { name: "Project Unit Economics" }),
		).toBeVisible();
	});

	test("shows empty unit economics state when project pnl rows are unavailable", async ({
		page,
	}) => {
		await page.goto(`${baseUrl}/dashboard`);
		await page.waitForLoadState("networkidle");

		await expect(
			page.getByRole("heading", { name: "Project Unit Economics" }),
		).toBeVisible();
		const emptyState = page.getByText(
			"No unit-economics rows yet. Add invoices and cost entries to see project P&L.",
		);
		if (!(await emptyState.isVisible().catch(() => false))) {
			test.skip(
				true,
				"Unit-economics rows exist; empty-state assertion not applicable.",
			);
		}

		await expect(emptyState).toBeVisible();
	});
});
