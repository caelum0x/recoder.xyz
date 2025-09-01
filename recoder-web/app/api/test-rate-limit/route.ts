import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, validateApiKey, generateSecureHeaders } from '@/lib/security';

export async function GET(request: NextRequest) {
  try {
    // Test rate limiting
    const rateLimiter = rateLimit(5, 60 * 1000); // 5 requests per minute for testing
    if (!rateLimiter(request)) {
      return NextResponse.json(
        { 
          success: false,
          error: 'rate_limit_exceeded',
          message: 'Rate limit exceeded: 5 requests per minute' 
        },
        { 
          status: 429,
          headers: generateSecureHeaders()
        }
      );
    }

    // Test API key validation (optional)
    const hasApiKey = request.headers.get('x-api-key');
    let apiKeyValid = false;
    if (hasApiKey) {
      apiKeyValid = validateApiKey(request);
    }

    return NextResponse.json({
      success: true,
      message: 'Rate limit test passed',
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      timestamp: new Date().toISOString(),
      apiKeyProvided: !!hasApiKey,
      apiKeyValid: apiKeyValid,
      headers: {
        userAgent: request.headers.get('user-agent'),
        origin: request.headers.get('origin')
      }
    }, {
      headers: generateSecureHeaders()
    });

  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500, headers: generateSecureHeaders() }
    );
  }
}