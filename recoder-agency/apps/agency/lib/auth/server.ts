import "server-only";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { authSessions, db, users } from "@/db";

type SessionUser = {
	id: typeof users.$inferSelect.id;
	dbId: typeof users.$inferSelect.dbId;
	displayName: typeof users.$inferSelect.displayName;
	email: typeof users.$inferSelect.email;
	avatarUrl: typeof users.$inferSelect.avatarUrl;
};

async function _getSessionUser(): Promise<SessionUser> {
	const user = await getSessionUserOrNull();
	if (!user) {
		throw new Error("Not authenticated");
	}
	return user;
}

export const getSessionUser = cache(_getSessionUser);

export async function getSessionUserOrNull(): Promise<SessionUser | null> {
	const cookieStore = await cookies();
	const sessionToken =
		cookieStore.get("better-auth.session_token")?.value ??
		cookieStore.get("__Secure-better-auth.session_token")?.value;

	if (!sessionToken) {
		return null;
	}

	const [result] = await db
		.select({
			id: users.id,
			dbId: users.dbId,
			displayName: users.displayName,
			email: users.email,
			avatarUrl: users.avatarUrl,
		})
		.from(authSessions)
		.innerJoin(users, eq(authSessions.userId, users.id))
		.where(eq(authSessions.token, sessionToken))
		.limit(1);

	if (!result) {
		return null;
	}

	return result;
}
