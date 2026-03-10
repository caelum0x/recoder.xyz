/**
 * User Profile Settings API
 * GET - Fetch profile settings
 * PUT - Update profile settings
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { rateLimit, rateLimitConfigs } from '@/lib/middleware/rate-limit';

const apiRateLimiter = rateLimit(rateLimitConfigs.api);

// GET /api/settings/profile - Get user profile settings
export async function GET(request: NextRequest) {
  const rateLimitResponse = await apiRateLimiter(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const session = await getSession(request);

    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Fetch profile settings from database
    const profile = await prisma.$queryRaw`
      SELECT
        display_name,
        bio,
        company,
        location,
        website,
        avatar_url,
        github_username,
        twitter_username,
        linkedin_username,
        public_profile
      FROM user_profiles
      WHERE user_id = ${session.user.id}
    `;

    // If no profile exists, create default
    if (!profile || (Array.isArray(profile) && profile.length === 0)) {
      await prisma.$executeRaw`
        INSERT INTO user_profiles (user_id)
        VALUES (${session.user.id})
        ON CONFLICT (user_id) DO NOTHING
      `;

      return NextResponse.json({
        success: true,
        profile: {
          display_name: session.user.name || null,
          bio: null,
          company: null,
          location: null,
          website: null,
          avatar_url: session.user.image || null,
          github_username: null,
          twitter_username: null,
          linkedin_username: null,
          public_profile: true
        }
      });
    }

    return NextResponse.json({
      success: true,
      profile: Array.isArray(profile) ? profile[0] : profile
    });

  } catch (error) {
    logger.error('[Profile Settings GET] Error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch profile' },
      { status: 500 }
    );
  }
}

// PUT /api/settings/profile - Update profile settings
export async function PUT(request: NextRequest) {
  const rateLimitResponse = await apiRateLimiter(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const session = await getSession(request);

    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      display_name,
      bio,
      company,
      location,
      website,
      avatar_url,
      github_username,
      twitter_username,
      linkedin_username,
      public_profile
    } = body;

    // Update profile
    await prisma.$executeRaw`
      INSERT INTO user_profiles (
        user_id, display_name, bio, company, location, website,
        avatar_url, github_username, twitter_username, linkedin_username, public_profile
      )
      VALUES (
        ${session.user.id}, ${display_name}, ${bio}, ${company}, ${location}, ${website},
        ${avatar_url}, ${github_username}, ${twitter_username}, ${linkedin_username}, ${public_profile}
      )
      ON CONFLICT (user_id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        bio = EXCLUDED.bio,
        company = EXCLUDED.company,
        location = EXCLUDED.location,
        website = EXCLUDED.website,
        avatar_url = EXCLUDED.avatar_url,
        github_username = EXCLUDED.github_username,
        twitter_username = EXCLUDED.twitter_username,
        linkedin_username = EXCLUDED.linkedin_username,
        public_profile = EXCLUDED.public_profile,
        updated_at = NOW()
    `;

    return NextResponse.json({
      success: true,
      message: 'Profile updated successfully'
    });

  } catch (error) {
    logger.error('[Profile Settings PUT] Error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { success: false, error: 'Failed to update profile' },
      { status: 500 }
    );
  }
}
