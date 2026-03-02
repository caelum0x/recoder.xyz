import { updateSession } from "@repo/backend/auth/proxy";
import type { NextRequest, NextResponse } from "next/server";

export const proxy = async (request: NextRequest): Promise<NextResponse> =>
  updateSession(request);

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, icons, manifest, images
     * - api/auth/* (auth endpoints must remain open)
     * - auth/* (auth confirmation callbacks)
     * - sign-in, sign-up (public pages)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$|api/auth|auth|sign-in|sign-up).*)",
  ],
};
