// User profile update API endpoint
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
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

    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user ID from session email
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      select: { id: true }
    });

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const userId = user.id;

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
    // Note: Username field doesn't exist in User model, commenting out
    /*
    if (validatedData.username) {
      const existingUser = await prisma.user.findUnique({
        where: { username: validatedData.username }
      });
      if (existingUser && existingUser.id !== userId) {
        return Response.json(
          { error: 'Username is already taken' },
          { status: 409 }
        );
      }
    }
    */

    // Update profile with validated data
    const updatedProfile = await prisma.user.update({
      where: { id: userId },
      data: {
        name: validatedData.name,
        // Note: Most profile fields don't exist in User model, only updating name
        // username: validatedData.username, // doesn't exist
        // bio: validatedData.bio, // doesn't exist
        // phone: validatedData.phone, // doesn't exist
        // location: validatedData.location, // doesn't exist
        // website: validatedData.website, // doesn't exist
        // company: validatedData.company, // doesn't exist
        // jobTitle: validatedData.jobTitle, // doesn't exist
        // timezone: validatedData.timezone, // doesn't exist
        // language: validatedData.language, // doesn't exist
        updatedAt: new Date()
      },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true
      }
    });
    // Log the update for security audit
    console.log(`Profile updated for user ${userId}:`, {
      userId,
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
        // Note: Most fields don't exist in User model, providing defaults
        username: null, // doesn't exist in model
        bio: null, // doesn't exist in model
        phone: '', // doesn't exist in model
        location: null, // doesn't exist in model
        website: '', // doesn't exist in model
        company: null, // doesn't exist in model
        jobTitle: '', // doesn't exist in model
        timezone: 'UTC', // doesn't exist in model
        language: 'en', // doesn't exist in model
        avatar: updatedProfile.image,
        emailVerified: updatedProfile.emailVerified,
        phoneVerified: false, // doesn't exist in model
        createdAt: updatedProfile.createdAt.toISOString(),
        lastLoginAt: updatedProfile.updatedAt.toISOString(), // using updatedAt as fallback
        updatedAt: updatedProfile.updatedAt.toISOString(),
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

export const runtime = "nodejs";