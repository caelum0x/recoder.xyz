"use server";

import type { AuthError } from "../../login/login";

export const verifyEmail = async (
	_prevState: null | AuthError,
	formData: FormData,
): Promise<AuthError | null> => {
	const verificationEmailEntry = formData.get("verificationEmail");
	const tokenEntry = formData.get("token");
	if (
		typeof verificationEmailEntry !== "string" ||
		typeof tokenEntry !== "string"
	) {
		return {
			code: "invalid_verification_payload",
			message: "Invalid verification payload. Please request a new email.",
			name: "AuthValidationError",
			status: 400,
		};
	}

	return {
		code: "verification_link_required",
		message:
			"Email verification now uses the link sent to your inbox. Open that link to continue.",
		name: "AuthVerificationError",
		status: 400,
	};
};

export const resendOtp = async (
	_prevState: null | AuthError,
	formData: FormData,
): Promise<AuthError | null> => {
	const verificationEmailEntry = formData.get("verificationEmail");
	if (typeof verificationEmailEntry !== "string") {
		return {
			code: "invalid_email",
			message: "Please enter a valid email address.",
			name: "AuthValidationError",
			status: 422,
		};
	}

	const baseUrl = process.env.BETTER_AUTH_URL ?? "https://recoder.xyz";
	const response = await fetch(`${baseUrl}/api/auth/magic-link/send`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email: verificationEmailEntry }),
	});

	if (!response.ok) {
		return {
			code: "resend_failed",
			message: "Failed to resend verification email. Please try again.",
			name: "AuthError",
			status: response.status,
		};
	}

	return {
		code: "success",
		status: 200,
		message: "A new verification email has been sent.",
		name: "Success",
	};
};
