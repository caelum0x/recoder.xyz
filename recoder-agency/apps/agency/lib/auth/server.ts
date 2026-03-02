import "server-only";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { verifySession } from "@recoder/auth/verify";
import { db, type UserId, users } from "@/db";

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
	const session = await verifySession(
		(name) => cookieStore.get(name)?.value ?? null,
	);

	if (!session) {
		return null;
	}

	const userId = session.user.id as UserId;
	const profile = await ensureProfile({
		id: userId,
		name: session.user.name,
		email: session.user.email,
		image: session.user.image,
	});
	return {
		id: userId,
		dbId: profile?.dbId ?? 0,
		displayName: profile?.displayName ?? session.user.name,
		email: session.user.email,
		avatarUrl: profile?.avatarUrl ?? session.user.image,
	};
}

const ensureProfile = async (core: {
	id: UserId;
	name: string;
	email: string;
	image: string | null;
}) => {
	const [existing] = await db
		.select({
			id: users.id,
			dbId: users.dbId,
			displayName: users.displayName,
			email: users.email,
			avatarUrl: users.avatarUrl,
		})
		.from(users)
		.where(eq(users.id, core.id))
		.limit(1);

	if (existing) {
		if (
			existing.email !== core.email ||
			existing.displayName !== core.name ||
			existing.avatarUrl !== core.image
		) {
			const [updated] = await db
				.update(users)
				.set({
					email: core.email,
					displayName: core.name,
					avatarUrl: core.image,
				})
				.where(eq(users.id, core.id))
				.returning({
					id: users.id,
					dbId: users.dbId,
					displayName: users.displayName,
					email: users.email,
					avatarUrl: users.avatarUrl,
				});

			return updated ?? existing;
		}

		return existing;
	}

	const [created] = await db
		.insert(users)
		.values({
			id: core.id,
			email: core.email,
			displayName: core.name,
			avatarUrl: core.image,
		})
		.returning({
			id: users.id,
			dbId: users.dbId,
			displayName: users.displayName,
			email: users.email,
			avatarUrl: users.avatarUrl,
		});

	return created ?? null;
};
