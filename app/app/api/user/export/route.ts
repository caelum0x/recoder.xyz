/**
 * User Data Export API
 * Export all user data in JSON format (GDPR compliance)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Fetch user data
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    // Fetch all settings from various tables using raw queries
    const [
      profile,
      editorSettings,
      aiSettings,
      securitySettings,
      notificationSettings,
      projectSettings,
      keyboardShortcuts,
      integrationSettings
    ] = await Promise.all([
      prisma.$queryRaw`SELECT * FROM user_profiles WHERE user_id = ${userId}`,
      prisma.$queryRaw`SELECT * FROM editor_settings WHERE user_id = ${userId}`,
      prisma.$queryRaw`SELECT * FROM ai_settings WHERE user_id = ${userId}`,
      prisma.$queryRaw`SELECT * FROM security_settings WHERE user_id = ${userId}`,
      prisma.$queryRaw`SELECT * FROM notification_settings WHERE user_id = ${userId}`,
      prisma.$queryRaw`SELECT * FROM project_settings WHERE user_id = ${userId}`,
      prisma.$queryRaw`SELECT * FROM keyboard_shortcuts WHERE user_id = ${userId}`,
      prisma.$queryRaw`SELECT * FROM integration_settings WHERE user_id = ${userId}`
    ]);

    // Fetch API keys (without revealing actual key values)
    const apiKeys = await prisma.api_keys.findMany({
      where: { userId },
      select: {
        name: true,
        keyPrefix: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true
      }
    });

    // Fetch sessions
    const sessions = await prisma.session.findMany({
      where: { userId },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        updatedAt: true,
        expiresAt: true
      }
    });

    // Fetch connected OAuth accounts
    const accounts = await prisma.account.findMany({
      where: { userId },
      select: {
        providerId: true,
        createdAt: true
      }
    });

    // Compile all data
    const exportData = {
      exportDate: new Date().toISOString(),
      exportVersion: '1.0',
      user: {
        id: user?.id,
        email: user?.email,
        name: user?.name,
        emailVerified: user?.emailVerified,
        image: user?.image,
        createdAt: user?.createdAt,
        updatedAt: user?.updatedAt
      },
      profile: Array.isArray(profile) && profile.length > 0 ? profile[0] : null,
      settings: {
        editor: Array.isArray(editorSettings) && editorSettings.length > 0 ? editorSettings[0] : null,
        ai: Array.isArray(aiSettings) && aiSettings.length > 0 ? aiSettings[0] : null,
        security: Array.isArray(securitySettings) && securitySettings.length > 0 ? securitySettings[0] : null,
        notifications: Array.isArray(notificationSettings) && notificationSettings.length > 0 ? notificationSettings[0] : null,
        project: Array.isArray(projectSettings) && projectSettings.length > 0 ? projectSettings[0] : null,
        keyboardShortcuts: Array.isArray(keyboardShortcuts) && keyboardShortcuts.length > 0 ? keyboardShortcuts[0] : null,
        integrations: Array.isArray(integrationSettings) && integrationSettings.length > 0 ? integrationSettings[0] : null
      },
      apiKeys: apiKeys.map(key => ({
        name: key.name,
        keyPrefix: key.keyPrefix,
        createdAt: key.createdAt,
        lastUsedAt: key.lastUsedAt,
        expiresAt: key.expiresAt
        // Note: Actual key value is NOT exported for security
      })),
      sessions: sessions.map(s => ({
        id: s.id,
        userAgent: s.userAgent,
        ipAddress: s.ipAddress,
        createdAt: s.createdAt,
        lastActive: s.updatedAt,
        expiresAt: s.expiresAt
      })),
      connectedAccounts: accounts.map(acc => ({
        provider: acc.providerId,
        providerId: acc.providerId,
        connectedAt: acc.createdAt
      })),
      notice: {
        message: 'This export contains all your personal data stored in Recoder.',
        gdprCompliance: 'This export is provided in accordance with GDPR Article 15 (Right of Access) and Article 20 (Right to Data Portability).',
        sensitiveData: 'API key values are not included for security reasons. Only key metadata is provided.',
        retention: 'You can request deletion of this data by contacting support.',
        format: 'JSON format for easy portability and machine readability.'
      }
    };

    const filename = `recoder-data-export-${new Date().toISOString().split('T')[0]}.json`;
    const jsonString = JSON.stringify(exportData, null, 2);
    const buffer = Buffer.from(jsonString, 'utf-8');

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'no-store'
      }
    });

  } catch (error) {
    console.error('[User Export] Error:', error);
    return NextResponse.json(
      { error: 'Failed to export data' },
      { status: 500 }
    );
  }
}
