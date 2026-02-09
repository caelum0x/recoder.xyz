"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clients, db } from "@/db";
import {
	createClientInvitation,
	revokeClientInvitation as revokeInvitation,
	sendClientInvitationEmail,
} from "@/lib/agency/client-invitation";
import { fetchCurrentUser } from "@/services/accounts";
import { requireAdminRole } from "@/services/teams";

export async function createClient(formData: FormData) {
	const team = await requireAdminRole();
	const name = formData.get("name") as string;
	const email = (formData.get("email") as string) || null;
	const company = (formData.get("company") as string) || null;
	const phone = (formData.get("phone") as string) || null;
	const notes = (formData.get("notes") as string) || null;
	const status = (formData.get("status") as string) || "lead";

	if (!name?.trim()) {
		throw new Error("Client name is required");
	}

	const id = crypto.randomUUID();

	await db.insert(clients).values({
		id,
		teamDbId: team.dbId,
		name: name.trim(),
		email: email?.trim() ?? null,
		company: company?.trim() ?? null,
		phone: phone?.trim() ?? null,
		notes: notes?.trim() ?? null,
		status: status as "active" | "inactive" | "lead",
	});

	revalidatePath("/clients");
	redirect(`/clients/${id}`);
}

export async function updateClient(clientId: string, formData: FormData) {
	const team = await requireAdminRole();
	const name = formData.get("name") as string;
	const email = (formData.get("email") as string) || null;
	const company = (formData.get("company") as string) || null;
	const phone = (formData.get("phone") as string) || null;
	const notes = (formData.get("notes") as string) || null;
	const status = (formData.get("status") as string) || "lead";

	if (!name?.trim()) {
		throw new Error("Client name is required");
	}

	await db
		.update(clients)
		.set({
			name: name.trim(),
			email: email?.trim() ?? null,
			company: company?.trim() ?? null,
			phone: phone?.trim() ?? null,
			notes: notes?.trim() ?? null,
			status: status as "active" | "inactive" | "lead",
		})
		.where(and(eq(clients.id, clientId), eq(clients.teamDbId, team.dbId)));

	revalidatePath(`/clients/${clientId}`);
	revalidatePath("/clients");
}

export async function deleteClient(clientId: string) {
	const team = await requireAdminRole();

	await db
		.delete(clients)
		.where(and(eq(clients.id, clientId), eq(clients.teamDbId, team.dbId)));

	revalidatePath("/clients");
	redirect("/clients");
}

export async function inviteClientToPortal(clientId: string) {
	const team = await requireAdminRole();
	const user = await fetchCurrentUser();

	try {
		const invitation = await createClientInvitation({
			clientId,
			currentTeam: team,
			currentUser: user,
		});

		await sendClientInvitationEmail(invitation);

		revalidatePath(`/clients/${clientId}`);
		return { success: true };
	} catch (error) {
		if (error instanceof Error) {
			return { success: false, error: error.message };
		}
		return { success: false, error: "Failed to send invitation" };
	}
}

export async function resendClientInvitation(clientId: string, token: string) {
	const team = await requireAdminRole();
	const user = await fetchCurrentUser();

	try {
		// Revoke existing invitation
		await revokeInvitation(token);

		// Create a new invitation
		const invitation = await createClientInvitation({
			clientId,
			currentTeam: team,
			currentUser: user,
		});

		await sendClientInvitationEmail(invitation);

		revalidatePath(`/clients/${clientId}`);
		return { success: true };
	} catch (error) {
		if (error instanceof Error) {
			return { success: false, error: error.message };
		}
		return { success: false, error: "Failed to resend invitation" };
	}
}

export async function revokeClientInvitation(clientId: string, token: string) {
	try {
		await revokeInvitation(token);
		revalidatePath(`/clients/${clientId}`);
		return { success: true };
	} catch (error) {
		if (error instanceof Error) {
			return { success: false, error: error.message };
		}
		return { success: false, error: "Failed to revoke invitation" };
	}
}
