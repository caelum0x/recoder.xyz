"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { authVerifications, db, users } from "@/db";

export type AuthError = {
	code?: string;
	message: string;
	name: string;
	status?: number;
};

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
			message: "Invalid verification payload. Please request a new code.",
			name: "AuthValidationError",
			status: 400,
		};
	}

	// Verify the token against authVerifications table
	const [verification] = await db
		.select()
		.from(authVerifications)
		.where(eq(authVerifications.identifier, verificationEmailEntry))
		.limit(1);

	if (!verification || verification.value !== tokenEntry) {
		return {
			code: "invalid_token",
			message:
				"The confirmation code you've entered has expired or is invalid.",
			name: "AuthVerificationError",
			status: 400,
		};
	}

	if (verification.expiresAt < new Date()) {
		return {
			code: "token_expired",
			message:
				"The confirmation code you've entered has expired or is invalid.",
			name: "AuthVerificationError",
			status: 400,
		};
	}

	// Mark user as email verified
	await db
		.update(users)
		.set({ emailVerified: true })
		.where(eq(users.email, verificationEmailEntry));

	// Clean up the verification record
	await db
		.delete(authVerifications)
		.where(eq(authVerifications.id, verification.id));

	redirect("/");
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

	// Use Better Auth's magic link to resend verification
	const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
	const response = await fetch(`${baseUrl}/api/auth/magic-link/send`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email: verificationEmailEntry }),
	});

	if (!response.ok) {
		return {
			code: "resend_failed",
			message: "Failed to resend verification code. Please try again.",
			name: "AuthError",
			status: response.status,
		};
	}

	return {
		code: "success",
		status: 200,
		message: "A new confirmation code has been sent to your email address.",
		name: "Success",
	};
};
