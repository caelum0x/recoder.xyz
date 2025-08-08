/**
 * Unified Auth API Routes
 * Provides authentication endpoints that work across all Recoder platforms
 */

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { UnifiedAuthService, UnifiedUser } from './unified-auth-middleware';

// Database interfaces (replace with your actual DB)
interface DatabaseUser {
  id: string;
  email: string;
  password?: string;
  name?: string;
  avatar?: string;
  subscription_plan: 'free' | 'pro' | 'enterprise';
  subscription_status: 'active' | 'cancelled' | 'expired';
  subscription_expires_at?: string;
  permissions: string[];
  created_at: string;
  updated_at: string;
  last_active_at: string;
}

// Mock database (replace with actual database queries)
const mockUsers: Map<string, DatabaseUser> = new Map();

/**
 * POST /api/auth/register - Register new user
 */
export async function registerUser(request: NextRequest): Promise<NextResponse> {
  try {
    const { email, password, name, platform = 'web' } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Check if user already exists
    for (const user of mockUsers.values()) {
      if (user.email === email) {
        return NextResponse.json(
          { error: 'User already exists' },
          { status: 409 }
        );
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);
    const userId = `user_${Date.now()}`;
    const now = new Date().toISOString();

    // Create user in database
    const newUser: DatabaseUser = {
      id: userId,
      email,
      password: hashedPassword,
      name,
      subscription_plan: 'free',
      subscription_status: 'active',
      permissions: ['read', 'write'],
      created_at: now,
      updated_at: now,
      last_active_at: now
    };

    mockUsers.set(userId, newUser);

    // Create unified session
    const authService = UnifiedAuthService.getInstance();
    const session = await authService.createUnifiedSession({
      id: userId,
      email,
      name,
      subscription: {
        plan: 'free',
        status: 'active'
      },
      permissions: ['read', 'write'],
      createdAt: now
    }, platform);

    // Set cookies
    const response = NextResponse.json({
      success: true,
      user: session.user,
      unifiedToken: session.unifiedToken
    });

    response.cookies.set('unified-auth-token', session.unifiedToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 // 30 days
    });

    response.cookies.set('platform-auth-token', session.platformToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 // 7 days
    });

    return response;

  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/auth/login - Login user
 */
export async function loginUser(request: NextRequest): Promise<NextResponse> {
  try {
    const { email, password, platform = 'web' } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Find user in database
    let foundUser: DatabaseUser | null = null;
    for (const user of mockUsers.values()) {
      if (user.email === email) {
        foundUser = user;
        break;
      }
    }

    if (!foundUser || !foundUser.password) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Verify password
    const isValid = await bcrypt.compare(password, foundUser.password);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Update last active
    foundUser.last_active_at = new Date().toISOString();
    mockUsers.set(foundUser.id, foundUser);

    // Create unified session
    const authService = UnifiedAuthService.getInstance();
    const session = await authService.createUnifiedSession({
      id: foundUser.id,
      email: foundUser.email,
      name: foundUser.name,
      avatar: foundUser.avatar,
      subscription: {
        plan: foundUser.subscription_plan,
        status: foundUser.subscription_status,
        expiresAt: foundUser.subscription_expires_at
      },
      permissions: foundUser.permissions,
      createdAt: foundUser.created_at
    }, platform);

    // Set cookies
    const response = NextResponse.json({
      success: true,
      user: session.user,
      unifiedToken: session.unifiedToken
    });

    response.cookies.set('unified-auth-token', session.unifiedToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 // 30 days
    });

    response.cookies.set('platform-auth-token', session.platformToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 // 7 days
    });

    return response;

  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/auth/session - Get current session
 */
export async function getSession(request: NextRequest): Promise<NextResponse> {
  try {
    const authService = UnifiedAuthService.getInstance();
    
    // Get token from cookies or headers
    let token = request.cookies.get('unified-auth-token')?.value;
    
    if (!token) {
      token = request.headers.get('authorization')?.replace('Bearer ', '');
    }

    if (!token) {
      return NextResponse.json({ user: null }, { status: 200 });
    }

    // Validate session
    const session = await authService.validateUnifiedSession(token);
    
    if (!session) {
      // Clear invalid cookies
      const response = NextResponse.json({ user: null }, { status: 200 });
      response.cookies.delete('unified-auth-token');
      response.cookies.delete('platform-auth-token');
      return response;
    }

    return NextResponse.json({
      user: session.user,
      expiresAt: session.expiresAt
    });

  } catch (error) {
    console.error('Session error:', error);
    return NextResponse.json({ user: null }, { status: 200 });
  }
}

/**
 * POST /api/auth/logout - Logout user
 */
export async function logoutUser(request: NextRequest): Promise<NextResponse> {
  try {
    const authService = UnifiedAuthService.getInstance();
    
    // Get user ID from session
    const token = request.cookies.get('unified-auth-token')?.value;
    if (token) {
      const session = await authService.validateUnifiedSession(token);
      if (session) {
        await authService.logout(session.user.id);
      }
    }

    // Clear cookies
    const response = NextResponse.json({ success: true });
    response.cookies.delete('unified-auth-token');
    response.cookies.delete('platform-auth-token');
    response.cookies.delete('next-auth.session-token');

    return response;

  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/auth/sync - Sync user across platforms
 */
export async function syncUserAcrossPlatforms(request: NextRequest): Promise<NextResponse> {
  try {
    const authService = UnifiedAuthService.getInstance();
    const { userId, updates } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    await authService.syncUserAcrossPlatforms(userId, updates);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/auth/stats - Get authentication stats
 */
export async function getAuthStats(request: NextRequest): Promise<NextResponse> {
  try {
    const authService = UnifiedAuthService.getInstance();
    
    const stats = {
      totalUsers: mockUsers.size,
      activeSessions: authService.getActiveSessionCount(),
      platformDistribution: {
        web: 0,
        chat: 0
      },
      subscriptionDistribution: {
        free: 0,
        pro: 0,
        enterprise: 0
      }
    };

    // Calculate platform and subscription distribution
    for (const user of mockUsers.values()) {
      if (user.subscription_plan) {
        stats.subscriptionDistribution[user.subscription_plan]++;
      }
    }

    return NextResponse.json(stats);

  } catch (error) {
    console.error('Stats error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Initialize demo users for testing
 */
export async function initializeDemoUsers(): Promise<void> {
  const now = new Date().toISOString();
  const hashedPassword = await bcrypt.hash('demo123', 12);

  // Demo user 1: Free tier
  mockUsers.set('demo-user-1', {
    id: 'demo-user-1',
    email: 'demo@recoder.xyz',
    password: hashedPassword,
    name: 'Demo User',
    subscription_plan: 'free',
    subscription_status: 'active',
    permissions: ['read', 'write'],
    created_at: now,
    updated_at: now,
    last_active_at: now
  });

  // Demo user 2: Pro tier
  mockUsers.set('demo-user-2', {
    id: 'demo-user-2',
    email: 'pro@recoder.xyz',
    password: hashedPassword,
    name: 'Pro User',
    subscription_plan: 'pro',
    subscription_status: 'active',
    permissions: ['read', 'write', 'deploy', 'ai-advanced'],
    created_at: now,
    updated_at: now,
    last_active_at: now
  });

  console.log('✅ Demo users initialized');
  console.log('📧 demo@recoder.xyz / demo123');
  console.log('📧 pro@recoder.xyz / demo123');
}

// Initialize demo users on module load
initializeDemoUsers().catch(console.error);