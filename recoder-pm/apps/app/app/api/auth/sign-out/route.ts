import { authDatabase } from "@repo/backend/auth-database";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const POST = async () => {
  const cookieStore = await cookies();
  const rawToken =
    cookieStore.get("recoder.session_token")?.value ??
    cookieStore.get("__Secure-recoder.session_token")?.value;
  const sessionToken = rawToken?.split(".")[0] ?? null;

  if (sessionToken) {
    await authDatabase.session.deleteMany({
      where: { token: sessionToken },
    });
  }

  const response = NextResponse.json({ success: true });
  const isProd = process.env.NODE_ENV === "production";
  const domain = isProd ? ".recoder.xyz" : undefined;

  response.cookies.set({
    name: "recoder.session_token",
    value: "",
    path: "/",
    maxAge: 0,
    ...(domain ? { domain } : {}),
  });
  response.cookies.set({
    name: "__Secure-recoder.session_token",
    value: "",
    path: "/",
    maxAge: 0,
    ...(domain ? { domain } : {}),
  });

  return response;
};
