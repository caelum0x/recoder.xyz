"use server";

import { captureException } from "@sentry/nextjs";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revokeInvitation } from "@/app/(main)/settings/team/invitation";
import { authSessions, db } from "@/db";
import { JoinError } from "./errors";
import { acceptInvitation } from "./invitation";

export async function signoutUser(formData: FormData) {
	const token = formData.get("token") as string;
	const cookieStore = await cookies();
	const sessionToken =
		cookieStore.get("better-auth.session_token")?.value ??
		cookieStore.get("__Secure-better-auth.session_token")?.value;
	if (sessionToken) {
		await db.delete(authSessions).where(eq(authSessions.token, sessionToken));
	}
	cookieStore.delete("better-auth.session_token");
	cookieStore.delete("__Secure-better-auth.session_token");
	redirect(`/join/${encodeURIComponent(token)}/login`);
}

export async function joinTeam(formData: FormData) {
	const rawToken = formData.get("token");
	const token = typeof rawToken === "string" ? rawToken : "";
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

export async function declineInvitation(formData: FormData) {
	const rawToken = formData.get("token");
	const token = typeof rawToken === "string" ? rawToken : "";
	await revokeInvitation(token);
	const serviceUrl = process.env.NEXT_PUBLIC_SERVICE_SITE_URL;
	if (!serviceUrl) {
		throw new Error("NEXT_PUBLIC_SERVICE_SITE_URL is not set");
	}
	redirect(serviceUrl);
}
