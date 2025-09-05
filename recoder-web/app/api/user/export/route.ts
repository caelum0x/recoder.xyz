// Data export API endpoint for account deletion workflow and privacy compliance
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { userManager } from '@/lib/user-management';
import archiver from 'archiver';
import { PassThrough } from 'stream';

interface ExportData {
  profile: any;
  projects: any[];
  integrations: any[];
  apiKeys: any[];
  notifications: any[];
  auditLogs: any[];
  teams: any[];
  billing: any[];
  metadata: {
    exportDate: string;
    exportVersion: string;
    userId: string;
    dataTypes: string[];
  };
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { format = 'zip', includeFiles = false } = await request.json().catch(() => ({}));

    if (!['zip', 'json'].includes(format)) {
      return Response.json({ error: 'Invalid format. Supported formats: zip, json' }, { status: 400 });
    }

    // Collect user data from various sources
    const exportData = await collectUserData(session.user.id, includeFiles);

    if (format === 'json') {
      // Return JSON directly
      return Response.json(exportData, {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="recoder-export-${session.user.id}-${new Date().toISOString().split('T')[0]}.json"`,
        },
      });
    }

    // Create ZIP file
    const archive = archiver('zip', {
      zlib: { level: 9 } // Compression level
    });

    const passThrough = new PassThrough();
    archive.pipe(passThrough);

    // Add main data file
    archive.append(JSON.stringify(exportData, null, 2), { name: 'user-data.json' });

    // Add readme
    const readme = generateReadme(exportData.metadata);
    archive.append(readme, { name: 'README.txt' });

    // Add individual data files for easier parsing
    if (exportData.profile) {
      archive.append(JSON.stringify(exportData.profile, null, 2), { name: 'profile.json' });
    }
    if (exportData.projects.length > 0) {
      archive.append(JSON.stringify(exportData.projects, null, 2), { name: 'projects.json' });
    }
    if (exportData.integrations.length > 0) {
      archive.append(JSON.stringify(exportData.integrations, null, 2), { name: 'integrations.json' });
    }
    if (exportData.auditLogs.length > 0) {
      archive.append(JSON.stringify(exportData.auditLogs, null, 2), { name: 'audit-logs.json' });
    }

    // If including files, add project files (mock implementation)
    if (includeFiles && exportData.projects.length > 0) {
      for (const project of exportData.projects) {
        if (project.files && project.files.length > 0) {
          const projectDir = `projects/${project.name}/`;
          for (const file of project.files) {
            archive.append(file.content || '// File content not available in export', { 
              name: `${projectDir}${file.path}` 
            });
          }
        }
      }
    }

    archive.finalize();

    // Convert stream to buffer for response
    const chunks: Buffer[] = [];
    for await (const chunk of passThrough) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // Log export action for audit
    await logExportEvent(session.user.id, {
      format,
      includeFiles,
      dataTypes: exportData.metadata.dataTypes,
      exportSize: buffer.length,
    });

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="recoder-export-${session.user.id}-${new Date().toISOString().split('T')[0]}.zip"`,
        'Content-Length': buffer.length.toString(),
      },
    });

  } catch (error) {
    console.error('Data export error:', error);
    return Response.json({ error: 'Failed to export data' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Return export status and options
    const exportInfo = {
      availableFormats: ['zip', 'json'],
      dataTypes: [
        { type: 'profile', description: 'User profile information', size: 'Small' },
        { type: 'projects', description: 'Project metadata and configurations', size: 'Medium' },
        { type: 'integrations', description: 'Connected service configurations', size: 'Small' },
        { type: 'apiKeys', description: 'API key metadata (keys not included)', size: 'Small' },
        { type: 'notifications', description: 'Notification preferences', size: 'Small' },
        { type: 'auditLogs', description: 'Account activity logs', size: 'Large' },
        { type: 'teams', description: 'Team memberships and roles', size: 'Small' },
        { type: 'billing', description: 'Billing and subscription history', size: 'Medium' },
      ],
      options: {
        includeFiles: {
          description: 'Include actual project files in export',
          impact: 'Significantly increases export size',
          formats: ['zip'],
        },
      },
      estimatedSize: {
        withoutFiles: '< 10 MB',
        withFiles: '50-500 MB (depends on project size)',
      },
      processingTime: {
        withoutFiles: '< 30 seconds',
        withFiles: '1-5 minutes',
      },
    };

    return Response.json(exportInfo);
  } catch (error) {
    console.error('Export info error:', error);
    return Response.json({ error: 'Failed to get export information' }, { status: 500 });
  }
}

async function collectUserData(userId: string, includeFiles: boolean): Promise<ExportData> {
  try {
    // In a real implementation, these would be actual database queries
    // For now, return mock data structure

    const profile = await userManager.getUserProfile(userId);
    
    const mockData: ExportData = {
      profile: profile || {
        id: userId,
        email: 'user@example.com',
        name: 'User Name',
        createdAt: '2023-01-01T00:00:00Z',
        preferences: {},
      },
      projects: [
        {
          id: 'proj_1',
          name: 'My React App',
          description: 'A sample React application',
          createdAt: '2023-06-01T00:00:00Z',
          lastModified: '2023-12-01T00:00:00Z',
          files: includeFiles ? [
            { path: 'package.json', content: '{\n  "name": "my-react-app"\n}' },
            { path: 'src/App.js', content: 'import React from "react";\n\nexport default function App() {\n  return <div>Hello World</div>;\n}' },
          ] : [],
        },
      ],
      integrations: [
        {
          id: 'int_1',
          type: 'github',
          name: 'GitHub Integration',
          isEnabled: true,
          createdAt: '2023-03-01T00:00:00Z',
          // Sensitive config data excluded
        },
      ],
      apiKeys: [
        {
          id: 'key_1',
          name: 'Production API',
          keyPrefix: 'rcd_prod_abcd',
          permissions: ['projects:read', 'projects:write'],
          createdAt: '2023-05-01T00:00:00Z',
          lastUsed: '2023-12-01T00:00:00Z',
          usageCount: 1247,
          // Actual key not included for security
        },
      ],
      notifications: [
        {
          preferences: {
            email: { enabled: true, frequency: 'daily' },
            push: { enabled: true },
            inApp: { enabled: true },
          },
        },
      ],
      auditLogs: [
        {
          id: 'log_1',
          action: 'LOGIN',
          timestamp: '2023-12-01T09:00:00Z',
          ipAddress: '192.168.1.100',
          userAgent: 'Chrome/119.0.0.0',
        },
        {
          id: 'log_2',
          action: 'PROJECT_CREATED',
          timestamp: '2023-12-01T10:30:00Z',
          details: { projectName: 'My React App' },
        },
      ],
      teams: [
        {
          id: 'team_1',
          name: 'Development Team',
          role: 'member',
          joinedAt: '2023-02-01T00:00:00Z',
        },
      ],
      billing: [
        {
          id: 'bill_1',
          amount: 29.99,
          currency: 'USD',
          period: '2023-12',
          status: 'paid',
          paidAt: '2023-12-01T00:00:00Z',
        },
      ],
      metadata: {
        exportDate: new Date().toISOString(),
        exportVersion: '1.0',
        userId,
        dataTypes: ['profile', 'projects', 'integrations', 'apiKeys', 'notifications', 'auditLogs', 'teams', 'billing'],
      },
    };

    return mockData;
  } catch (error) {
    console.error('Error collecting user data:', error);
    throw new Error('Failed to collect user data');
  }
}

function generateReadme(metadata: ExportData['metadata']): string {
  return `Recoder.xyz Data Export
========================

Export Date: ${metadata.exportDate}
Export Version: ${metadata.exportVersion}
User ID: ${metadata.userId}

This archive contains your personal data from Recoder.xyz in a machine-readable format.

Contents:
---------
- user-data.json: Complete export data in a single file
- profile.json: Your user profile information
- projects.json: Your projects and their metadata
- integrations.json: Your connected service integrations
- audit-logs.json: Your account activity history
- projects/: Individual project files (if requested)

Data Types Included:
${metadata.dataTypes.map(type => `- ${type}`).join('\n')}

Privacy & Security:
-------------------
- API keys are not included in this export for security reasons
- Only key metadata (name, permissions, usage) is provided
- Sensitive configuration data has been excluded from integrations
- All data is provided in JSON format for easy parsing

If you have questions about this export or need additional data, 
please contact our support team at support@recoder.xyz.

Generated by Recoder.xyz Data Export System
`;
}

async function logExportEvent(userId: string, details: any): Promise<void> {
  try {
    console.log('Data Export Event:', {
      userId,
      action: 'DATA_EXPORTED',
      details,
      timestamp: new Date().toISOString(),
    });

    // In a real implementation, this would write to an audit log
    // await userManager.logSecurityEvent(userId, 'DATA_EXPORTED', details);
  } catch (error) {
    console.error('Failed to log export event:', error);
    // Don't throw here as it shouldn't break the export
  }
}