import { cache } from "react";
import { eq } from "drizzle-orm";
import { db, oauthCredentials, users } from "@/db";
import { getSessionUser } from "@/lib/auth/server";

export interface CompatUser {
	id: string;
	email: string | undefined;
	user_metadata: {
		avatar_url: string | null | undefined;
		name: string | null | undefined;
	};
	app_metadata: {
		provider: string;
		providers: (string | null)[];
	};
	identities: { id: string | null; provider: string | null }[];
}

const resolveUser = async (): Promise<CompatUser> => {
	const sessionUser = await getSessionUser();
	const [userRow] = await db
		.select({ dbId: users.dbId })
		.from(users)
		.where(eq(users.id, sessionUser.id))
		.limit(1);

	if (!userRow) {
		throw new Error("User not found");
	}

	const creds = await db
		.select({
			provider: oauthCredentials.provider,
			providerAccountId: oauthCredentials.providerAccountId,
		})
		.from(oauthCredentials)
		.where(eq(oauthCredentials.userId, userRow.dbId));

	const identities = creds.map((cred) => ({
		id: cred.providerAccountId,
		provider: cred.provider,
	}));

	return {
		id: sessionUser.id,
		email: sessionUser.email ?? undefined,
		user_metadata: {
			avatar_url: sessionUser.avatarUrl,
			name: sessionUser.displayName,
		},
		app_metadata: {
			provider: identities[0]?.provider ?? "email",
			providers: identities.map((identity) => identity.provider),
		},
		identities,
	};
};

export const getUser = cache(resolveUser);
