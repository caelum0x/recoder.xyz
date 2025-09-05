import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server-auth";
import { getPrisma } from "@/lib/prisma";

// GET - Fetch user's export requests
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    const prisma = getPrisma();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get user's export requests from database
    const exportRequests = await prisma.dataExportRequest.findMany({
      where: { userId: session.user.id },
      orderBy: { requestedAt: "desc" },
      take: 20, // Limit to last 20 requests
    });

    // Clean up expired requests
    const now = new Date();
    const expiredRequests = exportRequests.filter(req => 
      req.status === "ready" && req.expiresAt && new Date(req.expiresAt) < now
    );

    if (expiredRequests.length > 0) {
      // Mark expired requests
      await prisma.dataExportRequest.updateMany({
        where: {
          id: { in: expiredRequests.map(req => req.id) },
        },
        data: { status: "expired" },
      });

      // Clean up expired data
      await prisma.dataExportData.deleteMany({
        where: {
          exportId: { in: expiredRequests.map(req => req.id) },
        },
      });
    }

    // Format response
    const formattedRequests = exportRequests.map(request => ({
      id: request.id,
      type: request.type,
      status: expiredRequests.some(req => req.id === request.id) ? "expired" : request.status,
      requestedAt: request.requestedAt.toISOString(),
      expiresAt: request.expiresAt?.toISOString(),
      downloadUrl: request.status === "ready" && !expiredRequests.some(req => req.id === request.id) 
        ? request.downloadUrl 
        : undefined,
    }));

    return NextResponse.json(formattedRequests);

  } catch (error) {
    console.error("Export requests fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch export requests" },
      { status: 500 }
    );
  }
}
