"use server";

import { redirect } from "next/navigation";
import { isValidReturnUrl } from "@/app/(auth)/lib";

export type AuthError = {
	code?: string;
	message: string;
	name: string;
	status?: number;
};

export async function login(
	_prevState: AuthError | null,
	formData: FormData,
): Promise<AuthError | null> {
	const emailEntry = formData.get("email");
	const passwordEntry = formData.get("password");
	if (typeof emailEntry !== "string" || typeof passwordEntry !== "string") {
		return {
			code: "invalid_credentials_payload",
			message: "Please enter both email and password.",
			name: "AuthValidationError",
			status: 400,
		};
	}

	// Better Auth handles password auth via its API.
	// Sign in via the Better Auth sign-in endpoint.
	const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
	const response = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			email: emailEntry,
			password: passwordEntry,
		}),
	});

	if (!response.ok) {
		return {
			code: "invalid_credentials",
			message: "Invalid email or password.",
			name: "AuthError",
			status: response.status,
		};
	}

	const returnUrlEntry = formData.get("returnUrl");
	const fallbackUrl = "/playground";
	const validReturnUrl = isValidReturnUrl(returnUrlEntry)
		? returnUrlEntry
		: fallbackUrl;
	redirect(validReturnUrl);
	return null;
}
