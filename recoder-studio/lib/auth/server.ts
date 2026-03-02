import "server-only";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { verifySession } from "@recoder/auth/verify";
import { db, authUserMappings, users } from "@/db";

type SessionUser = {
	id: typeof users.$inferSelect.id;
	dbId: typeof users.$inferSelect.dbId;
	displayName: typeof users.$inferSelect.displayName;
	email: typeof users.$inferSelect.email;
	avatarUrl: typeof users.$inferSelect.avatarUrl;
};

async function ensureProfile(core: {
	id: string;
	name: string | null | undefined;
	email: string;
	image: string | null | undefined;
}) {
	const userId = core.id as typeof users.$inferSelect.id;
	const [existing] = await db
		.select({
			id: users.id,
			dbId: users.dbId,
			displayName: users.displayName,
			email: users.email,
			avatarUrl: users.avatarUrl,
		})
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);

	if (existing) {
		await db
			.insert(authUserMappings)
			.values({
				userDbId: existing.dbId,
				authUserId: core.id,
			})
			.onConflictDoNothing();

		if (
			existing.email !== core.email ||
			existing.displayName !== (core.name ?? null) ||
			existing.avatarUrl !== (core.image ?? null)
		) {
			const [updated] = await db
				.update(users)
				.set({
					email: core.email,
					displayName: core.name ?? null,
					avatarUrl: core.image ?? null,
				})
					.where(eq(users.id, userId))
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
				id: userId,
				email: core.email,
				displayName: core.name ?? null,
				avatarUrl: core.image ?? null,
		})
		.returning({
			id: users.id,
			dbId: users.dbId,
			displayName: users.displayName,
			email: users.email,
			avatarUrl: users.avatarUrl,
		});

	if (created) {
		await db
			.insert(authUserMappings)
			.values({
				userDbId: created.dbId,
				authUserId: core.id,
			})
			.onConflictDoNothing();
	}

	return created ?? null;
}

export async function getSessionUserOrNull(): Promise<SessionUser | null> {
	const cookieStore = await cookies();
	const session = await verifySession(
		(name) => cookieStore.get(name)?.value ?? null,
	);
	if (!session) {
		return null;
	}

	const profile = await ensureProfile({
		id: session.user.id,
		name: session.user.name,
		email: session.user.email,
		image: session.user.image,
	});

	if (!profile) {
		return null;
	}

	return {
		id: profile.id,
		dbId: profile.dbId,
		displayName: profile.displayName,
		email: profile.email,
		avatarUrl: profile.avatarUrl,
	};
}

async function _getSessionUser(): Promise<SessionUser> {
	const user = await getSessionUserOrNull();
	if (!user) {
		throw new Error("Not authenticated");
	}
	return user;
}

export const getSessionUser = cache(_getSessionUser);
