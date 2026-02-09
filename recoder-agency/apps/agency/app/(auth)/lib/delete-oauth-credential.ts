import { and, eq } from "drizzle-orm";
import { db, oauthCredentials } from "@/db";
import { getCurrentUser } from "@/lib/get-current-user";

export async function deleteOauthCredential(provider: string) {
	const user = await getCurrentUser();

	await db
		.delete(oauthCredentials)
		.where(
			and(
				eq(oauthCredentials.userId, user.dbId),
				eq(oauthCredentials.provider, provider),
			),
		);
}
