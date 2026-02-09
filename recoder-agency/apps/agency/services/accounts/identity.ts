import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { deleteOauthCredential, getAuthCallbackUrl } from "@/app/(auth)/lib";
import { authAccounts, db } from "@/db";
import { getCurrentUser } from "@/lib/get-current-user";
import type { OAuthProvider } from "./oauth-credentials";

export async function connectIdentity(provider: OAuthProvider, next: string) {
	const user = await getCurrentUser();

	// Check if the user already has this provider linked
	const existing = await db
		.select({ id: authAccounts.id })
		.from(authAccounts)
		.where(
			and(
				eq(authAccounts.userId, user.id),
				eq(authAccounts.providerId, provider),
			),
		)
		.limit(1);

	if (existing.length > 0) {
		throw new Error(`Already linked to ${provider}`);
	}

	// Redirect to Better Auth social sign-in which handles OAuth flow
	const callbackUrl = getAuthCallbackUrl({ next, provider });
	const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
	const signInUrl = `${baseUrl}/api/auth/sign-in/social?provider=${provider}&callbackURL=${encodeURIComponent(callbackUrl)}`;
	redirect(signInUrl);
}

export async function reconnectIdentity(provider: OAuthProvider, next: string) {
	const callbackUrl = getAuthCallbackUrl({ next, provider });
	const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
	const signInUrl = `${baseUrl}/api/auth/sign-in/social?provider=${provider}&callbackURL=${encodeURIComponent(callbackUrl)}`;
	redirect(signInUrl);
}

export async function disconnectIdentity(
	provider: OAuthProvider,
	next: string,
) {
	const user = await getCurrentUser();

	// Count how many auth accounts the user has
	const accounts = await db
		.select({ id: authAccounts.id })
		.from(authAccounts)
		.where(eq(authAccounts.userId, user.id));

	if (accounts.length <= 1) {
		throw new Error("Cannot unlink last identity");
	}

	// Delete the auth account for this provider
	await db
		.delete(authAccounts)
		.where(
			and(
				eq(authAccounts.userId, user.id),
				eq(authAccounts.providerId, provider),
			),
		);

	await deleteOauthCredential(provider);
	redirect(next);
}
