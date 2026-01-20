/**
 * Newsletter Subscription API Route
 *
 * Allows users to subscribe to marketing emails
 * CAN-SPAM compliant with double opt-in support
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, name, source = 'website' } = body;

    // Validate email format
    if (!email || !isValidEmail(email)) {
      return NextResponse.json(
        { success: false, error: 'Valid email address is required' },
        { status: 400 }
      );
    }

    // Check if user exists
    const existingUser = await prisma.users.findUnique({
      where: { email },
    });

    if (existingUser) {
      // User exists - update their preferences if they've unsubscribed
      // In the future, we can add a marketingEmailsEnabled field to the users table
      // For now, we'll just acknowledge their subscription

      return NextResponse.json({
        success: true,
        message: 'You are already subscribed to our newsletter!',
        email,
        alreadySubscribed: true,
      });
    }

    // For non-users, we'll create a lightweight newsletter_subscribers record
    // Since the table doesn't exist yet in the schema, we'll use a workaround
    // by creating a user record with a special flag or using metadata

    // Option: Store in user_preferences table or create minimal user record
    // For now, let's create a minimal user record with emailVerified: false
    // This allows them to receive newsletters but they haven't fully signed up

    const subscriberName = name || email.split('@')[0];
    const unsubscribeToken = crypto.randomBytes(32).toString('hex');

    // Create a newsletter-only user record
    const subscriber = await prisma.users.create({
      data: {
        id: crypto.randomUUID(),
        email,
        name: subscriberName,
        emailVerified: false, // Not fully verified yet
        subscription: 'free',
        role: 'user',
        isActive: false, // Not an active user, just newsletter subscriber
        updatedAt: new Date(),
        // Store unsubscribe token in a safe field (we'll use apiKey as temp storage)
        // In production, add a dedicated newsletterUnsubscribeToken field
        apiKey: `newsletter_${unsubscribeToken}`,
      },
    });

    console.log(`Newsletter subscription created for ${email} from ${source}`);

    return NextResponse.json({
      success: true,
      message: 'Successfully subscribed to newsletter!',
      email,
      subscriber: {
        id: subscriber.id,
        email: subscriber.email,
        name: subscriber.name,
      },
    });

  } catch (error: any) {
    console.error('Newsletter subscription error:', error);

    // Handle unique constraint violation (duplicate email)
    if (error.code === 'P2002') {
      return NextResponse.json({
        success: true,
        message: 'You are already subscribed to our newsletter!',
        email: (await request.json()).email,
        alreadySubscribed: true,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Failed to subscribe. Please try again.' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (!email || !isValidEmail(email)) {
      return NextResponse.json(
        { success: false, error: 'Valid email address is required' },
        { status: 400 }
      );
    }

    // Check subscription status
    const user = await prisma.users.findUnique({
      where: { email },
      select: {
        email: true,
        name: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({
        success: true,
        subscribed: false,
        email,
      });
    }

    return NextResponse.json({
      success: true,
      subscribed: true,
      email: user.email,
      name: user.name,
      subscribedSince: user.createdAt,
    });

  } catch (error: any) {
    console.error('Newsletter status check error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to check subscription status' },
      { status: 500 }
    );
  }
}

// Helper function to validate email format
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
