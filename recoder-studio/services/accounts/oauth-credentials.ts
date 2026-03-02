import { and, eq } from "drizzle-orm";
import { db, oauthCredentials } from "@/db";
import { getCurrentUser } from "@/lib/get-current-user";
import { decryptToken } from "@/lib/token-encryption";

export type OAuthProvider = "github" | "google";

export async function getOauthCredential(provider: OAuthProvider) {
	const user = await getCurrentUser();
	const [result] = await db
		.select({ oauthCredentials: oauthCredentials })
		.from(oauthCredentials)
		.where(
			and(
				eq(oauthCredentials.userId, user.dbId),
				eq(oauthCredentials.provider, provider),
			),
		);

	if (!result) {
		return undefined;
	}

	const cred = result.oauthCredentials;
	return {
		...cred,
		accessToken: decryptToken(cred.accessToken),
		refreshToken: cred.refreshToken ? decryptToken(cred.refreshToken) : null,
	};
}
