import { render, toPlainText } from "@react-email/components";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import {
	clientInvitations,
	clients,
	db,
	teams,
	type UserId,
	users,
} from "@/db";
import ClientPortalInvitationEmail from "@/emails/transactional/client-portal-invitation";
import { sendEmail } from "@/services/external/email";
import type { CurrentTeam } from "@/services/teams";

export type ClientInvitation = typeof clientInvitations.$inferSelect;

export const CLIENT_NOT_FOUND_ERROR = "Client not found";
export const CLIENT_EMAIL_REQUIRED_ERROR =
	"Client must have an email address to receive an invitation";
export const CLIENT_ALREADY_HAS_PORTAL_ACCESS_ERROR =
	"Client already has portal access";
export const ACTIVE_INVITATION_EXISTS_ERROR =
	"An active invitation already exists for this client";

interface CreateClientInvitationParams {
	clientId: string;
	currentTeam: CurrentTeam;
	currentUser: {
		dbId: number;
		id: UserId;
	};
}

export async function createClientInvitation({
	clientId,
	currentTeam,
	currentUser,
}: CreateClientInvitationParams): Promise<ClientInvitation> {
	const token = crypto.randomUUID();
	const expiredAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // 7 days

	return db.transaction(async (tx) => {
		// Fetch the client
		const client = await tx
			.select()
			.from(clients)
			.where(
				and(eq(clients.id, clientId), eq(clients.teamDbId, currentTeam.dbId)),
			)
			.limit(1);

		if (client.length === 0) {
			throw new Error(CLIENT_NOT_FOUND_ERROR);
		}

		const clientRecord = client[0];

		if (!clientRecord.email) {
			throw new Error(CLIENT_EMAIL_REQUIRED_ERROR);
		}

		if (clientRecord.supabaseUserId) {
			throw new Error(CLIENT_ALREADY_HAS_PORTAL_ACCESS_ERROR);
		}

		const normalizedEmail = clientRecord.email.trim().toLowerCase();

		// Acquire advisory lock for this client
		await tx.execute(
			sql`SELECT pg_advisory_xact_lock(${currentTeam.dbId}, hashtext(${normalizedEmail}))`,
		);

		// Check for existing active invitation
		const existingActiveInvitation = await tx
			.select()
			.from(clientInvitations)
			.where(
				and(
					eq(clientInvitations.clientDbId, clientRecord.dbId),
					isNull(clientInvitations.revokedAt),
					isNull(clientInvitations.acceptedAt),
					gt(clientInvitations.expiredAt, new Date()),
				),
			)
			.limit(1);

		if (existingActiveInvitation.length > 0) {
			throw new Error(ACTIVE_INVITATION_EXISTS_ERROR);
		}

		// Insert the invitation
		const result = await tx
			.insert(clientInvitations)
			.values({
				token,
				clientDbId: clientRecord.dbId,
				teamDbId: currentTeam.dbId,
				email: normalizedEmail,
				inviterUserDbId: currentUser.dbId,
				expiredAt,
			})
			.returning();

		return result[0];
	});
}

export async function sendClientInvitationEmail(
	invitation: ClientInvitation,
): Promise<void> {
	// Fetch inviter info
	const inviterResult = await db
		.select({ email: users.email })
		.from(users)
		.where(eq(users.dbId, invitation.inviterUserDbId))
		.limit(1);

	const inviter = inviterResult[0];
	if (!inviter || !inviter.email) {
		throw new Error("Inviter not found");
	}

	// Fetch team info
	const teamResult = await db
		.select({ name: teams.name })
		.from(teams)
		.where(eq(teams.dbId, invitation.teamDbId))
		.limit(1);

	if (teamResult.length === 0) {
		throw new Error("Team not found");
	}
	const teamName = teamResult[0].name;

	// Fetch client info
	const clientResult = await db
		.select({ name: clients.name })
		.from(clients)
		.where(eq(clients.dbId, invitation.clientDbId))
		.limit(1);

	if (clientResult.length === 0) {
		throw new Error("Client not found");
	}
	const clientName = clientResult[0].name;

	const portalUrl = buildClientPortalJoinLink(invitation.token);

	const emailHtml = await render(
		<ClientPortalInvitationEmail
			clientName={clientName}
			agencyName={teamName}
			inviterEmail={inviter.email}
			portalUrl={portalUrl}
		/>,
	);
	const emailText = toPlainText(emailHtml);

	await sendEmail(
		`${teamName} has invited you to your client portal`,
		emailText,
		[
			{
				userDisplayName: clientName,
				userEmail: invitation.email,
			},
		],
		{ html: emailHtml },
	);
}

function buildClientPortalJoinLink(token: string): string {
	const explicitBaseUrl = process.env.NEXT_PUBLIC_SITE_URL;
	if (explicitBaseUrl) {
		return new URL(`/client-portal/join/${token}`, explicitBaseUrl).toString();
	}

	const vercelUrl = process.env.VERCEL_URL;
	if (vercelUrl) {
		const normalizedBaseUrl = `https://${vercelUrl}`;
		return new URL(
			`/client-portal/join/${token}`,
			normalizedBaseUrl,
		).toString();
	}

	throw new Error(
		"Missing NEXT_PUBLIC_SITE_URL or VERCEL_URL environment variables for invitation links",
	);
}

export async function fetchClientInvitation(token: string): Promise<{
	token: string;
	clientDbId: number;
	clientName: string;
	clientEmail: string;
	teamDbId: number;
	teamName: string;
	expiredAt: Date;
	acceptedAt: Date | null;
	revokedAt: Date | null;
} | null> {
	const result = await db
		.select({
			token: clientInvitations.token,
			clientDbId: clientInvitations.clientDbId,
			clientName: clients.name,
			clientEmail: clients.email,
			teamDbId: clientInvitations.teamDbId,
			teamName: teams.name,
			expiredAt: clientInvitations.expiredAt,
			acceptedAt: clientInvitations.acceptedAt,
			revokedAt: clientInvitations.revokedAt,
		})
		.from(clientInvitations)
		.innerJoin(clients, eq(clientInvitations.clientDbId, clients.dbId))
		.innerJoin(teams, eq(clientInvitations.teamDbId, teams.dbId))
		.where(eq(clientInvitations.token, token))
		.limit(1);

	if (result.length === 0) {
		return null;
	}

	return result[0];
}

export async function acceptClientInvitation(
	token: string,
	supabaseUserId: string,
	supabaseUserEmail: string,
): Promise<void> {
	await db.transaction(async (tx) => {
		// Fetch and lock the invitation
		const invitationResult = await tx
			.select()
			.from(clientInvitations)
			.where(
				and(
					eq(clientInvitations.token, token),
					isNull(clientInvitations.revokedAt),
					isNull(clientInvitations.acceptedAt),
				),
			)
			.for("update")
			.limit(1);

		if (invitationResult.length === 0) {
			throw new Error("Invitation not found or already used");
		}

		const invitation = invitationResult[0];

		if (invitation.expiredAt < new Date()) {
			throw new Error("Invitation has expired");
		}

		if (invitation.email.toLowerCase() !== supabaseUserEmail.toLowerCase()) {
			throw new Error("Invitation email does not match account email");
		}

		// Update the client with supabaseUserId
		await tx
			.update(clients)
			.set({
				supabaseUserId,
				status: "active",
			})
			.where(eq(clients.dbId, invitation.clientDbId));

		// Mark invitation as accepted
		await tx
			.update(clientInvitations)
			.set({ acceptedAt: new Date() })
			.where(eq(clientInvitations.token, token));
	});
}

export async function revokeClientInvitation(token: string): Promise<void> {
	await db
		.update(clientInvitations)
		.set({ revokedAt: new Date() })
		.where(eq(clientInvitations.token, token));
}

export async function listClientInvitations(
	clientDbId: number,
): Promise<ClientInvitation[]> {
	return db
		.select()
		.from(clientInvitations)
		.where(
			and(
				eq(clientInvitations.clientDbId, clientDbId),
				isNull(clientInvitations.revokedAt),
			),
		);
}
