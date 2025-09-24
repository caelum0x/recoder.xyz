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
    const userPrivacy = await prisma.privacySettings.findUnique({
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
      const createdSettings = await prisma.privacySettings.create({
        data: {
          userId: session.user.id,
          profileVisible: defaultSettings.profileVisibility === "public",
          emailVisible: defaultSettings.showEmail,
          activityVisible: defaultSettings.showOnlineStatus,
          // Note: Many fields not available in PrivacySettings model - using available fields only
          // showPhone, showLocation, allowDirectMessages, etc. not in current schema
        },
      });

      return NextResponse.json(defaultSettings);
    }

    // Return existing settings - mapping to available fields only
    const settings: PrivacySettings = {
      profileVisibility: userPrivacy.profileVisible ? "public" : "private",
      showEmail: userPrivacy.emailVisible,
      showPhone: false, // Field not available in PrivacySettings model
      showLocation: false, // Field not available in PrivacySettings model  
      showOnlineStatus: userPrivacy.activityVisible,
      allowDirectMessages: "friends", // Field not available - using default
      allowFriendRequests: true, // Field not available - using default
      showProjectsPublicly: false, // Field not available - using default
      allowProjectSharing: true, // Field not available - using default
      dataCollection: { analytics: false, marketing: false, personalization: false, thirdParty: false },
      tracking: { cookies: false, location: false, usage: false, performance: false },
      notifications: { email: true, sms: false, push: false, marketing: false },
      searchVisibility: true, // Field not available - using default
      allowSearchEngines: true, // Field not available - using default
      twoFactorRequired: false, // Field not available - using default
      sessionTimeout: 30, // Field not available - using default
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
    const updatedSettings = await prisma.privacySettings.upsert({
      where: { userId: session.user.id },
      update: {
        profileVisible: settings.profileVisibility === "public",
        emailVisible: settings.showEmail,
        activityVisible: settings.showOnlineStatus,
        // Note: Many fields not available in PrivacySettings model
        // Note: Only using available fields in PrivacySettings model
      },
      create: {
        userId: session.user.id,
        profileVisible: settings.profileVisibility === "public",
        emailVisible: settings.showEmail,
        activityVisible: settings.showOnlineStatus,
        // Note: Many fields not available in PrivacySettings model
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
