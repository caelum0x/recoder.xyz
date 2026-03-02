"use server";

import { SESSION_COOKIE_NAMES, parseSessionToken } from "@recoder/auth/session";
import { authDatabase } from "@recoder/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const signOut = async () => {
	const cookieStore = await cookies();
	const isProd = process.env.NODE_ENV === "production";
	const domain = isProd ? ".recoder.xyz" : undefined;

	// Invalidate the session in the database
	const rawToken =
		cookieStore.get(SESSION_COOKIE_NAMES[0])?.value ??
		cookieStore.get(SESSION_COOKIE_NAMES[1])?.value;
	const sessionToken = rawToken ? parseSessionToken(rawToken) : null;

	if (sessionToken) {
		try {
			await authDatabase.session.deleteMany({
				where: { token: sessionToken },
			});
		} catch {
			// Non-fatal: proceed with cookie cleanup even if DB deletion fails
		}
	}

	cookieStore.set(SESSION_COOKIE_NAMES[0], "", {
		path: "/",
		maxAge: 0,
		...(domain ? { domain } : {}),
	});
	cookieStore.set(SESSION_COOKIE_NAMES[1], "", {
		path: "/",
		maxAge: 0,
		...(domain ? { domain } : {}),
	});
	redirect("/login");
};
