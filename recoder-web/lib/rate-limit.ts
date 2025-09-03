import { NextRequest } from 'next/server';

interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

// Simple in-memory store for rate limiting
// In production, you'd want to use Redis or a proper rate limiting service
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export async function rateLimit(
  request: NextRequest,
  identifier: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
  const key = `${identifier}:${ip}`;
  const now = Date.now();
  
  // Clean up expired entries
  const entries = Array.from(rateLimitStore.entries());
  for (const [k, v] of entries) {
    if (v.resetTime <= now) {
      rateLimitStore.delete(k);
    }
  }
  
  const existing = rateLimitStore.get(key);
  
  if (!existing || existing.resetTime <= now) {
    // First request in window or window expired
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + windowMs
    });
    
    return {
      success: true,
      limit,
      remaining: limit - 1,
      reset: now + windowMs
    };
  }
  
  if (existing.count >= limit) {
    // Rate limit exceeded
    return {
      success: false,
      limit,
      remaining: 0,
      reset: existing.resetTime
    };
  }
  
  // Increment count
  existing.count++;
  rateLimitStore.set(key, existing);
  
  return {
    success: true,
    limit,
    remaining: limit - existing.count,
    reset: existing.resetTime
  };
}

export default rateLimit;
