import { eq } from "drizzle-orm";
import { cache } from "react";
import { clients, db, teamMemberships } from "@/db";

async function _getClientForUser(userDbId: number) {
	const result = await db
		.select({
			dbId: clients.dbId,
			id: clients.id,
			teamDbId: clients.teamDbId,
			name: clients.name,
			email: clients.email,
			company: clients.company,
			phone: clients.phone,
			notes: clients.notes,
			status: clients.status,
			supabaseUserId: clients.supabaseUserId,
			polarCustomerId: clients.polarCustomerId,
			createdAt: clients.createdAt,
			updatedAt: clients.updatedAt,
		})
		.from(clients)
		.innerJoin(teamMemberships, eq(clients.teamDbId, teamMemberships.teamDbId))
		.where(eq(teamMemberships.userDbId, userDbId))
		.limit(1);
	return result[0] ?? null;
}

export const getClientForUser = cache(_getClientForUser);
