import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { deleteOauthCredential, getAuthCallbackUrl } from "@/app/(auth)/lib";
import { db, oauthCredentials } from "@/db";
import { getCurrentUser } from "@/lib/get-current-user";
import type { OAuthProvider } from "./oauth-credentials";

export async function connectIdentity(provider: OAuthProvider, next: string) {
	const user = await getCurrentUser();

	const existing = await db
		.select({ id: oauthCredentials.id })
		.from(oauthCredentials)
		.where(
			and(
				eq(oauthCredentials.userId, user.dbId),
				eq(oauthCredentials.provider, provider),
			),
		)
		.limit(1);

	if (existing.length > 0) {
		throw new Error(`Already linked to ${provider}`);
	}

	const callbackUrl = getAuthCallbackUrl({ next, provider });
	const baseUrl = process.env.BETTER_AUTH_URL ?? "https://recoder.xyz";
	const signInUrl = `${baseUrl}/api/auth/sign-in/social?provider=${provider}&callbackURL=${encodeURIComponent(callbackUrl)}`;
	redirect(signInUrl);
}

export async function reconnectIdentity(provider: OAuthProvider, next: string) {
	const callbackUrl = getAuthCallbackUrl({ next, provider });
	const baseUrl = process.env.BETTER_AUTH_URL ?? "https://recoder.xyz";
	const signInUrl = `${baseUrl}/api/auth/sign-in/social?provider=${provider}&callbackURL=${encodeURIComponent(callbackUrl)}`;
	redirect(signInUrl);
}

export async function disconnectIdentity(
	provider: OAuthProvider,
	next: string,
) {
	const user = await getCurrentUser();

	const accounts = await db
		.select({ id: oauthCredentials.id })
		.from(oauthCredentials)
		.where(eq(oauthCredentials.userId, user.dbId));

	if (accounts.length <= 1) {
		throw new Error("Cannot unlink last identity");
	}

	await db
		.delete(oauthCredentials)
		.where(
			and(
				eq(oauthCredentials.userId, user.dbId),
				eq(oauthCredentials.provider, provider),
			),
		);

	await deleteOauthCredential(provider);
	redirect(next);
}
