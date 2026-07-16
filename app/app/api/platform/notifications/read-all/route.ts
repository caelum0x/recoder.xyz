import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth-helpers";
import { addCorsHeaders, handlePreflight } from "@/lib/middleware/cors";

export async function OPTIONS(request: NextRequest) {
  return handlePreflight(request);
}

export async function POST(request: NextRequest) {
  const cors = (res: Response) => addCorsHeaders(res, request);
  const user = await getUserFromToken(request);
  if (!user) {
    return cors(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
  }

  const result = await prisma.notifications.updateMany({
    where: { userId: user.id, read: false },
    data: { read: true, readAt: new Date() },
  });

  return cors(NextResponse.json({ updated: result.count }));
}
