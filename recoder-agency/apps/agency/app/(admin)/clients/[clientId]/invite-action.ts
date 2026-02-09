"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
	ACTIVE_INVITATION_EXISTS_ERROR,
	CLIENT_ALREADY_HAS_PORTAL_ACCESS_ERROR,
	CLIENT_EMAIL_REQUIRED_ERROR,
	CLIENT_NOT_FOUND_ERROR,
	createClientInvitation,
	fetchClientInvitation,
	revokeClientInvitation,
	sendClientInvitationEmail,
} from "@/lib/agency/client-invitation";
import { getCurrentUser } from "@/lib/get-current-user";
import { requireAdminRole } from "@/services/teams";

export async function inviteClientToPortal(clientId: string) {
	const team = await requireAdminRole();
	const user = await getCurrentUser();

	try {
		const invitation = await createClientInvitation({
			clientId,
			currentTeam: team,
			currentUser: { dbId: user.dbId, id: user.id },
		});
		await sendClientInvitationEmail(invitation);
		revalidatePath(`/clients/${clientId}`);
		redirect(`/clients/${clientId}?invite=sent`);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		let reason = "error";
		switch (message) {
			case CLIENT_NOT_FOUND_ERROR:
				reason = "not_found";
				break;
			case CLIENT_EMAIL_REQUIRED_ERROR:
				reason = "missing_email";
				break;
			case CLIENT_ALREADY_HAS_PORTAL_ACCESS_ERROR:
				reason = "already_active";
				break;
			case ACTIVE_INVITATION_EXISTS_ERROR:
				reason = "already_invited";
				break;
			default:
				reason = "error";
		}
		redirect(`/clients/${clientId}?invite=${reason}`);
	}
}

export async function resendClientInvitation(clientId: string, token: string) {
	const team = await requireAdminRole();
	const user = await getCurrentUser();

	const invitation = await fetchClientInvitation(token);
	if (!invitation || invitation.teamDbId !== team.dbId) {
		redirect(`/clients/${clientId}?invite=not_found`);
	}

	await revokeClientInvitation(token);
	const newInvitation = await createClientInvitation({
		clientId,
		currentTeam: team,
		currentUser: { dbId: user.dbId, id: user.id },
	});
	await sendClientInvitationEmail(newInvitation);

	revalidatePath(`/clients/${clientId}`);
	redirect(`/clients/${clientId}?invite=resent`);
}

export async function revokeClientInvitationAction(
	clientId: string,
	token: string,
) {
	await revokeClientInvitation(token);
	revalidatePath(`/clients/${clientId}`);
	redirect(`/clients/${clientId}?invite=revoked`);
}
