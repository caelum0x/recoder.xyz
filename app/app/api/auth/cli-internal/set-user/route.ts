import { NextRequest, NextResponse } from 'next/server';

// In-memory storage for auth codes and user mapping
const authCodeUsers = new Map<string, {
  user_id: string;
  user_email: string;
  user_name: string;
  created_at: Date;
}>();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, user_id, user_email, user_name } = body;

    if (!code || !user_id) {
      return NextResponse.json({
        success: false,
        error: 'missing_parameters'
      }, { status: 400 });
    }

    // Store user info for this auth code
    authCodeUsers.set(code, {
      user_id,
      user_email: user_email || `user-${user_id}@recoder.xyz`,
      user_name: user_name || 'CLI User',
      created_at: new Date()
    });

    // Clean up old entries (older than 10 minutes)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    for (const [key, value] of authCodeUsers.entries()) {
      if (value.created_at < tenMinutesAgo) {
        authCodeUsers.delete(key);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'User info stored for auth code'
    });

  } catch (error) {
    console.error('Set user error:', error);
    return NextResponse.json({
      success: false,
      error: 'server_error'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json({
      success: false,
      error: 'missing_code'
    }, { status: 400 });
  }

  const userInfo = authCodeUsers.get(code);
  if (!userInfo) {
    return NextResponse.json({
      success: false,
      error: 'code_not_found'
    }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    user: userInfo
  });
}
