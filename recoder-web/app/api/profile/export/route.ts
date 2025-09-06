import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import archiver from 'archiver';
import { Readable } from 'stream';

const exportRequestSchema = z.object({
  type: z.enum(['full', 'profile', 'projects', 'usage', 'security']).default('full'),
  format: z.enum(['json', 'csv', 'zip']).default('json'),
  includeFiles: z.boolean().default(false),
  dateRange: z.object({
    start: z.string().datetime().optional(),
    end: z.string().datetime().optional()
  }).optional()
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { type, format, includeFiles, dateRange } = exportRequestSchema.parse(body);
    const userId = session.user.id;

    // Check if user has any pending export requests
    const pendingExports = await prisma.dataExportRequest.count({
      where: {
        userId,
        status: { in: ['pending', 'processing'] }
      }
    });

    if (pendingExports > 0) {
      return NextResponse.json(
        { error: 'You already have a pending export request' },
        { status: 429 }
      );
    }

    // Create export request
    const exportRequest = await prisma.dataExportRequest.create({
      data: {
        userId,
        type,
        status: 'pending',
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown'
      }
    });

    // Process export immediately (in a real app, this would be queued)
    const exportData = await generateExportData(userId, type, dateRange);
    
    let fileContent: Buffer;
    let contentType: string;
    let fileName: string;

    if (format === 'json') {
      fileContent = Buffer.from(JSON.stringify(exportData, null, 2));
      contentType = 'application/json';
      fileName = `recoder-export-${type}-${Date.now()}.json`;
    } else if (format === 'csv') {
      fileContent = Buffer.from(convertToCSV(exportData));
      contentType = 'text/csv';
      fileName = `recoder-export-${type}-${Date.now()}.csv`;
    } else {
      // Create ZIP archive
      const archive = archiver('zip', { zlib: { level: 9 } });
      const chunks: Buffer[] = [];
      
      archive.on('data', (chunk) => chunks.push(chunk));
      archive.on('end', () => {});
      
      // Add main data as JSON
      archive.append(JSON.stringify(exportData, null, 2), { name: `${type}-data.json` });
      
      if (includeFiles && exportData.mediaFiles) {
        // Add media files (in real implementation, would need to handle file storage)
        for (const file of exportData.mediaFiles) {
          if (file.filePath) {
            // archive.file(file.filePath, { name: `files/${file.originalName}` });
            // For demo, just add metadata
            archive.append(JSON.stringify(file, null, 2), { name: `files/${file.originalName}-metadata.json` });
          }
        }
      }
      
      archive.finalize();
      fileContent = Buffer.concat(chunks);
      contentType = 'application/zip';
      fileName = `recoder-export-${type}-${Date.now()}.zip`;
    }

    // Update export request with completion
    await prisma.dataExportRequest.update({
      where: { id: exportRequest.id },
      data: {
        status: 'ready',
        processedAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      }
    });

    // Store export data
    await prisma.dataExportData.create({
      data: {
        exportId: exportRequest.id,
        data: exportData
      }
    });

    // Log the export request
    await prisma.userAuditLog.create({
      data: {
        userId,
        action: 'DATA_EXPORT_REQUESTED',
        details: {
          exportType: type,
          format,
          includeFiles,
          exportId: exportRequest.id
        },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown'
      }
    });

    // Return file directly for immediate download
    return new NextResponse(fileContent, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': fileContent.length.toString()
      }
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid export request', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Export error:', error);
    return NextResponse.json(
      { error: 'Failed to create export' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const exportId = searchParams.get('exportId');

    const whereCondition: any = { userId: session.user.id };
    if (exportId) {
      whereCondition.id = exportId;
    }

    const exports = await prisma.dataExportRequest.findMany({
      where: whereCondition,
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        type: true,
        status: true,
        requestedAt: true,
        processedAt: true,
        expiresAt: true,
        downloadUrl: true,
        error: true
      }
    });

    return NextResponse.json({ exports });

  } catch (error) {
    console.error('Export list error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch exports' },
      { status: 500 }
    );
  }
}

async function generateExportData(userId: string, type: string, dateRange?: { start?: string; end?: string }) {
  const baseWhere = { userId };
  const dateWhere = dateRange ? {
    createdAt: {
      ...(dateRange.start && { gte: new Date(dateRange.start) }),
      ...(dateRange.end && { lte: new Date(dateRange.end) })
    }
  } : {};

  const exportData: any = {
    exportMetadata: {
      userId,
      exportType: type,
      exportedAt: new Date().toISOString(),
      dateRange
    }
  };

  if (type === 'full' || type === 'profile') {
    exportData.profile = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        bio: true,
        location: true,
        company: true,
        blog: true,
        image: true,
        createdAt: true,
        updatedAt: true,
        publicRepos: true,
        followers: true,
        following: true
      }
    });
  }

  if (type === 'full' || type === 'projects') {
    exportData.projects = await prisma.project.findMany({
      where: { ...baseWhere, ...dateWhere },
      select: {
        id: true,
        name: true,
        description: true,
        framework: true,
        language: true,
        repository: true,
        visibility: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        deploymentHistory: {
          select: {
            id: true,
            platforms: true,
            results: true,
            timestamp: true,
            successfulDeployments: true,
            totalDeployments: true
          }
        }
      }
    });

    exportData.generatedApps = await prisma.generatedApp.findMany({
      where: { ...baseWhere, ...dateWhere },
      select: {
        id: true,
        model: true,
        prompt: true,
        code: true,
        metadata: true,
        isPublic: true,
        createdAt: true
      }
    });
  }

  if (type === 'full' || type === 'usage') {
    exportData.chats = await prisma.chat.findMany({
      where: { ...baseWhere, ...dateWhere },
      select: {
        id: true,
        model: true,
        quality: true,
        prompt: true,
        title: true,
        isPublic: true,
        createdAt: true,
        messages: {
          select: {
            id: true,
            role: true,
            content: true,
            position: true,
            metadata: true,
            createdAt: true
          }
        }
      }
    });

    exportData.usageStats = await prisma.usageStats.findMany({
      where: { ...baseWhere, ...dateWhere },
      select: {
        id: true,
        date: true,
        generationsUsed: true,
        tokensUsed: true,
        modelsUsed: true,
        costAccrued: true
      }
    });
  }

  if (type === 'full' || type === 'security') {
    exportData.userSessions = await prisma.userSession.findMany({
      where: { ...baseWhere, ...dateWhere },
      select: {
        id: true,
        deviceId: true,
        deviceName: true,
        browser: true,
        os: true,
        location: true,
        platform: true,
        isActive: true,
        createdAt: true,
        lastUsed: true,
        terminatedAt: true
      }
    });

    exportData.apiKeys = await prisma.apiKey.findMany({
      where: { ...baseWhere, ...dateWhere },
      select: {
        id: true,
        keyId: true,
        name: true,
        scopes: true,
        restrictions: true,
        lastUsed: true,
        createdAt: true,
        active: true
      }
    });

    exportData.auditLogs = await prisma.userAuditLog.findMany({
      where: { ...baseWhere, ...dateWhere },
      select: {
        id: true,
        action: true,
        details: true,
        ipAddress: true,
        createdAt: true
      }
    });

    exportData.privacySettings = await prisma.userPrivacySettings.findUnique({
      where: { userId }
    });

    exportData.securitySettings = await prisma.userSecuritySettings.findUnique({
      where: { userId }
    });
  }

  if (type === 'full') {
    exportData.mediaFiles = await prisma.mediaFile.findMany({
      where: { ...baseWhere, ...dateWhere },
      select: {
        id: true,
        originalName: true,
        fileName: true,
        filePath: true,
        fileSize: true,
        mimeType: true,
        format: true,
        purpose: true,
        width: true,
        height: true,
        duration: true,
        metadata: true,
        createdAt: true
      }
    });

    exportData.notifications = await prisma.notification.findMany({
      where: { ...baseWhere, ...dateWhere },
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        category: true,
        priority: true,
        read: true,
        starred: true,
        archived: true,
        createdAt: true
      }
    });
  }

  return exportData;
}

function convertToCSV(data: any): string {
  // Simple CSV conversion for flat data structures
  // In a real implementation, this would handle nested objects better
  const csvRows: string[] = [];
  
  if (data.profile) {
    csvRows.push('=== PROFILE ===');
    const profile = data.profile;
    csvRows.push(Object.keys(profile).join(','));
    csvRows.push(Object.values(profile).map(v => JSON.stringify(v)).join(','));
    csvRows.push('');
  }

  if (data.projects && data.projects.length > 0) {
    csvRows.push('=== PROJECTS ===');
    const projects = data.projects;
    const headers = Object.keys(projects[0]).filter(key => typeof projects[0][key] !== 'object');
    csvRows.push(headers.join(','));
    projects.forEach((project: any) => {
      const row = headers.map(header => JSON.stringify(project[header] || ''));
      csvRows.push(row.join(','));
    });
    csvRows.push('');
  }

  return csvRows.join('\n');
}