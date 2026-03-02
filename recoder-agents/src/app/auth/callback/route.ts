import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  hasSessionCookie as _hasSessionCookie,
  extractSessionToken,
} from '@recoder/auth/edge';

/**
 * Auth Callback Route - Web Handler
 *
 * Handles authentication callbacks for web browsers.
 * better-auth handles session creation via its own `/api/auth/callback/*` routes.
 * This route handles post-auth logic: referral codes, terms acceptance, billing check.
 *
 * Flow:
 * - Magic link click -> better-auth verifies & sets session cookie -> redirects here
 * - This route checks subscription status and redirects accordingly
 */

function hasSessionCookie(request: NextRequest): boolean {
  return _hasSessionCookie(
    (name) => request.cookies.get(name)?.value ?? null,
  );
}

function getSessionToken(request: NextRequest): string | null {
  return extractSessionToken(
    (name) => request.cookies.get(name)?.value ?? null,
  );
}

/**
 * Validate that a redirect target is a safe same-origin path.
 * Rejects protocol-relative URLs (//evil.com), absolute URLs (https://...),
 * and @ tricks (/@evil.com) that could cause open redirects.
 */
function sanitizeRedirectPath(path: string): string {
  const trimmed = path.trim()
  if (
    !trimmed.startsWith('/') ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('/\\') ||
    trimmed.includes('@') ||
    trimmed.includes(':')
  ) {
    return '/dashboard'
  }
  return trimmed
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const rawNext = searchParams.get('returnUrl') || searchParams.get('redirect') || '/dashboard'
  const next = sanitizeRedirectPath(rawNext)
  const termsAccepted = searchParams.get('terms_accepted') === 'true'
  const email = searchParams.get('email') || ''

  const requestOrigin = request.nextUrl.origin
  const baseUrl = requestOrigin || process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'
  const error = searchParams.get('error')
  const errorCode = searchParams.get('error_code')
  const errorDescription = searchParams.get('error_description')

  // Handle errors FIRST
  if (error) {
    console.error('Auth callback error:', error, errorCode, errorDescription)

    // Better Auth error codes for expired/invalid magic links and tokens
    const isExpiredOrInvalid =
      errorCode === 'expired_token' ||
      errorCode === 'token_expired' ||
      errorCode === 'invalid_token' ||
      errorCode === 'MAGIC_LINK_EXPIRED' ||
      error?.toLowerCase().includes('expired') ||
      error?.toLowerCase().includes('invalid') ||
      errorDescription?.toLowerCase().includes('expired') ||
      errorDescription?.toLowerCase().includes('invalid')

    if (isExpiredOrInvalid) {
      const expiredUrl = new URL(`${baseUrl}/auth`)
      expiredUrl.searchParams.set('expired', 'true')
      if (email) expiredUrl.searchParams.set('email', email)
      if (next) expiredUrl.searchParams.set('returnUrl', next)
      return NextResponse.redirect(expiredUrl)
    }

    return NextResponse.redirect(`${baseUrl}/auth?error=${encodeURIComponent(error)}`)
  }

  // Check if user is authenticated (better-auth already set the session cookie)
  if (!hasSessionCookie(request)) {
    // No session — redirect to auth page
    return NextResponse.redirect(`${baseUrl}/auth`)
  }

  let finalDestination = next
  let shouldClearReferralCookie = false
  const authEvent = 'login'
  const authMethod = 'email'
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || ''
  const sessionToken = getSessionToken(request)

  // Handle referral code from cookie
  const pendingReferralCode = request.cookies.get('pending-referral-code')?.value
  if (pendingReferralCode && sessionToken && backendUrl) {
    try {
      const response = await fetch(`${backendUrl}/v1/auth/update-metadata`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ referral_code: pendingReferralCode }),
      })
      if (response.ok) {
        shouldClearReferralCookie = true
      } else {
        console.warn('Referral metadata update failed with status:', response.status)
      }
    } catch (err) {
      console.error('Failed to save referral code:', err)
    }
  }

  // Handle terms acceptance
  if (termsAccepted && sessionToken && backendUrl) {
    try {
      const response = await fetch(`${backendUrl}/v1/auth/update-metadata`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ terms_accepted_at: new Date().toISOString() }),
      })
      if (!response.ok) {
        console.warn('Terms metadata update failed with status:', response.status)
      }
    } catch (err) {
      console.warn('Failed to save terms acceptance:', err)
    }
  }

  // Check billing/subscription status via backend
  if (sessionToken && backendUrl) {
    try {
      const billingRes = await fetch(`${backendUrl}/v1/billing/account-state/minimal`, {
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
        },
      })

      if (billingRes.ok) {
        const billing = await billingRes.json()
        const tierKey = billing?.subscription?.tier_key || billing?.tier?.name
        const hasSubscription =
          billing?.has_subscription === true ||
          (typeof tierKey === 'string' && tierKey !== 'none')
        if (!hasSubscription) {
          finalDestination = '/setting-up'
        }
      }
    } catch (err) {
      // Non-fatal: continue to dashboard if billing check fails
      console.warn('Billing check failed in callback:', err)
    }
  }

  // Build redirect URL with auth event params for client-side tracking
  const redirectUrl = new URL(`${baseUrl}${finalDestination}`)
  redirectUrl.searchParams.set('auth_event', authEvent)
  redirectUrl.searchParams.set('auth_method', authMethod)
  const response = NextResponse.redirect(redirectUrl)

  if (shouldClearReferralCookie) {
    response.cookies.set('pending-referral-code', '', { maxAge: 0, path: '/' })
  }

  return response
}
