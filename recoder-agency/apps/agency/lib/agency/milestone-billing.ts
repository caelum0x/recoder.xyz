import { and, eq } from "drizzle-orm";
import { db, deliverables, invoices } from "@/db";

export interface DeliverableInvoiceStatus {
	deliverableDbId: number;
	deliverableName: string;
	hasInvoice: boolean;
	invoiceId: string | null;
	invoiceStatus: string | null;
}

export async function getDeliverableInvoiceStatus(
	projectDbId: number,
): Promise<DeliverableInvoiceStatus[]> {
	const projectDeliverables = await db
		.select({
			dbId: deliverables.dbId,
			id: deliverables.id,
			name: deliverables.name,
		})
		.from(deliverables)
		.where(eq(deliverables.projectDbId, projectDbId));

	const results: DeliverableInvoiceStatus[] = [];

	for (const d of projectDeliverables) {
		const invoice = await db.query.invoices.findFirst({
			where: and(eq(invoices.deliverableDbId, d.dbId)),
		});

		results.push({
			deliverableDbId: d.dbId,
			deliverableName: d.name,
			hasInvoice: invoice !== undefined,
			invoiceId: invoice?.id ?? null,
			invoiceStatus: invoice?.status ?? null,
		});
	}

	return results;
}
