// GitHub OAuth callback handler
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';

interface GitHubUser {
  id: number;
  login: string;
  name: string;
  email: string;
  avatar_url: string;
  public_repos: number;
  followers: number;
  following: number;
}

interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  description: string;
  language: string;
  stargazers_count: number;
  forks_count: number;
  updated_at: string;
}

// GET /api/auth/callback/github - Handle GitHub OAuth callback
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    // Check for OAuth errors
    if (error) {
      console.error('GitHub OAuth error:', error);
      return redirect(`/settings/integrations?error=github_${error}`);
    }

    if (!code || !state) {
      console.error('Missing code or state in GitHub callback');
      return redirect('/settings/integrations?error=missing_params');
    }

    // Verify state and get user info
    const stateData = await verifyOAuthState(state);
    if (!stateData) {
      console.error('Invalid OAuth state');
      return redirect('/settings/integrations?error=invalid_state');
    }

    // Verify current session matches the state
    const session = await auth();
    if (!session?.user?.id || session.user.id !== stateData.userId) {
      console.error('Session mismatch in OAuth callback');
      return redirect('/settings/integrations?error=session_mismatch');
    }

    // Exchange code for access token
    const tokenData = await exchangeCodeForToken(code);
    if (!tokenData) {
      console.error('Failed to exchange code for token');
      return redirect('/settings/integrations?error=token_exchange_failed');
    }

    // Get user info from GitHub
    const githubUser = await getGitHubUser(tokenData.access_token);
    if (!githubUser) {
      console.error('Failed to get GitHub user info');
      return redirect('/settings/integrations?error=user_info_failed');
    }

    // Get user's repositories (limited for performance)
    const repositories = await getUserRepositories(tokenData.access_token);

    // Create or update GitHub integration
    await createGitHubIntegration({
      userId: session.user.id,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenType: tokenData.token_type,
      scope: tokenData.scope,
      githubUser,
      repositories: repositories.slice(0, 50), // Limit to 50 repos for initial sync
    });

    // Clean up OAuth state
    await cleanupOAuthState(state);

    // Redirect back to integrations page with success
    return redirect('/settings/integrations?success=github_connected');

  } catch (error) {
    console.error('GitHub OAuth callback error:', error);
    return redirect('/settings/integrations?error=callback_failed');
  }
}

// Helper functions
async function verifyOAuthState(state: string): Promise<{ userId: string; type: string } | null> {
  try {
    // In production, verify against stored state in Redis/database
    const decoded = JSON.parse(Buffer.from(state, 'base64').toString());
    
    // Check if state is not expired (15 minutes)
    const now = Date.now();
    const stateAge = now - decoded.timestamp;
    if (stateAge > 15 * 60 * 1000) {
      return null; // Expired
    }

    return {
      userId: decoded.userId,
      type: decoded.type
    };
  } catch (error) {
    console.error('Error verifying OAuth state:', error);
    return null;
  }
}

async function exchangeCodeForToken(code: string): Promise<{
  access_token: string;
  token_type: string;
  scope: string;
  refresh_token?: string;
} | null> {
  try {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('GitHub OAuth credentials not configured');
    }

    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
      }),
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`);
    }

    return data;
  } catch (error) {
    console.error('Error exchanging code for token:', error);
    return null;
  }
}

async function getGitHubUser(accessToken: string): Promise<GitHubUser | null> {
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Recoder-App/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const user = await response.json();
    
    // Get user email if not public
    if (!user.email) {
      const emailResponse = await fetch('https://api.github.com/user/emails', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Recoder-App/1.0',
        },
      });

      if (emailResponse.ok) {
        const emails = await emailResponse.json();
        const primaryEmail = emails.find((e: any) => e.primary);
        user.email = primaryEmail?.email;
      }
    }

    return user;
  } catch (error) {
    console.error('Error getting GitHub user:', error);
    return null;
  }
}

async function getUserRepositories(accessToken: string): Promise<GitHubRepository[]> {
  try {
    const response = await fetch('https://api.github.com/user/repos?sort=updated&per_page=50', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Recoder-App/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting GitHub repositories:', error);
    return [];
  }
}

async function createGitHubIntegration(data: {
  userId: string;
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  scope: string;
  githubUser: GitHubUser;
  repositories: GitHubRepository[];
}): Promise<void> {
  try {
    // In production, this would create/update records in the database
    const integration = {
      id: `github-${data.githubUser.id}`,
      userId: data.userId,
      type: 'github',
      name: 'GitHub',
      connected: true,
      status: 'active',
      connectedAt: new Date().toISOString(),
      config: {
        githubUserId: data.githubUser.id,
        username: data.githubUser.login,
        name: data.githubUser.name,
        email: data.githubUser.email,
        avatarUrl: data.githubUser.avatar_url,
        publicRepos: data.githubUser.public_repos,
        followers: data.githubUser.followers,
        following: data.githubUser.following,
        permissions: data.scope.split(','),
        repositoryCount: data.repositories.length,
      },
      // Encrypted access token (in production)
      accessToken: data.accessToken, // Would be encrypted
      refreshToken: data.refreshToken,
      tokenType: data.tokenType,
      lastSync: new Date().toISOString(),
    };

    // Store integration
    console.log('GitHub integration created:', {
      ...integration,
      accessToken: '[REDACTED]',
      refreshToken: '[REDACTED]'
    });

    // Store repository data separately (in production)
    console.log(`Synced ${data.repositories.length} repositories for user ${data.userId}`);

    // Log integration event
    await logIntegrationEvent(data.userId, 'github_connected', {
      githubUsername: data.githubUser.login,
      repositoryCount: data.repositories.length,
      permissions: data.scope,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Error creating GitHub integration:', error);
    throw error;
  }
}

async function cleanupOAuthState(state: string): Promise<void> {
  try {
    // In production, remove state from Redis/database
    console.log(`OAuth state cleaned up: ${state}`);
  } catch (error) {
    console.error('Error cleaning up OAuth state:', error);
  }
}

async function logIntegrationEvent(userId: string, event: string, metadata: any): Promise<void> {
  try {
    // In production, this would write to audit log table
    console.log(`Integration Event - User ${userId}: ${event}`, metadata);
  } catch (error) {
    console.error('Failed to log integration event:', error);
  }
}

export const runtime = "nodejs";