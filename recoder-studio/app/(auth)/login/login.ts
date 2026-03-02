"use server";

import { redirect } from "next/navigation";
import { isValidReturnUrl } from "@/app/(auth)/lib";
import { forwardSetCookiesFromResponse } from "@/lib/auth/forward-set-cookies";

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
	const returnUrlEntry = formData.get("returnUrl");
	const baseUrl = process.env.BETTER_AUTH_URL ?? "https://recoder.xyz";
	const response = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			email: emailEntry,
			password: passwordEntry,
		}),
		cache: "no-store",
	});
	if (!response.ok) {
		return {
			code: "invalid_credentials",
			message: "Invalid email or password.",
			name: "AuthError",
			status: response.status,
		};
	}
	await forwardSetCookiesFromResponse(response);

	const fallbackUrl = "/workflow-ops";

	// Validate returnUrl to prevent open redirect attacks
	const validReturnUrl = isValidReturnUrl(returnUrlEntry)
		? returnUrlEntry
		: fallbackUrl;
	redirect(validReturnUrl);
	return null;
}
