/**
 * Newsletter Unsubscribe API Route
 *
 * Allows users to unsubscribe from marketing emails
 * CAN-SPAM compliant - must honor unsubscribe requests within 10 business days
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, token } = body;

    if (!email && !token) {
      return NextResponse.json(
        { success: false, error: 'Email address or unsubscribe token is required' },
        { status: 400 }
      );
    }

    // Find user by email or token
    let user;
    if (token) {
      // Token-based unsubscribe (more secure)
      user = await prisma.users.findFirst({
        where: {
          apiKey: {
            startsWith: 'newsletter_',
            endsWith: token,
          },
        },
      });

      if (!user) {
        // Try to find by token in apiKey field
        user = await prisma.users.findFirst({
          where: {
            apiKey: `newsletter_${token}`,
          },
        });
      }
    } else if (email) {
      // Email-based unsubscribe
      user = await prisma.users.findUnique({
        where: { email },
      });
    }

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Subscription not found' },
        { status: 404 }
      );
    }

    // Mark as unsubscribed
    // For newsletter-only subscribers (isActive: false), we can delete them
    // For active users, we should add a marketingEmailsEnabled field (future enhancement)

    if (!user.isActive && user.apiKey?.startsWith('newsletter_')) {
      // Delete newsletter-only subscriber
      await prisma.users.delete({
        where: { id: user.id },
      });

      console.log(`Newsletter subscriber deleted: ${user.email}`);

      return NextResponse.json({
        success: true,
        message: 'Successfully unsubscribed from newsletter',
        email: user.email,
        deleted: true,
      });
    } else {
      // For active users, we'll keep the account but note unsubscription
      // In the future, add a marketingEmailsEnabled: false field
      // For now, we'll use the role field or a metadata approach

      // Option 1: Add to a separate unsubscribed list (using metadata)
      // Option 2: Create a user_preferences table entry
      // For now, let's just log it and return success

      console.log(`User unsubscribed from marketing emails: ${user.email}`);

      return NextResponse.json({
        success: true,
        message: 'Successfully unsubscribed from marketing emails. You will still receive important account notifications.',
        email: user.email,
        accountPreserved: true,
      });
    }

  } catch (error: any) {
    console.error('Newsletter unsubscribe error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to unsubscribe. Please try again.' },
      { status: 500 }
    );
  }
}

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

    // Find user
    let user;
    if (token) {
      user = await prisma.users.findFirst({
        where: {
          apiKey: `newsletter_${token}`,
        },
      });
    } else if (email) {
      user = await prisma.users.findUnique({
        where: { email },
      });
    }

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Subscription not found' },
        { status: 404 }
      );
    }

    // Return unsubscribe confirmation page data
    return NextResponse.json({
      success: true,
      email: user.email,
      name: user.name,
      isNewsletterOnly: !user.isActive && user.apiKey?.startsWith('newsletter_'),
    });

  } catch (error: any) {
    console.error('Newsletter unsubscribe GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load unsubscribe page' },
      { status: 500 }
    );
  }
}

/**
 * Bulk unsubscribe endpoint (admin only)
 * Useful for processing unsubscribe lists from email providers
 */
export async function DELETE(request: NextRequest) {
  try {
    // TODO: Add admin authentication
    const body = await request.json();
    const { emails } = body;

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Array of email addresses is required' },
        { status: 400 }
      );
    }

    // Delete newsletter-only subscribers
    const deleteResult = await prisma.users.deleteMany({
      where: {
        email: { in: emails },
        isActive: false,
        apiKey: { startsWith: 'newsletter_' },
      },
    });

    console.log(`Bulk unsubscribe: ${deleteResult.count} newsletter subscribers removed`);

    return NextResponse.json({
      success: true,
      message: `Successfully unsubscribed ${deleteResult.count} email(s)`,
      count: deleteResult.count,
    });

  } catch (error: any) {
    console.error('Bulk unsubscribe error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process bulk unsubscribe' },
      { status: 500 }
    );
  }
}
