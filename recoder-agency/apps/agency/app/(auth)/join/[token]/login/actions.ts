"use server";

import { captureException } from "@sentry/nextjs";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/better-auth";
import { JoinError } from "../errors";
import { acceptInvitation } from "../invitation";

export async function loginUser(formData: FormData) {
	const email = formData.get("email") as string;
	const password = formData.get("password") as string;
	const token = formData.get("token") as string;

	const response = await auth.api.signInEmail({
		body: { email, password },
	});

	if (!response) {
		return { error: "Invalid email or password" };
	}

	// After successful login, automatically join the team
	try {
		await acceptInvitation(token);
	} catch (err: unknown) {
		if (err instanceof JoinError) {
			redirect(`/join/${encodeURIComponent(token)}`);
		}
		captureException(err);
		redirect(`/join/${encodeURIComponent(token)}`);
	}
	redirect("/join/success");
}
