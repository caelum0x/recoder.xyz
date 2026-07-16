/**
 * Newsletter Unsubscribe API Route
 *
 * Allows users to unsubscribe from marketing emails.
 * Uses the `newsletter_subscribers` table exclusively.
 * CAN-SPAM compliant - must honor unsubscribe requests within 10 business days.
 *
 * Records are never deleted; status is set to 'unsubscribed' and
 * `unsubscribedAt` is stamped. Main user accounts are never affected.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, rateLimitConfigs } from '@/lib/middleware/rate-limit';

const publicRateLimiter = rateLimit(rateLimitConfigs.public);

// ---------------------------------------------------------------------------
// POST /api/newsletter/unsubscribe
// Body: { email?: string; token?: string }
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const rateLimitResponse = await publicRateLimiter(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    const { email, token } = body;

    if (!email && !token) {
      return NextResponse.json(
        { success: false, error: 'Email address or unsubscribe token is required' },
        { status: 400 }
      );
    }

    // Find subscriber by token or email using typed Prisma client
    let subscriber = token
      ? await prisma.newsletter_subscribers.findUnique({
          where: { unsubscribeToken: token },
          select: { id: true, email: true, status: true },
        })
      : null;

    if (!subscriber && email) {
      subscriber = await prisma.newsletter_subscribers.findUnique({
        where: { email },
        select: { id: true, email: true, status: true },
      });
    }

    if (!subscriber) {
      return NextResponse.json(
        { success: false, error: 'Subscription not found' },
        { status: 404 }
      );
    }

    // Already unsubscribed – return success without re-updating
    if (subscriber.status === 'unsubscribed') {
      return NextResponse.json({
        success: true,
        message: 'Already unsubscribed from newsletter',
        email: subscriber.email,
        accountPreserved: true,
      });
    }

    // Mark as unsubscribed (soft-delete only, record is preserved)
    await prisma.newsletter_subscribers.update({
      where: { id: subscriber.id },
      data: {
        status: 'unsubscribed',
        unsubscribedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Successfully unsubscribed from newsletter',
      email: subscriber.email,
      accountPreserved: true,
    });
  } catch (error) {
    console.error('Newsletter unsubscribe error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to unsubscribe. Please try again.' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/newsletter/unsubscribe?email=...&token=...
// Returns confirmation page data so the frontend can render a preview.
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    const token = searchParams.get('token');

    if (!email && !token) {
      return NextResponse.json(
        { success: false, error: 'Email address or token is required' },
        { status: 400 }
      );
    }

    // Find subscriber by token or email
    let subscriber = token
      ? await prisma.newsletter_subscribers.findUnique({
          where: { unsubscribeToken: token },
          select: { email: true, name: true, status: true, userId: true },
        })
      : null;

    if (!subscriber && email) {
      subscriber = await prisma.newsletter_subscribers.findUnique({
        where: { email },
        select: { email: true, name: true, status: true, userId: true },
      });
    }

    if (!subscriber) {
      return NextResponse.json(
        { success: false, error: 'Subscription not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      email: subscriber.email,
      name: subscriber.name,
      isNewsletterOnly: !subscriber.userId,
      status: subscriber.status,
    });
  } catch (error) {
    console.error('Newsletter unsubscribe GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load unsubscribe page' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/newsletter/unsubscribe  (admin-only bulk unsubscribe)
// Body: { emails: string[] }
// ---------------------------------------------------------------------------
export async function DELETE(request: NextRequest) {
  try {
    const { requireAuth } = await import('@/lib/auth-helpers');
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.response;

    // Only allow admin users to perform bulk operations
    if (authResult.user?.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { emails } = body;

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Array of email addresses is required' },
        { status: 400 }
      );
    }

    // Bulk mark as unsubscribed in newsletter_subscribers only
    const updateResult = await prisma.newsletter_subscribers.updateMany({
      where: {
        email: { in: emails },
        status: { not: 'unsubscribed' },
      },
      data: {
        status: 'unsubscribed',
        unsubscribedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Successfully unsubscribed ${updateResult.count} email(s)`,
      count: updateResult.count,
    });
  } catch (error) {
    console.error('Bulk unsubscribe error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process bulk unsubscribe' },
      { status: 500 }
    );
  }
}
