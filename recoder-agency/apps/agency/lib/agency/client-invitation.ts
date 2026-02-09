import { render } from "@react-email/components";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { UserId } from "@/db";
import { clientInvitations, clients, db, teams } from "@/db";
import { ClientInvitationEmail } from "@/emails/transactional/client-invitation";
import { sendEmail } from "@/services/external/email/send-email";

export const CLIENT_NOT_FOUND_ERROR = "Client not found";
export const CLIENT_EMAIL_REQUIRED_ERROR =
	"Client does not have an email address";
export const CLIENT_ALREADY_HAS_PORTAL_ACCESS_ERROR =
	"Client already has portal access";
export const ACTIVE_INVITATION_EXISTS_ERROR =
	"An active invitation already exists for this client";

interface CreateInvitationArgs {
	clientId: string;
	currentTeam: { dbId: number; name: string };
	currentUser: { dbId: number; id: UserId };
}

export async function createClientInvitation({
	clientId,
	currentTeam,
	currentUser,
}: CreateInvitationArgs) {
	const client = await db.query.clients.findFirst({
		where: and(
			eq(clients.id, clientId),
			eq(clients.teamDbId, currentTeam.dbId),
		),
	});

	if (!client) {
		throw new Error(CLIENT_NOT_FOUND_ERROR);
	}

	if (!client.email) {
		throw new Error(CLIENT_EMAIL_REQUIRED_ERROR);
	}

	if (client.supabaseUserId) {
		throw new Error(CLIENT_ALREADY_HAS_PORTAL_ACCESS_ERROR);
	}

	// Check for existing active invitation
	const existing = await db.query.clientInvitations.findFirst({
		where: and(
			eq(clientInvitations.clientDbId, client.dbId),
			isNull(clientInvitations.revokedAt),
			isNull(clientInvitations.acceptedAt),
			gt(clientInvitations.expiredAt, new Date()),
		),
	});

	if (existing) {
		throw new Error(ACTIVE_INVITATION_EXISTS_ERROR);
	}

	const token = crypto.randomUUID();
	const expiredAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

	const [invitation] = await db
		.insert(clientInvitations)
		.values({
			token,
			clientDbId: client.dbId,
			teamDbId: currentTeam.dbId,
			email: client.email,
			inviterUserDbId: currentUser.dbId,
			expiredAt,
		})
		.returning();

	return {
		...invitation,
		clientName: client.name,
		teamName: currentTeam.name,
	};
}

export async function sendClientInvitationEmail(invitation: {
	token: string;
	email: string;
	clientName: string;
	teamName: string;
}) {
	const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
	const joinUrl = `${baseUrl}/client-portal/join/${invitation.token}`;

	const emailHtml = await render(
		ClientInvitationEmail({
			agencyName: invitation.teamName,
			clientName: invitation.clientName,
			joinUrl,
		}),
	);

	await sendEmail(
		`You've been invited to the ${invitation.teamName} client portal`,
		`Hi ${invitation.clientName}, you've been invited to access the client portal. Visit: ${joinUrl}`,
		[
			{
				userEmail: invitation.email,
				userDisplayName: invitation.clientName,
			},
		],
		{ html: emailHtml },
	);
}

export async function fetchClientInvitation(token: string) {
	const rows = await db
		.select({
			dbId: clientInvitations.dbId,
			token: clientInvitations.token,
			clientDbId: clientInvitations.clientDbId,
			teamDbId: clientInvitations.teamDbId,
			email: clientInvitations.email,
			inviterUserDbId: clientInvitations.inviterUserDbId,
			expiredAt: clientInvitations.expiredAt,
			acceptedAt: clientInvitations.acceptedAt,
			revokedAt: clientInvitations.revokedAt,
			createdAt: clientInvitations.createdAt,
			clientEmail: clients.email,
			clientName: clients.name,
			teamName: teams.name,
		})
		.from(clientInvitations)
		.innerJoin(clients, eq(clientInvitations.clientDbId, clients.dbId))
		.innerJoin(teams, eq(clientInvitations.teamDbId, teams.dbId))
		.where(eq(clientInvitations.token, token))
		.limit(1);

	if (rows.length === 0) {
		return null;
	}

	return rows[0];
}

export async function revokeClientInvitation(token: string) {
	await db
		.update(clientInvitations)
		.set({ revokedAt: new Date() })
		.where(eq(clientInvitations.token, token));
}

export async function listClientInvitations(clientDbId: number) {
	return db
		.select()
		.from(clientInvitations)
		.where(eq(clientInvitations.clientDbId, clientDbId))
		.orderBy(clientInvitations.createdAt);
}

export async function acceptClientInvitation(
	token: string,
	supabaseUserId: string,
	_email?: string,
) {
	const invitation = await db.query.clientInvitations.findFirst({
		where: and(
			eq(clientInvitations.token, token),
			isNull(clientInvitations.revokedAt),
			isNull(clientInvitations.acceptedAt),
			gt(clientInvitations.expiredAt, new Date()),
		),
	});

	if (!invitation) {
		return null;
	}

	// Mark invitation as accepted
	await db
		.update(clientInvitations)
		.set({ acceptedAt: new Date() })
		.where(eq(clientInvitations.token, token));

	// Link the supabase user to the client
	await db
		.update(clients)
		.set({ supabaseUserId })
		.where(eq(clients.dbId, invitation.clientDbId));

	return invitation;
}
