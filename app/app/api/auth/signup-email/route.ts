/**
 * Email Signup API Route
 * Creates account and sends temporary password via email
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendTemporaryPasswordEmail, sendWelcomeEmail } from '@/lib/email';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, name } = body;

    if (!email || !name) {
      return NextResponse.json(
        { success: false, error: 'Email and name are required' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await prisma.users.findUnique({
      where: { email }
    });

    if (existingUser) {
      return NextResponse.json(
        { success: false, error: 'An account with this email already exists' },
        { status: 400 }
      );
    }

    // Generate temporary password (8 characters, alphanumeric)
    const tempPassword = crypto.randomBytes(4).toString('hex') + 
                        crypto.randomInt(1000, 9999).toString();
    
    // Hash the password
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    // Create user account
    const user = await prisma.users.create({
      data: {
        id: crypto.randomUUID(),
        email,
        name,
        password: hashedPassword,
        emailVerified: false, // Will be verified when they first login
        subscription: 'free',
        role: 'user',
        isActive: true,
        updatedAt: new Date(),
      }
    });

    // Create user quota
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    await prisma.user_quota.create({
      data: {
        id: crypto.randomUUID(),
        userId: user.id,
        sessionsPerDay: 6,
        sessionsUsedToday: 0,
        tokensPerSession: 10000,
        periodStart: now,
        periodEnd: endOfDay,
        lastResetAt: now,
        requestsLimit: 1000,
        requestsUsed: 0,
        createdAt: now,
        updatedAt: now,
      }
    });

    // Send temporary password email
    await sendTemporaryPasswordEmail(email, tempPassword);

    // ✅ Send welcome email to new user
    await sendWelcomeEmail(email, name);

    console.log(`✅ Account created for ${email}, welcome and temporary password emails sent`);

    return NextResponse.json({
      success: true,
      message: 'Account created successfully! Check your email for your temporary password and welcome message.',
      email
    });

  } catch (error: any) {
    console.error('Email signup error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create account. Please try again.' },
      { status: 500 }
    );
  }
}
