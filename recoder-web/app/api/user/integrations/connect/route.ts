// Integration connection API endpoint (OAuth flows)
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { userManager } from '@/lib/user-management';
import { z } from 'zod';
import rateLimit from '@/lib/rate-limit';
import { v4 as uuidv4 } from 'uuid';

// Rate limiting for connection attempts
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 500,
});

const connectSchema = z.object({
  type: z.enum(['github', 'aws', 'gcp', 'azure', 'vercel', 'netlify', 'railway', 'render']),
  config: z.record(z.any()).optional(),
});

// OAuth configuration for different providers
const OAUTH_CONFIGS = {
  github: {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scopes: ['user:email', 'repo', 'read:org'],
    redirectUri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/github`
  },
  vercel: {
    clientId: process.env.VERCEL_CLIENT_ID,
    clientSecret: process.env.VERCEL_CLIENT_SECRET,
    authUrl: 'https://vercel.com/oauth/authorize',
    tokenUrl: 'https://api.vercel.com/v2/oauth/access_token',
    scopes: ['user', 'deployment:read', 'deployment:write'],
    redirectUri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/vercel`
  }
};

// POST /api/user/integrations/connect - Initiate OAuth connection
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 10, 'integration-connect');
    } catch {
      return Response.json(
        { error: 'Too many connection attempts. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await auth();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    
    // Validate input
    let validatedData;
    try {
      validatedData = connectSchema.parse(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return Response.json(
          { 
            error: 'Validation failed', 
            details: error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
          },
          { status: 400 }
        );
      }
      throw error;
    }

    const { type } = validatedData;

    // Check if integration is already connected
    const existingIntegration = await checkExistingIntegration(session.user.id, type);
    if (existingIntegration && existingIntegration.connected) {
      return Response.json(
        { error: `${type} integration is already connected` },
        { status: 409 }
      );
    }

    // Handle OAuth providers
    if (['github', 'vercel'].includes(type)) {
      const oauthConfig = OAUTH_CONFIGS[type as keyof typeof OAUTH_CONFIGS];
      
      if (!oauthConfig?.clientId) {
        return Response.json(
          { error: `${type} OAuth not configured` },
          { status: 501 }
        );
      }

      // Generate state for CSRF protection
      const state = generateOAuthState(session.user.id, type);
      
      // Store state temporarily (in production, use Redis or database)
      await storeOAuthState(state, session.user.id, type);

      // Build authorization URL
      const authUrl = new URL(oauthConfig.authUrl);
      authUrl.searchParams.set('client_id', oauthConfig.clientId);
      authUrl.searchParams.set('redirect_uri', oauthConfig.redirectUri);
      authUrl.searchParams.set('scope', oauthConfig.scopes.join(' '));
      authUrl.searchParams.set('state', state);
      
      if (type === 'github') {
        authUrl.searchParams.set('allow_signup', 'false');
      }

      return Response.json({
        authUrl: authUrl.toString(),
        state,
        message: `Redirecting to ${type} for authorization...`
      });
    }

    // Handle non-OAuth integrations (API key based)
    if (['aws', 'gcp', 'azure', 'railway', 'render', 'netlify'].includes(type)) {
      // For these integrations, we'd typically ask for API keys/credentials
      // and test the connection
      const connectionResult = await testApiKeyConnection(type, validatedData.config || {});
      
      if (connectionResult.success) {
        // Create or update integration record
        const integration = await createOrUpdateIntegration({
          userId: session.user.id,
          type,
          config: validatedData.config || {},
          connected: true,
          status: 'active'
        });

        return Response.json({
          integration,
          message: `${type} connected successfully`
        });
      } else {
        return Response.json(
          { error: connectionResult.error || `Failed to connect to ${type}` },
          { status: 400 }
        );
      }
    }

    return Response.json(
      { error: `Integration type ${type} not supported` },
      { status: 400 }
    );

  } catch (error) {
    console.error('Integration connection error:', error);
    return Response.json(
      { error: 'Failed to initiate connection' },
      { status: 500 }
    );
  }
}

// Helper functions
async function checkExistingIntegration(userId: string, type: string): Promise<{ connected: boolean } | null> {
  try {
    // In production, query integrations table
    return null; // No existing integration
  } catch (error) {
    console.error('Error checking existing integration:', error);
    return null;
  }
}

function generateOAuthState(userId: string, type: string): string {
  const stateData = {
    userId,
    type,
    timestamp: Date.now(),
    nonce: uuidv4()
  };
  
  // In production, encrypt this data
  return Buffer.from(JSON.stringify(stateData)).toString('base64');
}

async function storeOAuthState(state: string, userId: string, type: string): Promise<void> {
  try {
    // In production, store in Redis with expiration (15 minutes)
    console.log(`OAuth state stored: ${state} for user ${userId} (${type})`);
  } catch (error) {
    console.error('Error storing OAuth state:', error);
  }
}

async function testApiKeyConnection(type: string, config: any): Promise<{ success: boolean; error?: string }> {
  try {
    // In production, this would test the actual API connection
    switch (type) {
      case 'aws':
        // Test AWS credentials
        if (!config.accessKeyId || !config.secretAccessKey) {
          return { success: false, error: 'AWS credentials are required' };
        }
        // Would make actual AWS API call to test credentials
        return { success: true };

      case 'gcp':
        // Test GCP service account
        if (!config.serviceAccountKey) {
          return { success: false, error: 'GCP service account key is required' };
        }
        return { success: true };

      case 'azure':
        // Test Azure credentials
        if (!config.clientId || !config.clientSecret || !config.tenantId) {
          return { success: false, error: 'Azure credentials are required' };
        }
        return { success: true };

      case 'netlify':
        // Test Netlify token
        if (!config.accessToken) {
          return { success: false, error: 'Netlify access token is required' };
        }
        return { success: true };

      case 'railway':
        // Test Railway token
        if (!config.token) {
          return { success: false, error: 'Railway token is required' };
        }
        return { success: true };

      case 'render':
        // Test Render API key
        if (!config.apiKey) {
          return { success: false, error: 'Render API key is required' };
        }
        return { success: true };

      default:
        return { success: false, error: 'Unsupported integration type' };
    }
  } catch (error) {
    console.error(`Error testing ${type} connection:`, error);
    return { success: false, error: 'Connection test failed' };
  }
}

async function createOrUpdateIntegration(data: {
  userId: string;
  type: string;
  config: any;
  connected: boolean;
  status: string;
}): Promise<any> {
  try {
    // In production, create/update in integrations table
    const integration = {
      id: uuidv4(),
      userId: data.userId,
      type: data.type,
      connected: data.connected,
      status: data.status,
      connectedAt: new Date().toISOString(),
      config: data.config,
    };

    console.log('Integration created/updated:', integration);
    return integration;
  } catch (error) {
    console.error('Error creating/updating integration:', error);
    throw error;
  }
}

export const runtime = "edge";