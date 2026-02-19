'use server';

import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { headers as getHeaders } from 'next/headers';

async function getAuthHeaders() {
  return await getHeaders();
}

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    const allowed = [
      process.env.NEXT_PUBLIC_URL,
      process.env.NEXT_PUBLIC_APP_URL,
    ].filter(Boolean);
    if (allowed.includes(origin)) return true;
    if (url.hostname === 'recoder.xyz' || url.hostname.endsWith('.recoder.xyz')) {
      return url.protocol === 'https:';
    }
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      return process.env.NODE_ENV !== 'production';
    }
    return false;
  } catch {
    return false;
  }
}

async function sendMagicLinkEmail(email: string, callbackURL: string) {
  const api = auth.api as unknown as {
    signInMagicLink: (input: {
      body: { email: string; callbackURL: string };
      headers: Awaited<ReturnType<typeof getAuthHeaders>>;
    }) => Promise<unknown>;
  };

  return api.signInMagicLink({
    body: { email, callbackURL },
    headers: await getAuthHeaders(),
  });
}

export async function signIn(prevState: any, formData: FormData) {
  const email = formData.get('email') as string;
  const returnUrl = formData.get('returnUrl') as string | undefined;
  const origin = formData.get('origin') as string;
  const acceptedTerms = formData.get('acceptedTerms') === 'true';
  const isDesktopApp = formData.get('isDesktopApp') === 'true';

  if (!email || !email.includes('@')) {
    return { message: 'Please enter a valid email address' };
  }

  if (!isDesktopApp && !isAllowedOrigin(origin)) {
    return { message: 'Invalid request origin' };
  }

  const normalizedEmail = email.trim().toLowerCase();

  let callbackURL: string;
  if (isDesktopApp && origin.startsWith('recoder://')) {
    const params = new URLSearchParams();
    if (acceptedTerms) {
      params.set('terms_accepted', 'true');
    }
    callbackURL = `recoder://auth/callback${params.toString() ? `?${params.toString()}` : ''}`;
  } else {
    callbackURL = `${origin}/auth/callback?returnUrl=${encodeURIComponent(returnUrl || '/dashboard')}&email=${encodeURIComponent(normalizedEmail)}${acceptedTerms ? '&terms_accepted=true' : ''}`;
  }

  const response = await sendMagicLinkEmail(normalizedEmail, callbackURL);

  if (!response) {
    return { message: 'Could not send magic link' };
  }

  return {
    success: true,
    message: 'Check your email for a magic link to sign in',
    email: normalizedEmail,
  };
}

export async function signUp(prevState: any, formData: FormData) {
  const origin = formData.get('origin') as string;
  const email = formData.get('email') as string;
  const returnUrl = formData.get('returnUrl') as string | undefined;
  const acceptedTerms = formData.get('acceptedTerms') === 'true';
  const isDesktopApp = formData.get('isDesktopApp') === 'true';

  if (!email || !email.includes('@')) {
    return { message: 'Please enter a valid email address' };
  }

  if (!acceptedTerms) {
    return { message: 'Please accept the terms and conditions' };
  }

  if (!isDesktopApp && !isAllowedOrigin(origin)) {
    return { message: 'Invalid request origin' };
  }

  const normalizedEmail = email.trim().toLowerCase();

  let callbackURL: string;
  if (isDesktopApp && origin.startsWith('recoder://')) {
    const params = new URLSearchParams();
    if (acceptedTerms) {
      params.set('terms_accepted', 'true');
    }
    callbackURL = `recoder://auth/callback${params.toString() ? `?${params.toString()}` : ''}`;
  } else {
    callbackURL = `${origin}/auth/callback?returnUrl=${encodeURIComponent(returnUrl || '/dashboard')}&email=${encodeURIComponent(normalizedEmail)}${acceptedTerms ? '&terms_accepted=true' : ''}`;
  }

  // Magic link auto-creates user if they don't exist
  const response = await sendMagicLinkEmail(normalizedEmail, callbackURL);

  if (!response) {
    return { message: 'Could not send magic link' };
  }

  return {
    success: true,
    message: 'Check your email for a magic link to complete sign up',
    email: normalizedEmail,
  };
}

export async function forgotPassword(prevState: any, formData: FormData) {
  const email = formData.get('email') as string;
  const origin = formData.get('origin') as string;

  if (!email || !email.includes('@')) {
    return { message: 'Please enter a valid email address' };
  }

  if (!isAllowedOrigin(origin)) {
    return { message: 'Invalid request origin' };
  }

  try {
    await auth.api.requestPasswordReset({
      body: {
        email: email.trim().toLowerCase(),
        redirectTo: `${origin}/auth/reset-password`,
      },
      headers: await getAuthHeaders(),
    });
  } catch {
    return { message: 'Could not send password reset email' };
  }

  return {
    success: true,
    message: 'Check your email for a password reset link',
  };
}

export async function resetPassword(prevState: any, formData: FormData) {
  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirmPassword') as string;
  const token = formData.get('token') as string;

  if (!password || password.length < 6) {
    return { message: 'Password must be at least 6 characters' };
  }

  if (password !== confirmPassword) {
    return { message: 'Passwords do not match' };
  }

  if (!token) {
    return { message: 'Invalid or missing reset token. Please request a new password reset link.' };
  }

  try {
    await auth.api.resetPassword({
      body: { newPassword: password, token },
      headers: await getAuthHeaders(),
    });
  } catch {
    return { message: 'Could not update password' };
  }

  return {
    success: true,
    message: 'Password updated successfully',
  };
}

export async function resendMagicLink(prevState: any, formData: FormData) {
  const email = formData.get('email') as string;
  const returnUrl = formData.get('returnUrl') as string | undefined;
  const origin = formData.get('origin') as string;
  const acceptedTerms = formData.get('acceptedTerms') === 'true';
  const isDesktopApp = formData.get('isDesktopApp') === 'true';

  if (!email || !email.includes('@')) {
    return { message: 'Please enter a valid email address' };
  }

  if (!isDesktopApp && !isAllowedOrigin(origin)) {
    return { message: 'Invalid request origin' };
  }

  const normalizedEmail = email.trim().toLowerCase();

  let callbackURL: string;
  if (isDesktopApp && origin.startsWith('recoder://')) {
    const params = new URLSearchParams();
    if (acceptedTerms) {
      params.set('terms_accepted', 'true');
    }
    callbackURL = `recoder://auth/callback${params.toString() ? `?${params.toString()}` : ''}`;
  } else {
    callbackURL = `${origin}/auth/callback?returnUrl=${encodeURIComponent(returnUrl || '/dashboard')}&email=${encodeURIComponent(normalizedEmail)}${acceptedTerms ? '&terms_accepted=true' : ''}`;
  }

  const response = await sendMagicLinkEmail(normalizedEmail, callbackURL);

  if (!response) {
    return { message: 'Could not send magic link' };
  }

  return {
    success: true,
    message: 'Check your email for a magic link to sign in',
    email: normalizedEmail,
  };
}

export async function signInWithPassword(prevState: any, formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const returnUrl = formData.get('returnUrl') as string | undefined;

  if (!email || !email.includes('@')) {
    return { message: 'Please enter a valid email address' };
  }

  if (!password || password.length < 6) {
    return { message: 'Password must be at least 6 characters' };
  }

  const response = await auth.api.signInEmail({
    body: {
      email: email.trim().toLowerCase(),
      password,
    },
    headers: await getAuthHeaders(),
    asResponse: true,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    return { message: body?.message || 'Invalid email or password' };
  }

  const finalReturnUrl = returnUrl || '/dashboard';
  const redirectUrl = new URL(finalReturnUrl, 'http://localhost');
  redirectUrl.searchParams.set('auth_event', 'login');
  redirectUrl.searchParams.set('auth_method', 'email');
  redirect(`${redirectUrl.pathname}${redirectUrl.search}`);
}

export async function signUpWithPassword(prevState: any, formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirmPassword') as string;
  const returnUrl = formData.get('returnUrl') as string | undefined;

  if (!email || !email.includes('@')) {
    return { message: 'Please enter a valid email address' };
  }

  if (!password || password.length < 6) {
    return { message: 'Password must be at least 6 characters' };
  }

  if (password !== confirmPassword) {
    return { message: 'Passwords do not match' };
  }

  const response = await auth.api.signUpEmail({
    body: {
      email: email.trim().toLowerCase(),
      password,
      name: email.split('@')[0],
    },
    headers: await getAuthHeaders(),
    asResponse: true,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    return { message: body?.message || 'Could not create account' };
  }

  const finalReturnUrl = returnUrl || '/dashboard';
  redirect(finalReturnUrl);
}

export async function signOut() {
  try {
    await fetch(`${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/api/auth/sign-out`, {
      method: 'POST',
      headers: {
        cookie: (await getHeaders()).get('cookie') || '',
      },
    });
  } catch {
    // Continue with redirect even if sign-out API fails
  }

  return redirect('/');
}
