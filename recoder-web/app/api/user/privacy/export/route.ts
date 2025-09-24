import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/database";
import { v4 as uuidv4 } from "uuid";

interface DataExportRequest {
  id: string;
  type: "full" | "projects" | "profile";
  status: "pending" | "processing" | "ready" | "expired";
  requestedAt: string;
  expiresAt: string;
  downloadUrl?: string;
}

// POST - Request data export
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { type } = await request.json();

    if (!type || !["full", "projects", "profile"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid export type" },
        { status: 400 }
      );
    }

    // Check if user has pending export requests (limit to 3 active requests)
    const activeRequests = await prisma.dataExportRequest.count({
      where: {
        userId: session.user.id,
        status: { in: ["pending", "processing"] },
      },
    });

    if (activeRequests >= 3) {
      return NextResponse.json(
        { error: "Too many active export requests. Please wait for existing requests to complete." },
        { status: 429 }
      );
    }

    const exportId = uuidv4();
    const requestedAt = new Date();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Create export request in database
    const exportRequest = await prisma.dataExportRequest.create({
      data: {
        id: exportId,
        userId: session.user.id,
        type, // Add the required 'type' field
        status: "pending",
        expiresAt,
        ipAddress: request.headers.get("x-forwarded-for") || "unknown",
        userAgent: request.headers.get("user-agent") || "unknown",
      },
    });

    // Log the export request for audit
    await prisma.userAuditLog.create({
      data: {
        userId: session.user.id,
        action: "DATA_EXPORT_REQUESTED",
        details: {
          exportId,
          exportType: type,
          timestamp: requestedAt.toISOString(),
        },
        ipAddress: request.headers.get("x-forwarded-for") || "unknown",
        userAgent: request.headers.get("user-agent") || "unknown",
      },
    });

    // Start background processing (in a real implementation, this would be a queue job)
    processDataExport(exportId, session.user.id, type);

    const response: DataExportRequest = {
      id: exportId,
      type,
      status: "pending",
      requestedAt: requestedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error("Data export request error:", error);
    return NextResponse.json(
      { error: "Failed to create export request" },
      { status: 500 }
    );
  }
}

// Background function to process data export
async function processDataExport(exportId: string, userId: string, type: string) {
  try {
    
    // Update status to processing
    await prisma.dataExportRequest.update({
      where: { id: exportId },
      data: { status: "processing" },
    });

    let exportData: any = {};

    // Collect data based on export type
    if (type === "full" || type === "profile") {
      // Get user profile data
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          // accounts relation not in schema
          // sessions relation not in User schema
          privacySettings: true,
          securitySettings: true,
          apiKeys: true,
        },
      });

      exportData.profile = {
        id: user?.id,
        name: user?.name,
        email: user?.email,
        image: null, // image field not in User schema
        createdAt: user?.createdAt,
        updatedAt: user?.updatedAt,
        privacySettings: null, // privacySettings relation not in schema
        securitySettings: null, // securitySettings relation not in schema
      };
    }

    if (type === "full" || type === "projects") {
      // Get user projects data
      const projects = await prisma.project.findMany({
        where: { userId: userId },
        include: {
          // deploymentHistory relation not in Project schema
          // mediaFiles: true, // Field doesn't exist in Project model
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      });

      exportData.projects = projects.map(project => ({
        id: project.id,
        name: project.name,
        description: project.description,
        framework: project.framework,
        language: project.language,
        repository: null, // repository field not in Project schema
        visibility: null, // visibility field not in Project schema
        status: project.status,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        metadata: project.metadata,
        deploymentHistory: null, // deploymentHistory field not in Project schema
        // mediaFiles: project.mediaFiles, // Field doesn't exist
        teams: null, // members field not in Project schema, using null
      }));
    }

    if (type === "full") {
      // Get additional data for full export
      const auditLogs = await prisma.userAuditLog.findMany({
        where: { userId: userId },
        orderBy: { createdAt: "desc" },
        take: 1000, // Limit to last 1000 entries
      });

      exportData.auditLogs = auditLogs;

      // Get team memberships
      const teamMemberships = await prisma.teamMember.findMany({
        where: { userId: userId },
        include: {
          team: {
            select: {
              id: true,
              name: true,
              createdAt: true,
            },
          },
        },
      });

      exportData.teams = teamMemberships;
    }

    // In a real implementation, you would:
    // 1. Create a ZIP file with all the data
    // 2. Upload it to cloud storage (S3, etc.)
    // 3. Generate a secure download URL
    // 4. Set expiration for the URL
    
    // For now, we'll simulate this process
    await new Promise(resolve => setTimeout(resolve, 5000)); // Simulate processing time

    const downloadUrl = `/api/user/privacy/download/${exportId}`;

    // Update export request with download URL
    await prisma.dataExportRequest.update({
      where: { id: exportId },
      data: {
        status: "ready",
        downloadUrl,
        processedAt: new Date(),
      },
    });

    // Store the export data (in a real implementation, this would be in cloud storage)
    await prisma.dataExportData.create({
      data: {
        exportId,
        data: exportData,
        // createdAt: new Date(), // Field has default value
      },
    });

    console.log(`Data export ${exportId} completed successfully`);

  } catch (error) {
    console.error(`Data export ${exportId} failed:`, error);
    
    // Using existing prisma instance
    
    // Update status to failed
    await prisma.dataExportRequest.update({
      where: { id: exportId },
      data: {
        status: "expired",
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
  }
}
