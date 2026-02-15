import type { polarSubscriptionHistories, TeamRole, teams } from "@/db";

export type TeamId = `tm_${string}`;
export function isTeamId(id: string): id is TeamId {
	return id.startsWith("tm_");
}

export type CurrentTeam = {
	id: TeamId;
	dbId: typeof teams.$inferSelect.dbId;
	name: typeof teams.$inferSelect.name;
	avatarUrl?: typeof teams.$inferSelect.avatarUrl;
	role?: TeamRole;
	plan: typeof teams.$inferSelect.plan;
	activeSubscriptionId:
		| typeof polarSubscriptionHistories.$inferInsert.subscriptionId
		| null;
	activeCustomerId: typeof teams.$inferSelect.activeCustomerId;
};

export type TeamWithSubscription = CurrentTeam;
