// User profile API endpoint for Recoder Web
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { userManager } from '@/lib/user-management';

interface ExtendedUserProfile {
  id: string;
  email: string;
  name: string;
  username?: string;
  bio?: string;
  avatar?: string;
  location?: string;
  website?: string;
  company?: string;
  timezone: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  socialLinks: {
    github?: string;
    twitter?: string;
    linkedin?: string;
    website?: string;
  };
  preferences: {
    theme: "light" | "dark" | "system";
    language: string;
    publicProfile: boolean;
    showEmail: boolean;
    showLocation: boolean;
  };
  createdAt: string;
  lastLoginAt: string;
}

export async function GET() {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const profile = await userManager.getUserProfile(session.user.id);
    
    if (!profile) {
      // Create a default profile from session data
      const defaultProfile: ExtendedUserProfile = {
        id: session.user.id,
        email: session.user.email || '',
        name: session.user.name || '',
        username: '',
        bio: '',
        avatar: undefined,
        location: '',
        website: '',
        company: '',
        timezone: 'UTC',
        emailVerified: session.user.emailVerified || false,
        twoFactorEnabled: false,
        socialLinks: {},
        preferences: {
          theme: 'system',
          language: 'en',
          publicProfile: true,
          showEmail: false,
          showLocation: true,
        },
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };
      
      return Response.json(defaultProfile);
    }

    // Map base profile to extended profile format
    const fullProfile: ExtendedUserProfile = {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      username: profile.username || '',
      bio: profile.bio || '',
      avatar: profile.avatar_url,
      location: profile.location || '',
      website: '', // Not in base profile, would need to be added
      company: profile.company || '',
      timezone: 'UTC', // Not in base profile, would need to be added
      emailVerified: profile.email_verified,
      twoFactorEnabled: false, // Not in base profile, would need to be added
      socialLinks: {
        github: '',
        twitter: '',
        linkedin: '',
        website: '',
      },
      preferences: {
        theme: 'system',
        language: 'en',
        publicProfile: true,
        showEmail: false,
        showLocation: true,
      },
      createdAt: profile.created_at.toISOString(),
      lastLoginAt: profile.last_login_at?.toISOString() || profile.updated_at.toISOString(),
    };

    return Response.json(fullProfile);
  } catch (error) {
    console.error('Profile API error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const updates = await request.json();
    
    // Validate and sanitize input
    const allowedFields = [
      'name', 'username', 'bio', 'location', 'website', 'company', 
      'timezone', 'avatar', 'socialLinks', 'preferences'
    ];
    
    const validUpdates: any = {};
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        if (key === 'socialLinks' && typeof value === 'object' && value !== null) {
          // Validate social links
          const allowedSocialFields = ['github', 'twitter', 'linkedin', 'website'];
          validUpdates.socialLinks = {};
          for (const [socialKey, socialValue] of Object.entries(value as object)) {
            if (allowedSocialFields.includes(socialKey) && typeof socialValue === 'string') {
              validUpdates.socialLinks[socialKey] = socialValue;
            }
          }
        } else if (key === 'preferences' && typeof value === 'object' && value !== null) {
          // Validate preferences
          const allowedPrefFields = ['theme', 'language', 'publicProfile', 'showEmail', 'showLocation'];
          validUpdates.preferences = {};
          for (const [prefKey, prefValue] of Object.entries(value as object)) {
            if (allowedPrefFields.includes(prefKey)) {
              if (prefKey === 'theme' && ['light', 'dark', 'system'].includes(prefValue as string)) {
                validUpdates.preferences[prefKey] = prefValue;
              } else if (prefKey === 'language' && typeof prefValue === 'string') {
                validUpdates.preferences[prefKey] = prefValue;
              } else if (['publicProfile', 'showEmail', 'showLocation'].includes(prefKey) && typeof prefValue === 'boolean') {
                validUpdates.preferences[prefKey] = prefValue;
              }
            }
          }
        } else if (typeof value === 'string' || typeof value === 'boolean') {
          // Basic field validation
          if (key === 'bio' && (value as string).length > 500) {
            return Response.json({ error: 'Bio must be less than 500 characters' }, { status: 400 });
          }
          if (key === 'username' && !/^[a-zA-Z0-9_-]+$/.test(value as string)) {
            return Response.json({ error: 'Username can only contain letters, numbers, hyphens, and underscores' }, { status: 400 });
          }
          validUpdates[key] = value;
        }
      }
    }

    // Add updated timestamp
    validUpdates.updatedAt = new Date().toISOString();

    const success = await userManager.updateUserProfile(session.user.id, validUpdates);
    
    if (!success) {
      return Response.json({ error: 'Failed to update profile' }, { status: 500 });
    }

    // Return updated profile
    const updatedProfile = await userManager.getUserProfile(session.user.id);
    
    if (!updatedProfile) {
      return Response.json({ error: 'Failed to retrieve updated profile' }, { status: 500 });
    }
    
    // Format the response to match the expected structure
    const formattedProfile: ExtendedUserProfile = {
      id: updatedProfile.id,
      email: updatedProfile.email,
      name: updatedProfile.name,
      username: updatedProfile.username || '',
      bio: updatedProfile.bio || '',
      avatar: updatedProfile.avatar_url,
      location: updatedProfile.location || '',
      website: '', // Not in base profile
      company: updatedProfile.company || '',
      timezone: 'UTC', // Not in base profile
      emailVerified: updatedProfile.email_verified,
      twoFactorEnabled: false, // Not in base profile
      socialLinks: {
        github: '',
        twitter: '',
        linkedin: '',
        website: '',
      },
      preferences: {
        theme: 'system',
        language: 'en',
        publicProfile: true,
        showEmail: false,
        showLocation: true,
      },
      createdAt: updatedProfile.created_at.toISOString(),
      lastLoginAt: updatedProfile.last_login_at?.toISOString() || updatedProfile.updated_at.toISOString(),
    };
    
    return Response.json(formattedProfile);
  } catch (error) {
    console.error('Profile update error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}