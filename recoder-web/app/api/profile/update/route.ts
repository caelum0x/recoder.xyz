import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

const profileUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/).optional(),
  bio: z.string().max(500).optional(),
  location: z.string().max(100).optional(),
  company: z.string().max(100).optional(),
  blog: z.string().url().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).optional(),
  confirmPassword: z.string().optional()
}).refine((data) => {
  if (data.newPassword) {
    return data.currentPassword && data.confirmPassword && data.newPassword === data.confirmPassword;
  }
  return true;
}, {
  message: "Password confirmation is required when changing password",
  path: ["confirmPassword"]
});

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validatedData = profileUpdateSchema.parse(body);

    const userId = session.user.id;

    // Get current user data
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        password: true,
        name: true,
        bio: true,
        location: true,
        company: true,
        blog: true
      }
    });

    if (!currentUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Prepare update data
    const updateData: any = {};
    
    if (validatedData.name !== undefined) updateData.name = validatedData.name;
    if (validatedData.bio !== undefined) updateData.bio = validatedData.bio;
    if (validatedData.location !== undefined) updateData.location = validatedData.location;
    if (validatedData.company !== undefined) updateData.company = validatedData.company;
    if (validatedData.blog !== undefined) updateData.blog = validatedData.blog;

    // Handle email change
    if (validatedData.email && validatedData.email !== currentUser.email) {
      const existingUser = await prisma.user.findUnique({
        where: { email: validatedData.email }
      });
      
      if (existingUser) {
        return NextResponse.json(
          { error: 'Email already in use' },
          { status: 409 }
        );
      }
      
      updateData.email = validatedData.email;
      updateData.emailVerified = null; // Reset email verification
    }

    // Handle username change
    if (validatedData.username && validatedData.username !== currentUser.username) {
      const existingUsername = await prisma.user.findUnique({
        where: { username: validatedData.username }
      });
      
      if (existingUsername) {
        return NextResponse.json(
          { error: 'Username already taken' },
          { status: 409 }
        );
      }
      
      updateData.username = validatedData.username;
    }

    // Handle password change
    if (validatedData.newPassword && validatedData.currentPassword) {
      const isCurrentPasswordValid = await bcrypt.compare(
        validatedData.currentPassword, 
        currentUser.password
      );
      
      if (!isCurrentPasswordValid) {
        return NextResponse.json(
          { error: 'Current password is incorrect' },
          { status: 400 }
        );
      }
      
      const hashedNewPassword = await bcrypt.hash(validatedData.newPassword, 12);
      updateData.password = hashedNewPassword;
      updateData.passwordUpdatedAt = new Date();
    }

    updateData.updatedAt = new Date();

    // Update user profile
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        bio: true,
        location: true,
        company: true,
        blog: true,
        updatedAt: true,
        emailVerified: true
      }
    });

    // Log the profile update
    await prisma.userAuditLog.create({
      data: {
        userId,
        action: 'PROFILE_UPDATED',
        details: {
          updatedFields: Object.keys(updateData).filter(key => key !== 'updatedAt'),
          timestamp: new Date().toISOString()
        },
        ipAddress: request.headers.get('x-forwarded-for') || 
                  request.headers.get('x-real-ip') || 
                  'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown'
      }
    });

    // Create security event if sensitive data was changed
    const sensitiveFields = ['email', 'password'];
    const changedSensitiveFields = Object.keys(updateData).filter(field => 
      sensitiveFields.includes(field)
    );

    if (changedSensitiveFields.length > 0) {
      await prisma.securityEvent.create({
        data: {
          userId,
          eventType: 'profile_security_change',
          severity: 'medium',
          description: `User updated sensitive profile information: ${changedSensitiveFields.join(', ')}`,
          ip: request.headers.get('x-forwarded-for') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
          metadata: {
            changedFields: changedSensitiveFields,
            timestamp: new Date().toISOString()
          }
        }
      });
    }

    return NextResponse.json({
      success: true,
      user: updatedUser,
      message: 'Profile updated successfully',
      emailVerificationRequired: updateData.email ? true : false
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Profile update error:', error);
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        bio: true,
        location: true,
        company: true,
        blog: true,
        image: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
        mfaEnabled: true,
        twoFactorEnabled: true,
        lastLoginAt: true,
        passwordUpdatedAt: true,
        publicRepos: true,
        followers: true,
        following: true
      }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ user });

  } catch (error) {
    console.error('Profile fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch profile' },
      { status: 500 }
    );
  }
}