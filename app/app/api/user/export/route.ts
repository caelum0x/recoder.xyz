import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/auth-helpers";
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';

import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.response;
    const { user: authUser } = authResult;

    if (!authUser?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.users.findUnique({
      where: { email: authUser.email },
      include: {
        projects: {
          select: {
            id: true,
            name: true,
            description: true,
            type: true,
            framework: true,
            language: true,
            createdAt: true,
            updatedAt: true
          }
        },
        api_keys: {
          select: {
            id: true,
            name: true,
            permissions: true,
            createdAt: true,
            lastUsedAt: true
          }
        },
        usage_records: {
          select: {
            id: true,
            type: true,
            timestamp: true,
            tokens: true,
            cost: true,
            metadata: true
          },
          orderBy: { timestamp: 'desc' },
          take: 1000
        },
        subscriptions: {
          select: {
            id: true,
            status: true,
            createdAt: true,
            currentPeriodStart: true,
            currentPeriodEnd: true
          }
        },
        user_preferences: true
      }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Remove sensitive data
    const exportData = {
      account: {
        id: user.id,
        email: user.email,
        name: user.name,
        organization: user.organization,
        createdAt: user.createdAt,
        emailVerified: user.emailVerified,
        subscription: user.subscription
      },
      projects: user.projects,
      apiKeys: user.api_keys,
      usageRecords: user.usage_records,
      subscriptions: user.subscriptions,
      preferences: user.user_preferences,
      exportedAt: new Date().toISOString(),
      version: '1.0.0'
    };

    // Log audit event
    await prisma.audit_logs.create({
      data: {
        id: crypto.randomUUID(),
        userId: user.id,
        action: 'exported',
        resource: 'account_data',
        resourceId: user.id,
        metadata: { recordCount: user.usage_records.length },
      }
    });

    // Return as JSON file download
    const jsonString = JSON.stringify(exportData, null, 2);
    const buffer = Buffer.from(jsonString, 'utf-8');

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="recoder-data-export-${Date.now()}.json"`,
        'Content-Length': buffer.length.toString()
      }
    });

  } catch (error) {
    console.error('Export data error:', error);
    return NextResponse.json(
      { error: 'Failed to export data' },
      { status: 500 }
    );
  }
}
