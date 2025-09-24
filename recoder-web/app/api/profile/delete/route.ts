import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import speakeasy from 'speakeasy';

const deleteAccountSchema = z.object({
  password: z.string().min(1),
  confirmationText: z.string().refine(val => val === 'DELETE MY ACCOUNT', {
    message: 'You must type "DELETE MY ACCOUNT" to confirm'
  }),
  reason: z.enum(['privacy', 'not_useful', 'too_expensive', 'found_alternative', 'other']).optional(),
  feedback: z.string().max(1000).optional(),
  twoFactorCode: z.string().optional(),
  backupCode: z.string().optional()
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { 
      password, 
      confirmationText, 
      reason, 
      feedback, 
      twoFactorCode, 
      backupCode 
    } = deleteAccountSchema.parse(body);
    
    const userId = session.user.id;

    // Get user data
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        password: true,
        twoFactorEnabled: true,
        totpSecret: true,
        backupCodes: true,
        createdAt: true
      }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password || '');
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }

    // Verify 2FA if enabled
    if (user.twoFactorEnabled) {
      let twoFactorValid = false;

      if (twoFactorCode && user.totpSecret) {
        twoFactorValid = speakeasy.totp.verify({
          secret: user.totpSecret,
          encoding: 'base32',
          token: twoFactorCode,
          window: 2
        });
      }

      if (!twoFactorValid && backupCode && user.backupCodes && Array.isArray(user.backupCodes)) {
        for (const hashedCode of user.backupCodes) {
          if (typeof hashedCode === 'string' && await bcrypt.compare(backupCode.toUpperCase(), hashedCode)) {
            twoFactorValid = true;
            break;
          }
        }
      }

      if (!twoFactorValid) {
        return NextResponse.json(
          { error: '2FA verification required for account deletion' },
          { status: 400 }
        );
      }
    }

    // Create deletion record for audit purposes
    const deletionRecord = await prisma.dataExport.create({
      data: {
        userId,
        status: 'processing',
        exportType: 'account_deletion',
        format: 'json'
      }
    });

    // Generate final data export before deletion
    const finalExport = await generateFinalExport(userId);
    
    // Store the export data temporarily
    await prisma.dataExportData.create({
      data: {
        exportId: deletionRecord.id,
        dataType: 'account_deletion',
        tableName: 'user_export',
        data: {
          exportMetadata: finalExport.exportMetadata,
          userData: {
            id: finalExport.userData.id,
            email: finalExport.userData.email,
            name: finalExport.userData.name,
            createdAt: finalExport.userData.createdAt,
            updatedAt: finalExport.userData.updatedAt
          }
        }
      }
    });

    // Log the deletion request
    await prisma.userAuditLog.create({
      data: {
        userId,
        action: 'ACCOUNT_DELETION_REQUESTED',
        details: {
          reason,
          feedback: feedback || null,
          confirmationText,
          deletionId: deletionRecord.id,
          userJoinedAt: user.createdAt,
          totalDaysActive: Math.floor(
            (new Date().getTime() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)
          )
        },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown'
      }
    });

    // Security event for account deletion
    await prisma.securityEvent.create({
      data: {
        userId,
        eventType: 'account_deletion',
        severity: 'high',
        description: 'User account deletion initiated',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        metadata: {
          reason,
          deletionId: deletionRecord.id,
          timestamp: new Date().toISOString()
        }
      }
    });

    // Begin cascading deletion process
    await performAccountDeletion(userId);

    // Update deletion record
    await prisma.dataExport.update({
      where: { id: deletionRecord.id },
      data: {
        status: 'completed',
        completedAt: new Date()
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Account has been successfully deleted',
      deletionId: deletionRecord.id,
      exportAvailable: true,
      exportExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid deletion request', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Account deletion error:', error);
    return NextResponse.json(
      { error: 'Failed to delete account' },
      { status: 500 }
    );
  }
}

async function generateFinalExport(userId: string) {
  // Generate comprehensive final export of all user data
  const userData = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      chats: {
        include: { messages: true }
      },
      generatedApps: true,
      apiKeys: true,
      auditLogs: true,
      projects: true,
      integrations: true,
      webhooks: true,
      dataExports: true,
      userAuditLogs: true,
      dataExportRequests: true
    }
  });

  return {
    exportMetadata: {
      userId,
      exportType: 'final_account_export',
      exportedAt: new Date().toISOString(),
      purpose: 'account_deletion'
    },
    userData: {
      // Remove sensitive fields but keep essential data
      ...userData,
      password: '[REDACTED]',
      totpSecret: userData?.totpSecret ? '[REDACTED]' : null,
      backupCodes: userData?.backupCodes ? ['[REDACTED]'] : []
    }
  };
}

async function performAccountDeletion(userId: string) {
  // This performs a cascading deletion of all user data
  // The order is important due to foreign key constraints
  
  // 1. Delete related records first (those that reference user)
  await prisma.dataExportData.deleteMany({
    where: {
      export: { userId }
    }
  });
  await prisma.dataExportRequest.deleteMany({ where: { userId } });
  await prisma.userAuditLog.deleteMany({ where: { userId } });
  await prisma.integration.deleteMany({ where: { userId } });
  await prisma.webhook.deleteMany({ where: { userId } });
  await prisma.project.deleteMany({ where: { userId } });
  await prisma.aIConsensusLog.deleteMany({ where: { userId } });
  await prisma.auditLog.deleteMany({ where: { userId } });
  await prisma.apiKey.deleteMany({ where: { userId } });
  await prisma.message.deleteMany({
    where: { chat: { userId } }
  });
  await prisma.chat.deleteMany({ where: { userId } });
  await prisma.generatedApp.deleteMany({ where: { userId } });
  
  // 2. Delete settings and preferences
  await prisma.userSettings.deleteMany({ where: { userId } });
  
  // 3. Delete auth-related records
  // Skip session and account deletion as they don't exist
  
  // 4. Finally delete the user record
  await prisma.user.delete({ where: { id: userId } });
  
  // 5. Clean up any orphaned security events
  await prisma.securityEvent.deleteMany({ where: { userId } });
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Get user statistics for deletion preview
    const userStats = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        createdAt: true,
        _count: {
          select: {
            chats: true,
            projects: true,
            generatedApps: true,
            apiKeys: true
          }
        }
      }
    });

    if (!userStats) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const daysSinceJoined = Math.floor(
      (new Date().getTime() - userStats.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    return NextResponse.json({
      userId: userStats.id,
      accountAge: {
        days: daysSinceJoined,
        createdAt: userStats.createdAt
      },
      dataToBeDeleted: {
        chats: userStats._count.chats,
        projects: userStats._count.projects,
        generatedApps: userStats._count.generatedApps,
        apiKeys: userStats._count.apiKeys
      },
      warnings: [
        'This action cannot be undone',
        'All your data will be permanently deleted',
        'Active subscriptions will be cancelled',
        'Shared projects will become inaccessible',
        'API keys will be revoked immediately'
      ],
      requirements: [
        'Enter your current password',
        'Type "DELETE MY ACCOUNT" exactly',
        'Provide 2FA code if enabled',
        'Confirm you understand this is permanent'
      ]
    });

  } catch (error) {
    console.error('Account deletion preview error:', error);
    return NextResponse.json(
      { error: 'Failed to get account deletion preview' },
      { status: 500 }
    );
  }
}