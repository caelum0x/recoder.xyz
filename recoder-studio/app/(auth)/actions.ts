"use server";

import { redirect } from "next/navigation";
import { getAuthCallbackUrl, isValidReturnUrl } from "@/app/(auth)/lib";
import { logger } from "@/lib/logger";
import type { OAuthProvider } from "@/services/accounts";

async function authorizeOAuth(provider: OAuthProvider, formData?: FormData) {
	const returnUrlEntry = formData?.get("returnUrl");
	// Validate returnUrl to prevent open redirect attacks
	const validReturnUrl = isValidReturnUrl(returnUrlEntry)
		? returnUrlEntry
		: "/";

	const callbackUrl = getAuthCallbackUrl({ provider, next: validReturnUrl });
	const baseUrl = process.env.BETTER_AUTH_URL ?? "https://recoder.xyz";
	const signInUrl = `${baseUrl}/api/auth/sign-in/social?provider=${provider}&callbackURL=${encodeURIComponent(callbackUrl)}`;
	logger.debug(`authorized with ${provider}`);
	redirect(signInUrl);
}

export async function authorizeGitHub(formData: FormData) {
	return await authorizeOAuth("github", formData);
}

export async function authorizeGoogle(formData: FormData) {
	return await authorizeOAuth("google", formData);
}
