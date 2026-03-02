import { and, eq } from "drizzle-orm";
import { db, oauthCredentials, authUserMappings } from "@/db";
import { getUser } from "@/lib/auth/user";

export async function deleteOauthCredential(provider: string) {
	const supabaseUser = await getUser();
	const [res] = await db
		.select({ userDbId: authUserMappings.userDbId })
		.from(authUserMappings)
		.where(eq(authUserMappings.authUserId, supabaseUser.id));

	await db
		.delete(oauthCredentials)
		.where(
			and(
				eq(oauthCredentials.userId, res.userDbId),
				eq(oauthCredentials.provider, provider),
			),
		);
}
