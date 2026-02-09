"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authSessions, db } from "@/db";

export const signOut = async () => {
	const cookieStore = await cookies();
	const sessionToken =
		cookieStore.get("better-auth.session_token")?.value ??
		cookieStore.get("__Secure-better-auth.session_token")?.value;

	if (sessionToken) {
		await db.delete(authSessions).where(eq(authSessions.token, sessionToken));
	}

	cookieStore.delete("better-auth.session_token");
	cookieStore.delete("__Secure-better-auth.session_token");

	redirect("/login");
};
