"use server";

import { captureException } from "@sentry/nextjs";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authSessions, db } from "@/db";
import { acceptClientInvitation } from "@/lib/agency/client-invitation";
import { getSessionUser } from "@/lib/auth/server";

export async function acceptPortalInvitation(formData: FormData) {
	const rawToken = formData.get("token");
	const token = typeof rawToken === "string" ? rawToken : "";

	if (!token.trim()) {
		redirect("/client-portal/join/error");
	}

	try {
		const user = await getSessionUser();
		await acceptClientInvitation(token, user.id);
	} catch (err: unknown) {
		captureException(err);
		redirect(`/client-portal/join/${encodeURIComponent(token)}`);
	}

	redirect("/portal");
}

export async function signoutAndRetry(formData: FormData) {
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
	redirect(
		`/login?returnUrl=${encodeURIComponent(`/client-portal/join/${token}`)}`,
	);
}
