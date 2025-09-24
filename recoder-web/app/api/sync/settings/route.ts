/**
 * Settings Synchronization API Endpoints
 * Provides REST API for settings sync across platforms
 */

import { NextRequest, NextResponse } from 'next/server';
import { settingsSync } from '@/lib/sync/settings-sync';
import { auth } from '@/lib/auth/unified-auth';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const section = searchParams.get('section') as keyof any;

    switch (action) {
      case 'get':
        // Get all user settings or specific section
        if (section) {
          const userSettings = await settingsSync.getUserSettings(session.user.id);
          if (section in userSettings) {
            const sectionData = userSettings[section as keyof typeof userSettings];
            return NextResponse.json({ section, settings: sectionData });
          } else {
            return NextResponse.json({ error: 'Invalid section' }, { status: 400 });
          }
        } else {
          const settings = await settingsSync.getUserSettings(session.user.id);
          return NextResponse.json({ settings });
        }

      case 'export':
        // Export user settings
        const exportedSettings = await settingsSync.exportUserSettings(session.user.id);
        return NextResponse.json({ 
          settings: exportedSettings,
          exportedAt: new Date().toISOString(),
        });

      case 'events':
        // Get settings events
        const limit = parseInt(searchParams.get('limit') || '50');
        const events = await settingsSync.getSettingsEvents(session.user.id, limit);
        return NextResponse.json({ events });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Settings sync API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, section, settings, ...data } = body;
    const sessionId = request.headers.get('x-session-id') || 'unknown';
    const platform = request.headers.get('x-platform') || 'web';

    switch (action) {
      case 'update':
        // Update all settings or specific section
        if (section) {
          const updatedSection = await settingsSync.updateSettingsSection(
            session.user.id,
            sessionId,
            platform,
            section,
            settings
          );
          return NextResponse.json({ section, settings: updatedSection });
        } else {
          const updatedSettings = await settingsSync.updateUserSettings(
            session.user.id,
            sessionId,
            platform,
            settings
          );
          return NextResponse.json({ settings: updatedSettings });
        }

      case 'reset':
        // Reset settings to defaults
        const resetSettings = await settingsSync.resetUserSettings(
          session.user.id,
          sessionId,
          platform,
          section
        );
        return NextResponse.json({ settings: resetSettings });

      case 'import':
        // Import settings from backup
        if (!settings) {
          return NextResponse.json({ error: 'Settings data required' }, { status: 400 });
        }
        
        const importedSettings = await settingsSync.importUserSettings(
          session.user.id,
          sessionId,
          platform,
          settings
        );
        return NextResponse.json({ settings: importedSettings });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Settings sync API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
