"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authDb } from "@/db/auth-db";
import { authSessions } from "@/db/auth-schema";

export const signOut = async () => {
	const cookieStore = await cookies();
	const rawToken =
		cookieStore.get("recoder.session_token")?.value ??
		cookieStore.get("__Secure-recoder.session_token")?.value;
	const sessionToken = rawToken?.split(".")[0] ?? null;

	if (sessionToken) {
		await authDb
			.delete(authSessions)
			.where(eq(authSessions.token, sessionToken));
	}

	const isProd = process.env.NODE_ENV === "production";
	const domain = isProd ? ".recoder.xyz" : undefined;

	cookieStore.set("recoder.session_token", "", {
		path: "/",
		maxAge: 0,
		...(domain ? { domain } : {}),
	});
	cookieStore.set("__Secure-recoder.session_token", "", {
		path: "/",
		maxAge: 0,
		...(domain ? { domain } : {}),
	});

	redirect("/login");
};
