import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    console.log('Guest auth route called - redirecting to login for now');
    
    const { searchParams } = new URL(request.url);
    const redirectUrl = searchParams.get('redirectUrl') || '/';
    
    // For now, redirect to login instead of trying to create guest user
    // This prevents the database errors and infinite loops
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', redirectUrl);
    
    return NextResponse.redirect(loginUrl);
  } catch (error) {
    console.error('Guest auth error:', error);
    return NextResponse.redirect(new URL('/login', request.url));
  }
}
