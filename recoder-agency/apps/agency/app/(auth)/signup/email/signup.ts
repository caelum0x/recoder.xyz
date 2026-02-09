"use server";

import { redirect } from "next/navigation";

export type AuthError = {
	code?: string;
	message: string;
	name: string;
	status?: number;
};

export async function signup(
	email: string,
	password: string,
): Promise<AuthError | null> {
	// Better Auth handles signup via its API
	const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
	const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email, password, name: email }),
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

	redirect("/signup/verify-email");
	return null;
}
