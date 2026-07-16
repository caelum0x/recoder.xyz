import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth-helpers";
import { addCorsHeaders, handlePreflight } from "@/lib/middleware/cors";

export async function OPTIONS(request: NextRequest) {
  return handlePreflight(request);
}

export async function GET(request: NextRequest) {
  const cors = (res: Response) => addCorsHeaders(res, request);
  const user = await getUserFromToken(request);
  if (!user) {
    return cors(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
  }

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 20, 50);
  const offset = Number(url.searchParams.get("offset")) || 0;

  const [notifications, unreadCount] = await Promise.all([
    prisma.notifications.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.notifications.count({
      where: { userId: user.id, read: false },
    }),
  ]);

  return cors(NextResponse.json({ notifications, unreadCount }));
}
