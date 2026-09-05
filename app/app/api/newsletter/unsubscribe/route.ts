/**
 * Newsletter / Marketing Unsubscribe API Route
 *
 * Allows recipients to unsubscribe from ALL marketing emails.
 * Uses the `newsletter_subscribers` table as the marketing suppression list
 * (the same list scheduleWinbackEmails consults before scheduling sends).
 * CAN-SPAM/KVKK compliant - must honor unsubscribe requests, including from
 * winback recipients who never had a newsletter_subscribers row.
 *
 * Flow:
 *   GET  - NEVER mutates. Renders a minimal confirmation page with a POST
 *          button (safe against mail-scanner link prefetch). The link in
 *          email footers carries an HMAC signature (`sig`) so the page also
 *          works for recipients with no subscriber row.
 *   POST - Performs the unsubscribe. For emails with no subscriber row a
 *          suppression row (status 'unsubscribed') is CREATED - but only when
 *          the request carries a valid signature or stored token, so third
 *          parties cannot suppress arbitrary addresses.
 *
 * Records are never deleted; status is set to 'unsubscribed' and
 * `unsubscribedAt` is stamped. Main user accounts are never affected.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { rateLimit, rateLimitConfigs } from '@/lib/middleware/rate-limit';
import { verifyUnsubscribeSignature } from '@/lib/email/unsubscribe-token';

const publicRateLimiter = rateLimit(rateLimitConfigs.public);

const emailSchema = z.string().email().max(255).trim().toLowerCase();

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function htmlResponse(body: string, status = 200): NextResponse {
  const page = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>Unsubscribe - Recoder.xyz</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #000; color: #fff; margin: 0; padding: 40px 20px; }
      .card { max-width: 480px; margin: 40px auto; background: #111; border: 1px solid #333; border-radius: 16px; padding: 40px 32px; text-align: center; }
      h1 { font-size: 24px; margin: 0 0 16px; }
      p { color: #ccc; line-height: 1.6; }
      .email { color: #f97316; font-weight: 600; word-break: break-all; }
      button { display: inline-block; padding: 14px 36px; background: linear-gradient(135deg, #f97316 0%, #9333ea 100%); color: #fff; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; margin-top: 16px; }
      a { color: #999; }
      .muted { color: #666; font-size: 13px; margin-top: 24px; }
    </style>
  </head>
  <body>
    <div class="card">${body}</div>
  </body>
</html>`;

  return new NextResponse(page, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function renderConfirmPage(email: string, sig: string | null, token: string | null): NextResponse {
  const safeEmail = escapeHtml(email);
  return htmlResponse(`
    <h1>Unsubscribe from marketing emails</h1>
    <p>Click the button below to stop receiving marketing emails at
      <span class="email">${safeEmail}</span>.
      Your Recoder account (if you have one) is not affected.</p>
    <form method="post" action="/api/newsletter/unsubscribe">
      <input type="hidden" name="email" value="${safeEmail}" />
      ${sig ? `<input type="hidden" name="sig" value="${escapeHtml(sig)}" />` : ''}
      ${token ? `<input type="hidden" name="token" value="${escapeHtml(token)}" />` : ''}
      <button type="submit">Unsubscribe</button>
    </form>
    <p class="muted">Changed your mind? Just close this page.</p>
  `);
}

function renderDonePage(email: string): NextResponse {
  return htmlResponse(`
    <h1>You're unsubscribed</h1>
    <p><span class="email">${escapeHtml(email)}</span> will no longer receive
      marketing emails from Recoder.xyz. Transactional emails (receipts,
      security notices) are unaffected.</p>
    <p class="muted">Unsubscribed by mistake?
      <a href="https://recoder.xyz/settings/notifications">Manage email preferences</a></p>
  `);
}

function renderInvalidPage(): NextResponse {
  return htmlResponse(
    `
    <h1>Unsubscribe link not valid</h1>
    <p>This unsubscribe link is invalid or incomplete. Please use the
      unsubscribe link from the footer of a recent email, or contact
      <a href="mailto:support@recoder.xyz">support@recoder.xyz</a> and we will
      remove you manually.</p>
  `,
    404,
  );
}

interface UnsubscribeInput {
  email: string | null;
  token: string | null;
  sig: string | null;
  wantsHtml: boolean;
}

async function parsePostInput(request: NextRequest): Promise<UnsubscribeInput> {
  const contentType = request.headers.get('content-type') || '';

  if (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
  ) {
    const form = await request.formData();
    const read = (key: string): string | null => {
      const value = form.get(key);
      return typeof value === 'string' && value.length > 0 ? value : null;
    };
    return { email: read('email'), token: read('token'), sig: read('sig'), wantsHtml: true };
  }

  const body = await request.json();
  return {
    email: typeof body.email === 'string' && body.email ? body.email : null,
    token: typeof body.token === 'string' && body.token ? body.token : null,
    sig: typeof body.sig === 'string' && body.sig ? body.sig : null,
    wantsHtml: false,
  };
}

/** Find a subscriber row by stored token or by email (any stored casing). */
async function findSubscriber(email: string | null, token: string | null) {
  if (token) {
    const byToken = await prisma.newsletter_subscribers.findUnique({
      where: { unsubscribeToken: token },
      select: { id: true, email: true, name: true, status: true, userId: true },
    });
    if (byToken) return byToken;
  }

  if (email) {
    return prisma.newsletter_subscribers.findFirst({
      where: { email: { in: [...new Set([email, email.toLowerCase()])] } },
      select: { id: true, email: true, name: true, status: true, userId: true },
    });
  }

  return null;
}

// ---------------------------------------------------------------------------
// POST /api/newsletter/unsubscribe
// Body (JSON or form-encoded): { email?, token?, sig? }
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const rateLimitResponse = await publicRateLimiter(request);
  if (rateLimitResponse) return rateLimitResponse;

  let wantsHtml = false;
  try {
    const input = await parsePostInput(request);
    wantsHtml = input.wantsHtml;
    const { token, sig } = input;

    if (!input.email && !token) {
      return NextResponse.json(
        { success: false, error: 'Email address or unsubscribe token is required' },
        { status: 400 },
      );
    }

    let email: string | null = null;
    if (input.email) {
      const parsed = emailSchema.safeParse(input.email);
      if (!parsed.success && !token) {
        return NextResponse.json(
          { success: false, error: 'Valid email address is required' },
          { status: 400 },
        );
      }
      email = parsed.success ? parsed.data : null;
    }

    const subscriber = await findSubscriber(email, token);

    // Already unsubscribed - return success without re-updating
    if (subscriber && subscriber.status === 'unsubscribed') {
      if (wantsHtml) return renderDonePage(subscriber.email);
      return NextResponse.json({
        success: true,
        message: 'Already unsubscribed from newsletter',
        email: subscriber.email,
        accountPreserved: true,
      });
    }

    if (subscriber) {
      // Mark as unsubscribed (soft-delete only, record is preserved)
      await prisma.newsletter_subscribers.update({
        where: { id: subscriber.id },
        data: {
          status: 'unsubscribed',
          unsubscribedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      if (wantsHtml) return renderDonePage(subscriber.email);
      return NextResponse.json({
        success: true,
        message: 'Successfully unsubscribed from newsletter',
        email: subscriber.email,
        accountPreserved: true,
      });
    }

    // No subscriber row (e.g. a winback recipient who never joined the
    // newsletter). Honor the opt-out by CREATING a suppression row - the
    // marketing suppression list the winback scheduler checks. Requires a
    // valid signature so third parties cannot suppress arbitrary addresses.
    if (email && verifyUnsubscribeSignature(email, sig)) {
      const linkedUser = await prisma.users.findUnique({
        where: { email },
        select: { id: true },
      });

      const now = new Date();
      await prisma.newsletter_subscribers.upsert({
        where: { email },
        create: {
          email,
          status: 'unsubscribed',
          source: 'unsubscribe_link',
          unsubscribeToken: crypto.randomBytes(32).toString('hex'),
          userId: linkedUser?.id ?? null,
          unsubscribedAt: now,
          updatedAt: now,
        },
        update: {
          status: 'unsubscribed',
          unsubscribedAt: now,
          updatedAt: now,
        },
      });

      if (wantsHtml) return renderDonePage(email);
      return NextResponse.json({
        success: true,
        message: 'Successfully unsubscribed from marketing emails',
        email,
        accountPreserved: true,
      });
    }

    if (wantsHtml) return renderInvalidPage();
    return NextResponse.json(
      { success: false, error: 'Subscription not found' },
      { status: 404 },
    );
  } catch (error) {
    console.error('Newsletter unsubscribe error:', error);
    if (wantsHtml) {
      return htmlResponse(
        `<h1>Something went wrong</h1>
         <p>We could not process your unsubscribe request. Please try again, or
         email <a href="mailto:support@recoder.xyz">support@recoder.xyz</a>.</p>`,
        500,
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to unsubscribe. Please try again.' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/newsletter/unsubscribe?email=...&sig=...   (winback footer links)
// GET /api/newsletter/unsubscribe?token=...           (stored subscriber token)
//
// NEVER mutates. Renders a confirmation page whose POST button performs the
// actual unsubscribe, so mail-scanner prefetch cannot opt anyone out.
// Requests with Accept: application/json get the legacy JSON preview.
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawEmail = searchParams.get('email');
    const token = searchParams.get('token');
    const sig = searchParams.get('sig');

    const accept = request.headers.get('accept') || '';
    const wantsJson = accept.includes('application/json') && !accept.includes('text/html');

    if (!rawEmail && !token) {
      if (wantsJson) {
        return NextResponse.json(
          { success: false, error: 'Email address or token is required' },
          { status: 400 },
        );
      }
      return renderInvalidPage();
    }

    const parsedEmail = rawEmail ? emailSchema.safeParse(rawEmail) : null;
    const email = parsedEmail?.success ? parsedEmail.data : null;

    const subscriber = await findSubscriber(email, token);
    const signatureValid = email !== null && verifyUnsubscribeSignature(email, sig);

    // The page is shown when we can attribute the link to a real recipient:
    // a stored subscriber row (token/email lookup) or a validly signed link.
    const tokenValid = token !== null && subscriber !== null;
    const canConfirm = tokenValid || signatureValid || (email !== null && subscriber !== null);

    if (wantsJson) {
      if (!subscriber && !signatureValid) {
        return NextResponse.json(
          { success: false, error: 'Subscription not found' },
          { status: 404 },
        );
      }
      return NextResponse.json({
        success: true,
        email: subscriber?.email ?? email,
        name: subscriber?.name ?? null,
        isNewsletterOnly: subscriber ? !subscriber.userId : false,
        status: subscriber?.status ?? 'not_subscribed',
      });
    }

    if (!canConfirm) {
      return renderInvalidPage();
    }

    const displayEmail = subscriber?.email ?? email;
    if (!displayEmail) return renderInvalidPage();

    if (subscriber?.status === 'unsubscribed') {
      return renderDonePage(displayEmail);
    }

    return renderConfirmPage(displayEmail, sig, tokenValid ? token : null);
  } catch (error) {
    console.error('Newsletter unsubscribe GET error:', error);
    return htmlResponse(
      `<h1>Something went wrong</h1>
       <p>We could not load the unsubscribe page. Please try again, or email
       <a href="mailto:support@recoder.xyz">support@recoder.xyz</a>.</p>`,
      500,
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
