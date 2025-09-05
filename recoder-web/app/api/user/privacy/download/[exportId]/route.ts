import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server-auth";
import { getPrisma } from "@/lib/prisma";

// GET - Download exported data
export async function GET(
  request: NextRequest,
  { params }: { params: { exportId: string } }
) {
  try {
    const session = await getServerSession();
    const prisma = getPrisma();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { exportId } = params;

    if (!exportId) {
      return NextResponse.json(
        { error: "Export ID is required" },
        { status: 400 }
      );
    }

    // Get export request
    const exportRequest = await prisma.dataExportRequest.findUnique({
      where: { id: exportId },
      include: {
        exportData: true,
      },
    });

    if (!exportRequest) {
      return NextResponse.json(
        { error: "Export request not found" },
        { status: 404 }
      );
    }

    // Verify ownership
    if (exportRequest.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Check if export is ready
    if (exportRequest.status !== "ready") {
      return NextResponse.json(
        { error: `Export is not ready. Current status: ${exportRequest.status}` },
        { status: 400 }
      );
    }

    // Check if export has expired
    if (exportRequest.expiresAt && new Date() > exportRequest.expiresAt) {
      // Mark as expired and clean up data
      await prisma.dataExportRequest.update({
        where: { id: exportId },
        data: { status: "expired" },
      });

      if (exportRequest.exportData) {
        await prisma.dataExportData.delete({
          where: { id: exportRequest.exportData.id },
        });
      }

      return NextResponse.json(
        { error: "Export has expired" },
        { status: 410 }
      );
    }

    // Get export data
    if (!exportRequest.exportData) {
      return NextResponse.json(
        { error: "Export data not found" },
        { status: 404 }
      );
    }

    // Log download access
    await prisma.userAuditLog.create({
      data: {
        userId: session.user.id,
        action: "DATA_EXPORT_DOWNLOADED",
        details: {
          exportId,
          exportType: exportRequest.type,
          timestamp: new Date().toISOString(),
        },
        ipAddress: request.headers.get("x-forwarded-for") || "unknown",
        userAgent: request.headers.get("user-agent") || "unknown",
      },
    });

    // Prepare the export data for download
    const exportData = exportRequest.exportData.data;
    const fileName = `recoder-export-${exportRequest.type}-${exportRequest.requestedAt.toISOString().split('T')[0]}.json`;

    // Format the data nicely
    const formattedData = {
      exportInfo: {
        id: exportRequest.id,
        type: exportRequest.type,
        requestedAt: exportRequest.requestedAt,
        exportedAt: new Date(),
        user: {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
        },
      },
      data: exportData,
    };

    const jsonData = JSON.stringify(formattedData, null, 2);

    // Return the file as a download
    return new NextResponse(jsonData, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": Buffer.byteLength(jsonData, "utf8").toString(),
      },
    });

  } catch (error) {
    console.error("Data export download error:", error);
    return NextResponse.json(
      { error: "Failed to download export" },
      { status: 500 }
    );
  }
}
