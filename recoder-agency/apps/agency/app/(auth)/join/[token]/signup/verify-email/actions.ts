"use server";

import { captureException } from "@sentry/nextjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { authVerifications, db } from "@/db";
import { initializeAccount } from "@/services/accounts";
import { JoinError } from "../../errors";
import { acceptInvitation } from "../../invitation";

export async function verifyJoinEmail(formData: FormData) {
	const invitedEmailEntry = formData.get("invitedEmail");
	const otpTokenEntry = formData.get("token");
	const invitationTokenEntry = formData.get("invitationToken");
	if (
		typeof invitedEmailEntry !== "string" ||
		typeof otpTokenEntry !== "string" ||
		typeof invitationTokenEntry !== "string"
	) {
		return {
			error: "Invalid verification payload. Please try again.",
		};
	}
	const invitedEmail = invitedEmailEntry;
	const otpToken = otpTokenEntry;
	const invitationToken = invitationTokenEntry;

	// Verify the OTP token against auth_verifications
	const [verification] = await db
		.select()
		.from(authVerifications)
		.where(eq(authVerifications.identifier, invitedEmail))
		.limit(1);

	if (!verification || verification.value !== otpToken) {
		return { error: "Invalid verification code. Please try again." };
	}

	if (verification.expiresAt < new Date()) {
		return {
			error: "Verification code has expired. Please request a new one.",
		};
	}

	// Clean up the verification record
	await db
		.delete(authVerifications)
		.where(eq(authVerifications.id, verification.id));

	// Initialize account
	await initializeAccount(invitedEmail);

	// After successful email verification, automatically join the team
	try {
		await acceptInvitation(invitationToken);
	} catch (err: unknown) {
		if (err instanceof JoinError) {
			redirect(`/join/${encodeURIComponent(invitationToken)}`);
		}
		captureException(err);
		redirect(`/join/${encodeURIComponent(invitationToken)}`);
	}
	redirect("/join/success");
}

export async function resendJoinOtp(formData: FormData) {
	const invitedEmailEntry = formData.get("invitedEmail");
	if (typeof invitedEmailEntry !== "string") {
		return {
			code: "invalid_email",
			message: "Invalid email address.",
			status: 400,
			name: "AuthValidationError",
		};
	}

	const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
	const response = await fetch(`${baseUrl}/api/auth/magic-link/send`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email: invitedEmailEntry }),
	});

	if (!response.ok) {
		return {
			code: "resend_failed",
			message: "Failed to resend verification code. Please try again.",
			status: response.status,
			name: "AuthError",
		};
	}

	return {
		code: "success",
		status: 200,
		message: "A new confirmation code has been sent to your email address.",
		name: "Success",
	};
}
