// User profile update API endpoint
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { userManager } from '@/lib/user-management';
import { z } from 'zod';
import rateLimit from '@/lib/rate-limit';

// Rate limiting for profile updates - 10 requests per minute
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 500,
});

const profileUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  username: z.string()
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, hyphens, and underscores')
    .min(2)
    .max(30)
    .optional(),
  bio: z.string().max(500).optional(),
  phone: z.string().max(20).optional(),
  location: z.string().max(100).optional(),
  website: z.string().url().or(z.literal('')).optional(),
  company: z.string().max(100).optional(),
  jobTitle: z.string().max(100).optional(),
  timezone: z.string().max(50).optional(),
  language: z.string().max(10).optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 10, 'profile-update');
    } catch {
      return Response.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await auth();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    
    // Validate input
    let validatedData;
    try {
      validatedData = profileUpdateSchema.parse(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return Response.json(
          { 
            error: 'Validation failed', 
            details: error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
          },
          { status: 400 }
        );
      }
      throw error;
    }

    // Check if username is already taken (if updating username)
    if (validatedData.username) {
      const existingUser = await userManager.getUserByUsername(validatedData.username);
      if (existingUser && existingUser.id !== session.user.id) {
        return Response.json(
          { error: 'Username is already taken' },
          { status: 409 }
        );
      }
    }

    // Update profile with validated data
    const success = await userManager.updateUserProfile(session.user.id, {
      ...validatedData,
      updated_at: new Date(),
    });

    if (!success) {
      return Response.json(
        { error: 'Failed to update profile' },
        { status: 500 }
      );
    }

    // Get updated profile
    const updatedProfile = await userManager.getUserProfile(session.user.id);
    
    if (!updatedProfile) {
      return Response.json(
        { error: 'Failed to retrieve updated profile' },
        { status: 500 }
      );
    }

    // Log the update for security audit
    console.log(`Profile updated for user ${session.user.id}:`, {
      userId: session.user.id,
      updatedFields: Object.keys(validatedData),
      timestamp: new Date().toISOString(),
      userAgent: request.headers.get('user-agent'),
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
    });

    return Response.json({
      message: 'Profile updated successfully',
      profile: {
        id: updatedProfile.id,
        email: updatedProfile.email,
        name: updatedProfile.name,
        username: updatedProfile.username,
        bio: updatedProfile.bio,
        phone: updatedProfile.phone || '',
        location: updatedProfile.location,
        website: updatedProfile.website || '',
        company: updatedProfile.company,
        jobTitle: updatedProfile.job_title || '',
        timezone: updatedProfile.timezone || 'UTC',
        language: updatedProfile.language || 'en',
        avatar: updatedProfile.avatar_url,
        emailVerified: updatedProfile.email_verified,
        phoneVerified: updatedProfile.phone_verified || false,
        createdAt: updatedProfile.created_at.toISOString(),
        lastLoginAt: updatedProfile.last_login_at?.toISOString() || updatedProfile.updated_at.toISOString(),
        updatedAt: updatedProfile.updated_at.toISOString(),
      }
    });

  } catch (error) {
    console.error('Profile update error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const runtime = "edge";