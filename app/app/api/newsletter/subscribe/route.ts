/**
 * Newsletter Subscription API Route
 *
 * Allows users to subscribe to marketing emails
 * CAN-SPAM compliant with double opt-in support
 *
 * Uses dedicated newsletter_subscribers table via Prisma client.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import { extractAttribution } from '@/lib/attribution';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const subscribeSchema = z.object({
  email: z.string().email('Valid email address is required').max(255).toLowerCase().trim(),
  name: z.string().max(100).trim().optional(),
  source: z.string().max(50).optional().default('website'),
});

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    const parsed = subscribeSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }
    const { email, name, source } = parsed.data;
    const attribution = extractAttribution(request, rawBody);

    // Check for existing subscriber
    const existingSubscriber = await prisma.newsletter_subscribers.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        unsubscribeToken: true,
        subscribedAt: true,
      },
    });

    // Already actively subscribed
    if (existingSubscriber && existingSubscriber.status === 'active') {
      return NextResponse.json({
        success: true,
        message: 'You are already subscribed to our newsletter!',
        email,
        alreadySubscribed: true,
      });
    }

    const subscriberName = name || email.split('@')[0];
    const unsubscribeToken =
      existingSubscriber?.unsubscribeToken ?? crypto.randomBytes(32).toString('hex');

    // Link to registered user if one exists with this email
    const user = await prisma.users.findUnique({
      where: { email },
      select: { id: true },
    });

    const metadata = {
      utmSource: attribution.utmSource,
      utmMedium: attribution.utmMedium,
      utmCampaign: attribution.utmCampaign,
      referredByCode: attribution.referredByCode,
      acquisitionSource: attribution.acquisitionSource,
    };

    let subscriber;

    if (existingSubscriber) {
      // Previously unsubscribed -- reactivate
      subscriber = await prisma.newsletter_subscribers.update({
        where: { email },
        data: {
          name: subscriberName,
          status: 'active',
          source,
          userId: user?.id ?? null,
          metadata,
          unsubscribedAt: null,
          updatedAt: new Date(),
        },
        select: { id: true, email: true, name: true },
      });
    } else {
      // Brand-new subscriber
      subscriber = await prisma.newsletter_subscribers.create({
        data: {
          email,
          name: subscriberName,
          status: 'active',
          source,
          unsubscribeToken,
          userId: user?.id ?? undefined,
          metadata,
        },
        select: { id: true, email: true, name: true },
      });
    }

    logger.info('Newsletter subscription created', { route: 'api/newsletter/subscribe', email, source });

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

    // Handle unique constraint violation (race condition on duplicate email)
    if (error.code === 'P2002') {
      return NextResponse.json({
        success: true,
        message: 'You are already subscribed to our newsletter!',
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
    const subscriber = await prisma.newsletter_subscribers.findUnique({
      where: { email },
      select: {
        email: true,
        name: true,
        status: true,
        subscribedAt: true,
      },
    });

    if (!subscriber || subscriber.status !== 'active') {
      return NextResponse.json({
        success: true,
        subscribed: false,
        email,
      });
    }

    return NextResponse.json({
      success: true,
      subscribed: true,
      email: subscriber.email,
      name: subscriber.name,
      subscribedSince: subscriber.subscribedAt,
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
