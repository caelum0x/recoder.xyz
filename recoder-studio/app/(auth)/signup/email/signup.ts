"use server";

import { redirect } from "next/navigation";
import { forwardSetCookiesFromResponse } from "@/lib/auth/forward-set-cookies";
import type { AuthError } from "../../login/login";

export async function signup(
	email: string,
	password: string,
): Promise<AuthError | null> {
	const baseUrl = process.env.BETTER_AUTH_URL ?? "https://recoder.xyz";
	const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email, password, name: email }),
		cache: "no-store",
	});
	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}));
		return {
			code: "signup_failed",
			message:
				errorData.message ??
				"An error occurred during signup. Please try again.",
			name: "AuthError",
			status: response.status,
		};
	}
	await forwardSetCookiesFromResponse(response);

	redirect("/signup/verify-email");
	return null;
}
