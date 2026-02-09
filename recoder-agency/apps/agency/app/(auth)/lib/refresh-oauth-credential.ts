import { and, eq } from "drizzle-orm";
import { db, oauthCredentials } from "@/db";
import { getCurrentUser } from "@/lib/get-current-user";
import { encryptToken } from "@/lib/token-encryption";

export async function refreshOauthCredential(
	provider: string,
	accessToken: string,
	refreshToken: string,
	expiresAt: Date,
	scope: string,
	tokenType: string,
) {
	const user = await getCurrentUser();

	await db
		.update(oauthCredentials)
		.set({
			accessToken: encryptToken(accessToken),
			expiresAt,
			refreshToken: encryptToken(refreshToken),
			updatedAt: new Date(),
			scope,
			tokenType,
		})
		.where(
			and(
				eq(oauthCredentials.userId, user.dbId),
				eq(oauthCredentials.provider, provider),
			),
		);
}
