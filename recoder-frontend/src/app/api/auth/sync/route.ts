/**
 * Cross-domain session sync receiver for recoder-frontend
 *
 * Receives JWT sync tokens from recoder.xyz (main app) and sets a
 * cross-domain cookie so users don't need to sign in separately.
 *
 * - GET:    Check if a sync cookie exists and is valid
 * - POST:   Receive a Bearer token, verify JWT, set sync cookie
 * - DELETE:  Clear the sync cookie (logout propagation)
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const SYNC_COOKIE_NAME = "recoder-session-sync";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

function getSyncSecret(): string | undefined {
  return (
    process.env.SESSION_SYNC_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.JWT_SECRET
  );
}

/** Minimal HMAC-SHA256 JWT verification (Node.js built-in, no deps). */
function verifyJwt(token: string, secret: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;

    // Verify HMAC-SHA256 signature
    const expected = crypto
      .createHmac("sha256", secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest("base64url");

    // Normalise base64url (strip trailing '=')
    const normalise = (s: string) => s.replace(/=+$/, "");
    if (normalise(expected) !== normalise(signatureB64)) return null;

    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf-8")
    );

    // Check expiry
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

// ── GET — check sync status ──────────────────────────────────────────
export async function GET(request: NextRequest) {
  const cookieToken = request.cookies.get(SYNC_COOKIE_NAME)?.value;

  if (!cookieToken) {
    return NextResponse.json({ synced: false, sessionData: null, timestamp: Date.now() });
  }

  const secret = getSyncSecret();
  if (!secret) {
    return NextResponse.json({ synced: false, sessionData: null, timestamp: Date.now() });
  }

  const payload = verifyJwt(cookieToken, secret);
  if (!payload) {
    return NextResponse.json({ synced: false, sessionData: null, timestamp: Date.now() });
  }

  return NextResponse.json({
    synced: true,
    sessionData: {
      userId: payload.userId,
      email: payload.email,
      name: payload.name,
      image: payload.image,
      plan: payload.plan,
    },
    timestamp: Date.now(),
  });
}

// ── POST — receive and set sync token ────────────────────────────────
export async function POST(request: NextRequest) {
  // Verify origin header
  const syncOrigin = request.headers.get("x-sync-origin");
  if (!syncOrigin) {
    return NextResponse.json({ error: "Missing sync origin" }, { status: 403 });
  }

  const secret = getSyncSecret();
  if (!secret) {
    return NextResponse.json({ error: "Sync secret not configured" }, { status: 500 });
  }

  // Extract Bearer token
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const payload = verifyJwt(token, secret);
  if (!payload) {
    return NextResponse.json({ error: "Invalid or expired sync token" }, { status: 401 });
  }

  // Set cross-domain cookie
  const response = NextResponse.json({
    success: true,
    synced: true,
    timestamp: Date.now(),
  });

  response.cookies.set(SYNC_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "none",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
    domain: ".recoder.xyz",
  });

  return response;
}

// ── DELETE — clear sync cookie (logout propagation) ──────────────────
export async function DELETE() {
  const response = NextResponse.json({
    success: true,
    action: "logout",
    timestamp: Date.now(),
  });

  response.cookies.set(SYNC_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "none",
    maxAge: 0,
    path: "/",
    domain: ".recoder.xyz",
  });

  return response;
}
