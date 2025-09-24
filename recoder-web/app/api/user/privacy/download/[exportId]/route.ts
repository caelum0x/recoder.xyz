import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET - Download exported data
export async function GET(
  request: NextRequest,
  { params }: { params: { exportId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get user ID from session email
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      select: { id: true }
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { exportId } = params;

    if (!exportId) {
      return NextResponse.json(
        { error: "Export ID is required" },
        { status: 400 }
      );
    }

    // Note: Mock export request since DataExportRequest model doesn't exist
    const exportRequest: any = {
      id: exportId,
      userId: user.id,
      type: 'full_export',
      status: 'ready',
      requestedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      exportData: {
        id: 'export_data_' + exportId,
        data: { message: 'Mock export data - DataExport models not implemented' }
      }
    };

    if (!exportRequest) {
      return NextResponse.json(
        { error: "Export request not found" },
        { status: 404 }
      );
    }

    // Verify ownership
    if (exportRequest.userId !== user.id) {
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
      // Note: Would mark as expired and clean up data here if models existed
      console.log('Export expired, would cleanup:', exportId);

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

    // Note: Log download access using AuditLog model
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "data_export_downloaded",
        resource: "data_export",
        platform: "web",
        ip: request.headers.get("x-forwarded-for") || "unknown",
        userAgent: request.headers.get("user-agent") || "unknown",
        success: true,
        metadata: {
          exportId,
          exportType: exportRequest.type,
          timestamp: new Date().toISOString(),
        },
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
          id: user.id,
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
