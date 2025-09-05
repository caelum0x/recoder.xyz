import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server-auth";
import { getPrisma } from "@/lib/prisma";

interface PrivacySettings {
  profileVisibility: "public" | "friends" | "private";
  showEmail: boolean;
  showPhone: boolean;
  showLocation: boolean;
  showOnlineStatus: boolean;
  allowDirectMessages: "everyone" | "friends" | "none";
  allowFriendRequests: boolean;
  showProjectsPublicly: boolean;
  allowProjectSharing: boolean;
  dataCollection: {
    analytics: boolean;
    marketing: boolean;
    personalization: boolean;
    thirdParty: boolean;
  };
  tracking: {
    cookies: boolean;
    location: boolean;
    usage: boolean;
    performance: boolean;
  };
  notifications: {
    email: boolean;
    sms: boolean;
    push: boolean;
    marketing: boolean;
  };
  searchVisibility: boolean;
  allowSearchEngines: boolean;
  twoFactorRequired: boolean;
  sessionTimeout: number;
}

// GET - Fetch user's privacy settings
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

    // Get user's privacy settings from database
    const userPrivacy = await prisma.userPrivacySettings.findUnique({
      where: { userId: session.user.id },
    });

    // If no settings exist, create default settings
    if (!userPrivacy) {
      const defaultSettings: PrivacySettings = {
        profileVisibility: "public",
        showEmail: false,
        showPhone: false,
        showLocation: false,
        showOnlineStatus: true,
        allowDirectMessages: "friends",
        allowFriendRequests: true,
        showProjectsPublicly: true,
        allowProjectSharing: true,
        dataCollection: {
          analytics: true,
          marketing: false,
          personalization: true,
          thirdParty: false,
        },
        tracking: {
          cookies: true,
          location: false,
          usage: true,
          performance: true,
        },
        notifications: {
          email: true,
          sms: false,
          push: true,
          marketing: false,
        },
        searchVisibility: true,
        allowSearchEngines: false,
        twoFactorRequired: false,
        sessionTimeout: 60, // 1 hour
      };

      // Create default settings in database
      const createdSettings = await prisma.userPrivacySettings.create({
        data: {
          userId: session.user.id,
          profileVisibility: defaultSettings.profileVisibility,
          showEmail: defaultSettings.showEmail,
          showPhone: defaultSettings.showPhone,
          showLocation: defaultSettings.showLocation,
          showOnlineStatus: defaultSettings.showOnlineStatus,
          allowDirectMessages: defaultSettings.allowDirectMessages,
          allowFriendRequests: defaultSettings.allowFriendRequests,
          showProjectsPublicly: defaultSettings.showProjectsPublicly,
          allowProjectSharing: defaultSettings.allowProjectSharing,
          dataCollection: defaultSettings.dataCollection,
          tracking: defaultSettings.tracking,
          notifications: defaultSettings.notifications,
          searchVisibility: defaultSettings.searchVisibility,
          allowSearchEngines: defaultSettings.allowSearchEngines,
          twoFactorRequired: defaultSettings.twoFactorRequired,
          sessionTimeout: defaultSettings.sessionTimeout,
        },
      });

      return NextResponse.json(defaultSettings);
    }

    // Return existing settings
    const settings: PrivacySettings = {
      profileVisibility: userPrivacy.profileVisibility as "public" | "friends" | "private",
      showEmail: userPrivacy.showEmail,
      showPhone: userPrivacy.showPhone,
      showLocation: userPrivacy.showLocation,
      showOnlineStatus: userPrivacy.showOnlineStatus,
      allowDirectMessages: userPrivacy.allowDirectMessages as "everyone" | "friends" | "none",
      allowFriendRequests: userPrivacy.allowFriendRequests,
      showProjectsPublicly: userPrivacy.showProjectsPublicly,
      allowProjectSharing: userPrivacy.allowProjectSharing,
      dataCollection: userPrivacy.dataCollection as any,
      tracking: userPrivacy.tracking as any,
      notifications: userPrivacy.notifications as any,
      searchVisibility: userPrivacy.searchVisibility,
      allowSearchEngines: userPrivacy.allowSearchEngines,
      twoFactorRequired: userPrivacy.twoFactorRequired,
      sessionTimeout: userPrivacy.sessionTimeout,
    };

    return NextResponse.json(settings);

  } catch (error) {
    console.error("Privacy settings fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch privacy settings" },
      { status: 500 }
    );
  }
}

// POST - Update user's privacy settings
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    const prisma = getPrisma();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const settings: PrivacySettings = await request.json();

    // Validate settings
    if (!settings || typeof settings !== 'object') {
      return NextResponse.json(
        { error: "Invalid settings data" },
        { status: 400 }
      );
    }

    // Update privacy settings in database
    const updatedSettings = await prisma.userPrivacySettings.upsert({
      where: { userId: session.user.id },
      update: {
        profileVisibility: settings.profileVisibility,
        showEmail: settings.showEmail,
        showPhone: settings.showPhone,
        showLocation: settings.showLocation,
        showOnlineStatus: settings.showOnlineStatus,
        allowDirectMessages: settings.allowDirectMessages,
        allowFriendRequests: settings.allowFriendRequests,
        showProjectsPublicly: settings.showProjectsPublicly,
        allowProjectSharing: settings.allowProjectSharing,
        dataCollection: settings.dataCollection,
        tracking: settings.tracking,
        notifications: settings.notifications,
        searchVisibility: settings.searchVisibility,
        allowSearchEngines: settings.allowSearchEngines,
        twoFactorRequired: settings.twoFactorRequired,
        sessionTimeout: settings.sessionTimeout,
        updatedAt: new Date(),
      },
      create: {
        userId: session.user.id,
        profileVisibility: settings.profileVisibility,
        showEmail: settings.showEmail,
        showPhone: settings.showPhone,
        showLocation: settings.showLocation,
        showOnlineStatus: settings.showOnlineStatus,
        allowDirectMessages: settings.allowDirectMessages,
        allowFriendRequests: settings.allowFriendRequests,
        showProjectsPublicly: settings.showProjectsPublicly,
        allowProjectSharing: settings.allowProjectSharing,
        dataCollection: settings.dataCollection,
        tracking: settings.tracking,
        notifications: settings.notifications,
        searchVisibility: settings.searchVisibility,
        allowSearchEngines: settings.allowSearchEngines,
        twoFactorRequired: settings.twoFactorRequired,
        sessionTimeout: settings.sessionTimeout,
      },
    });

    // Log privacy settings change for audit
    await prisma.userAuditLog.create({
      data: {
        userId: session.user.id,
        action: "PRIVACY_SETTINGS_UPDATED",
        details: {
          changedSettings: Object.keys(settings),
          timestamp: new Date().toISOString(),
          ipAddress: request.headers.get("x-forwarded-for") || "unknown",
          userAgent: request.headers.get("user-agent") || "unknown",
        },
        ipAddress: request.headers.get("x-forwarded-for") || "unknown",
        userAgent: request.headers.get("user-agent") || "unknown",
      },
    });

    return NextResponse.json({ 
      success: true, 
      message: "Privacy settings updated successfully" 
    });

  } catch (error) {
    console.error("Privacy settings update error:", error);
    return NextResponse.json(
      { error: "Failed to update privacy settings" },
      { status: 500 }
    );
  }
}
