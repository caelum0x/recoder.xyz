"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { clients, db, deliverables, invoices, projects } from "@/db";
import { polar } from "@/services/external/polar";
import { requireAdminRole } from "@/services/teams";

export async function createInvoice(formData: FormData) {
	const team = await requireAdminRole();
	const projectId = formData.get("projectId") as string;
	const amountStr = formData.get("amount") as string;
	const dueDateStr = formData.get("dueDate") as string;
	const deliverableId = (formData.get("deliverableId") as string) || null;

	const amount = Math.round(Number.parseFloat(amountStr) * 100); // dollars → cents
	if (Number.isNaN(amount) || amount <= 0) {
		throw new Error("Invalid amount");
	}

	const project = await db.query.projects.findFirst({
		where: and(eq(projects.id, projectId), eq(projects.teamDbId, team.dbId)),
	});

	if (!project) {
		throw new Error("Project not found");
	}
	let deliverableDbId: number | null = null;
	if (deliverableId) {
		const deliverable = await db.query.deliverables.findFirst({
			where: and(
				eq(deliverables.id, deliverableId),
				eq(deliverables.projectDbId, project.dbId),
			),
		});
		if (!deliverable) {
			throw new Error("Milestone deliverable not found");
		}
		if (!deliverable.isBillableMilestone) {
			throw new Error(
				"Selected deliverable is not marked as billable milestone",
			);
		}
		deliverableDbId = deliverable.dbId;
	}

	const id = crypto.randomUUID();

	await db.insert(invoices).values({
		id,
		teamDbId: team.dbId,
		projectDbId: project.dbId,
		clientDbId: project.clientDbId,
		amount,
		currency: "usd",
		status: "draft",
		dueDate: dueDateStr ? new Date(dueDateStr) : null,
		deliverableDbId,
		quoteDbId: project.quoteDbId ?? null,
	});

	revalidatePath(`/projects/${projectId}`);
}

async function attemptSendInvoice(invoiceId: string, projectId: string) {
	const team = await requireAdminRole();

	const invoice = await db.query.invoices.findFirst({
		where: and(eq(invoices.id, invoiceId), eq(invoices.teamDbId, team.dbId)),
	});

	if (!invoice || !invoice.clientDbId || !invoice.projectDbId) {
		throw new Error("Invoice not found");
	}

	const client = await db.query.clients.findFirst({
		where: eq(clients.dbId, invoice.clientDbId),
	});

	if (!client?.email) {
		throw new Error("Client has no email address");
	}

	// Ensure Polar customer exists
	let polarCustomerId = client.polarCustomerId;
	if (!polarCustomerId) {
		const customer = await polar.customers.create({
			email: client.email,
			name: client.name,
			metadata: { clientId: client.id },
		});
		polarCustomerId = customer.id;
		await db
			.update(clients)
			.set({ polarCustomerId })
			.where(eq(clients.dbId, client.dbId));
	}

	// Create a Polar checkout for the invoice amount
	const productId = process.env.POLAR_PRO_PRODUCT_ID;
	if (!productId) {
		throw new Error("POLAR_PRO_PRODUCT_ID is not set");
	}

	const checkout = await polar.checkouts.create({
		products: [productId],
		amount: invoice.amount,
		customerId: polarCustomerId,
		metadata: { invoiceId: invoice.id, projectId },
	});

	await db
		.update(invoices)
		.set({
			status: "sent",
			polarOrderId: checkout.id,
			lastError: null,
			nextRetryAt: null,
			lastRetryAt: new Date(),
		})
		.where(eq(invoices.id, invoiceId));
}

export async function sendInvoice(invoiceId: string, projectId: string) {
	const team = await requireAdminRole();
	const invoice = await db.query.invoices.findFirst({
		where: and(eq(invoices.id, invoiceId), eq(invoices.teamDbId, team.dbId)),
	});
	if (!invoice) {
		throw new Error("Invoice not found");
	}
	try {
		await attemptSendInvoice(invoiceId, projectId);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown send error";
		await db
			.update(invoices)
			.set({
				status: "overdue",
				retryCount: (invoice.retryCount ?? 0) + 1,
				lastRetryAt: new Date(),
				lastError: message,
				nextRetryAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
			})
			.where(eq(invoices.dbId, invoice.dbId));
		throw error;
	} finally {
		revalidatePath(`/projects/${projectId}`);
	}
}

export async function retryInvoiceSend(invoiceId: string, projectId: string) {
	const team = await requireAdminRole();
	const invoice = await db.query.invoices.findFirst({
		where: and(eq(invoices.id, invoiceId), eq(invoices.teamDbId, team.dbId)),
	});
	if (!invoice) {
		throw new Error("Invoice not found");
	}
	if (invoice.autoRetryDisabled) {
		throw new Error("Auto retry is disabled for this invoice.");
	}

	try {
		await attemptSendInvoice(invoiceId, projectId);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown retry error";
		await db
			.update(invoices)
			.set({
				status: "overdue",
				retryCount: (invoice.retryCount ?? 0) + 1,
				lastRetryAt: new Date(),
				lastError: message,
				nextRetryAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
			})
			.where(eq(invoices.dbId, invoice.dbId));
		throw error;
	} finally {
		revalidatePath(`/projects/${projectId}`);
		revalidatePath("/dashboard");
	}
}

export async function markInvoicePaid(invoiceId: string, projectId: string) {
	const team = await requireAdminRole();

	const invoice = await db.query.invoices.findFirst({
		where: and(eq(invoices.id, invoiceId), eq(invoices.teamDbId, team.dbId)),
	});

	if (!invoice) {
		throw new Error("Invoice not found");
	}

	await db
		.update(invoices)
		.set({
			status: "paid",
			paidAt: new Date(),
			lastError: null,
			nextRetryAt: null,
		})
		.where(eq(invoices.id, invoiceId));

	revalidatePath(`/projects/${projectId}`);
}
