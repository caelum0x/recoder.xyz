"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { retryInvoiceSend } from "@/app/(admin)/projects/[projectId]/invoice-actions";
import { db, invoices, projects } from "@/db";
import { requireAdminRole } from "@/services/teams";

export async function refreshWeeklyMetricsNow() {
	await requireAdminRole();
	await db.execute(
		sql`REFRESH MATERIALIZED VIEW public.weekly_delivery_metrics`,
	);
	revalidatePath("/dashboard");
}

export async function retryInvoiceFromDashboard(formData: FormData) {
	const team = await requireAdminRole();
	const invoiceId = String(formData.get("invoiceId") ?? "").trim();
	if (!invoiceId) {
		throw new Error("Invoice id is required.");
	}

	const invoice = await db.query.invoices.findFirst({
		where: and(eq(invoices.id, invoiceId), eq(invoices.teamDbId, team.dbId)),
	});
	if (!invoice?.projectDbId) {
		throw new Error("Invoice not found or missing project.");
	}
	const project = await db.query.projects.findFirst({
		where: eq(projects.dbId, invoice.projectDbId),
	});
	if (!project) {
		throw new Error("Project not found for invoice.");
	}

	await retryInvoiceSend(invoice.id, project.id);
	revalidatePath("/dashboard");
}
