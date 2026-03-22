import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth-helpers";
import { addCorsHeaders, handlePreflight } from "@/lib/middleware/cors";

export async function OPTIONS(request: NextRequest) {
  return handlePreflight(request);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cors = (res: Response) => addCorsHeaders(res, request);
  const user = await getUserFromToken(request);
  if (!user) {
    return cors(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
  }

  const { id } = await params;

  try {
    const notification = await prisma.notifications.update({
      where: { id, userId: user.id },
      data: { read: true, readAt: new Date() },
    });
    return cors(NextResponse.json({ id: notification.id, read: true }));
  } catch {
    return cors(NextResponse.json({ error: "not_found" }, { status: 404 }));
  }
}
