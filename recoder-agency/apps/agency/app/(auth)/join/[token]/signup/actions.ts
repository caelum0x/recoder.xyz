"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/better-auth";

export async function signupJoin(formData: FormData) {
	const token = formData.get("token") as string;
	const email = formData.get("email") as string;
	const password = formData.get("password") as string;

	const response = await auth.api.signUpEmail({
		body: { email, password, name: email },
	});

	if (!response) {
		return { error: "Failed to create account" };
	}

	// redirect to the local verify email page with the invitation token
	redirect(`/join/${encodeURIComponent(token)}/signup/verify-email`);
}
