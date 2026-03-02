"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authDb } from "@/db/auth-db";
import { authSessions } from "@/db/auth-schema";
import {
	extractSessionToken,
	parseSessionToken,
} from "@recoder/auth/edge";
import { getSignOutCookieAttributes } from "@recoder/auth/cross-domain";

export const signOut = async () => {
	const cookieStore = await cookies();
	const rawToken = extractSessionToken(
		(name) => cookieStore.get(name)?.value ?? null,
	);
	const sessionToken = rawToken ? parseSessionToken(rawToken) : null;

	if (sessionToken) {
		await authDb
			.delete(authSessions)
			.where(eq(authSessions.token, sessionToken));
	}

	for (const attrs of getSignOutCookieAttributes()) {
		cookieStore.set(attrs.name, attrs.value, {
			path: attrs.path,
			maxAge: attrs.maxAge,
			...(attrs.domain ? { domain: attrs.domain } : {}),
		});
	}

	redirect("/login");
};
