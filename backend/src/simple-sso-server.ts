/**
 * Simple SSO Server for Testing
 * Minimal Express server just for SSO functionality
 */

const express = require('express');
const cors = require('cors');
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import axios from 'axios';

const app = express();
const PORT = process.env.PORT || 3005;

// Simple in-memory storage for testing
const users = new Map();
const deviceFlows = new Map();
const sessions = new Map();
const apiKeys = new Map();

// JWT secrets
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || crypto.randomBytes(64).toString('hex');

// OAuth Configuration
const OAUTH_CONFIG = {
  github: {
    clientId: process.env.GITHUB_CLIENT_ID || 'test_github_client_id',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || 'test_github_secret',
    redirectUri: process.env.GITHUB_REDIRECT_URI || 'http://localhost:3005/api/oauth/github/callback',
    scope: 'read:user user:email',
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userUrl: 'https://api.github.com/user'
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || 'test_google_client_id',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'test_google_secret', 
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3005/api/oauth/google/callback',
    scope: 'openid profile email',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userUrl: 'https://www.googleapis.com/oauth2/v2/userinfo'
  }
};

// Middleware
app.use(cors());
app.use(express.json());

// Simple logger
const log = (message: string, data?: any) => {
  console.log(`[SSO] ${message}`, data ? JSON.stringify(data, null, 2) : '');
};

// Generate tokens
function generateTokens(user: any) {
  const sessionId = crypto.randomUUID();
  
  const accessToken = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role || 'user',
      sessionId
    },
    JWT_SECRET,
    { expiresIn: '15m' }
  );

  const refreshToken = jwt.sign(
    { userId: user.id, sessionId },
    JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );

  // Store session
  sessions.set(sessionId, {
    userId: user.id,
    createdAt: new Date(),
    lastAccess: new Date()
  });

  return {
    accessToken,
    refreshToken,
    sessionId,
    expiresIn: 15 * 60, // 15 minutes
    platforms: ['web', 'chat', 'cli', 'desktop', 'mobile']
  };
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date() });
});

// OAuth Endpoints

// GitHub OAuth - Initiate
app.get('/api/oauth/github', (req, res) => {
  const { platform = 'web', redirect } = req.query;
  
  const state = Buffer.from(JSON.stringify({ platform, redirect })).toString('base64');
  
  const authUrl = `${OAUTH_CONFIG.github.authUrl}?` +
    `client_id=${OAUTH_CONFIG.github.clientId}&` +
    `redirect_uri=${encodeURIComponent(OAUTH_CONFIG.github.redirectUri)}&` +
    `scope=${encodeURIComponent(OAUTH_CONFIG.github.scope)}&` +
    `state=${state}`;

  log('GitHub OAuth initiated', { platform, authUrl });
  res.redirect(authUrl);
});

// GitHub OAuth - Callback
app.get('/api/oauth/github/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    
    if (!code) {
      return res.status(400).json({ success: false, error: 'Authorization code missing' });
    }

    // Decode state
    const stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
    
    // Exchange code for access token
    const tokenResponse = await axios.post(OAUTH_CONFIG.github.tokenUrl, {
      client_id: OAUTH_CONFIG.github.clientId,
      client_secret: OAUTH_CONFIG.github.clientSecret,
      code: code,
      redirect_uri: OAUTH_CONFIG.github.redirectUri
    }, {
      headers: { 'Accept': 'application/json' }
    });

    const { access_token } = tokenResponse.data;
    
    if (!access_token) {
      throw new Error('Failed to get access token from GitHub');
    }

    // Get user info
    const userResponse = await axios.get(OAUTH_CONFIG.github.userUrl, {
      headers: { 'Authorization': `Bearer ${access_token}` }
    });

    const githubUser = userResponse.data;
    
    // Create or update user
    let user = users.get(githubUser.email?.toLowerCase() || githubUser.login);
    if (!user) {
      user = {
        id: crypto.randomUUID(),
        email: githubUser.email || `${githubUser.login}@github.local`,
        name: githubUser.name || githubUser.login,
        role: 'user',
        provider: 'github',
        providerId: githubUser.id.toString(),
        avatar: githubUser.avatar_url,
        createdAt: new Date()
      };
      users.set(user.email.toLowerCase(), user);
      log('Created user from GitHub OAuth', { userId: user.id, email: user.email });
    } else {
      // Update GitHub info
      user.provider = 'github';
      user.providerId = githubUser.id.toString();
      user.avatar = githubUser.avatar_url;
    }

    // Generate tokens
    const tokens = generateTokens(user);

    log('GitHub OAuth successful', { 
      userId: user.id, 
      platform: stateData.platform,
      sessionId: tokens.sessionId 
    });

    // Redirect with tokens (in production, use secure cookie or postMessage)
    const redirectUrl = stateData.redirect || 'http://localhost:3000/auth/success';
    const tokenData = encodeURIComponent(JSON.stringify({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar
      },
      tokens
    }));

    res.redirect(`${redirectUrl}?auth=${tokenData}`);
    return;

  } catch (error: any) {
    log('GitHub OAuth error', { error: error.message });
    return res.status(500).json({
      success: false,
      error: 'GitHub OAuth failed',
      details: error.message
    });
  }
});

// Google OAuth - Initiate  
app.get('/api/oauth/google', (req, res) => {
  const { platform = 'web', redirect } = req.query;
  
  const state = Buffer.from(JSON.stringify({ platform, redirect })).toString('base64');
  
  const authUrl = `${OAUTH_CONFIG.google.authUrl}?` +
    `client_id=${OAUTH_CONFIG.google.clientId}&` +
    `redirect_uri=${encodeURIComponent(OAUTH_CONFIG.google.redirectUri)}&` +
    `response_type=code&` +
    `scope=${encodeURIComponent(OAUTH_CONFIG.google.scope)}&` +
    `state=${state}`;

  log('Google OAuth initiated', { platform, authUrl });
  res.redirect(authUrl);
});

// Google OAuth - Callback
app.get('/api/oauth/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    
    if (!code) {
      return res.status(400).json({ success: false, error: 'Authorization code missing' });
    }

    // Decode state
    const stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
    
    // Exchange code for access token
    const tokenResponse = await axios.post(OAUTH_CONFIG.google.tokenUrl, {
      client_id: OAUTH_CONFIG.google.clientId,
      client_secret: OAUTH_CONFIG.google.clientSecret,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: OAUTH_CONFIG.google.redirectUri
    }, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const { access_token } = tokenResponse.data;
    
    if (!access_token) {
      throw new Error('Failed to get access token from Google');
    }

    // Get user info
    const userResponse = await axios.get(OAUTH_CONFIG.google.userUrl, {
      headers: { 'Authorization': `Bearer ${access_token}` }
    });

    const googleUser = userResponse.data;
    
    // Create or update user
    let user = users.get(googleUser.email?.toLowerCase());
    if (!user) {
      user = {
        id: crypto.randomUUID(),
        email: googleUser.email,
        name: googleUser.name,
        role: 'user',
        provider: 'google',
        providerId: googleUser.id,
        avatar: googleUser.picture,
        createdAt: new Date()
      };
      users.set(user.email.toLowerCase(), user);
      log('Created user from Google OAuth', { userId: user.id, email: user.email });
    } else {
      // Update Google info
      user.provider = 'google';
      user.providerId = googleUser.id;
      user.avatar = googleUser.picture;
    }

    // Generate tokens
    const tokens = generateTokens(user);

    log('Google OAuth successful', { 
      userId: user.id, 
      platform: stateData.platform,
      sessionId: tokens.sessionId 
    });

    // Redirect with tokens
    const redirectUrl = stateData.redirect || 'http://localhost:3000/auth/success';
    const tokenData = encodeURIComponent(JSON.stringify({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar
      },
      tokens
    }));

    res.redirect(`${redirectUrl}?auth=${tokenData}`);
    return;

  } catch (error: any) {
    log('Google OAuth error', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Google OAuth failed',
      details: error.message
    });
    return;
  }
});

// SSO Login
app.post('/api/sso/login', async (req, res) => {
  try {
    const { email, password, platform, deviceInfo } = req.body;
    
    log('SSO login attempt', { email, platform, deviceInfo });

    // Simple validation
    if (!email || !password || !platform) {
      res.status(400).json({
        success: false,
        error: 'Email, password, and platform are required'
      });
      return;
    }

    // Create or get user (for testing)
    let user = users.get(email.toLowerCase());
    if (!user) {
      user = {
        id: crypto.randomUUID(),
        email: email.toLowerCase(),
        name: email.split('@')[0],
        role: 'user',
        createdAt: new Date()
      };
      users.set(email.toLowerCase(), user);
      log('Created new user', { userId: user.id, email: user.email });
    }

    // Generate tokens
    const tokens = generateTokens(user);

    log('SSO login successful', { userId: user.id, platform, sessionId: tokens.sessionId });

    res.json({
      success: true,
      message: 'Authentication successful',
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          platforms: [
            { platform: 'web', enabled: true, lastAccess: new Date() },
            { platform: 'chat', enabled: true, lastAccess: new Date() },
            { platform: 'cli', enabled: true, lastAccess: new Date() },
            { platform: 'desktop', enabled: true, lastAccess: new Date() },
            { platform: 'mobile', enabled: true, lastAccess: new Date() }
          ],
          subscriptionTier: 'free',
          quotas: {
            totalRequests: 1000,
            usedRequests: 0,
            resetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          }
        },
        tokens
      }
    });

  } catch (error: any) {
    log('SSO login error', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Authentication failed',
      code: 'SSO_LOGIN_ERROR'
    });
    return;
  }
});

// SSO Token Validation
app.post('/api/sso/validate', (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Token is required'
      });
    }

    // Verify token
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET) as any;
    } catch (err: any) {
      log('Token verification error', { error: err.message });
      return res.status(401).json({
        success: false,
        error: 'Invalid token',
        code: 'SSO_VALIDATION_FAILED'
      });
    }
    
    // Check session
    const session = sessions.get(decoded.sessionId);
    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Session expired'
      });
    }

    // Get user
    const user = Array.from(users.values()).find(u => u.id === decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }

    log('Token validation successful', { userId: user.id, sessionId: decoded.sessionId });

    return res.json({
      success: true,
      message: 'Token is valid',
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        },
        platformAccess: ['web', 'chat', 'cli', 'desktop', 'mobile'],
        session: {
          id: decoded.sessionId,
          createdAt: session.createdAt,
          lastAccess: session.lastAccess
        }
      }
    });

  } catch (error: any) {
    log('Token validation failed', { error: error.message });
    return res.status(401).json({
      success: false,
      error: 'Invalid token',
      code: 'SSO_VALIDATION_FAILED'
    });
  }
});

// CLI Device Flow - Start
app.post('/api/sso/device/start', (req, res) => {
  try {
    const deviceCode = crypto.randomBytes(16).toString('hex');
    const userCode = generateUserCode();
    const expiresIn = 10 * 60 * 1000; // 10 minutes
    
    deviceFlows.set(deviceCode, {
      userCode,
      expiresAt: Date.now() + expiresIn,
      authorized: false,
      userId: null
    });

    log('Device flow started', { deviceCode, userCode });

    res.json({
      success: true,
      message: 'Device flow started',
      data: {
        deviceCode,
        userCode,
        verificationUri: `http://localhost:3000/auth/device`,
        expiresIn,
        interval: 5
      }
    });

  } catch (error: any) {
    log('Device flow start error', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to start device flow'
    });
    return;
  }
});

// CLI Device Flow - Authorize
app.post('/api/sso/device/authorize', (req, res) => {
  try {
    const { userCode, userId } = req.body;

    // Find device flow by user code
    const deviceFlow = Array.from(deviceFlows.entries())
      .find(([_, flow]) => flow.userCode === userCode)?.[1];

    if (!deviceFlow) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user code'
      });
    }

    if (Date.now() > deviceFlow.expiresAt) {
      return res.status(400).json({
        success: false,
        error: 'User code expired'
      });
    }

    // Authorize device
    deviceFlow.authorized = true;
    deviceFlow.userId = userId;

    log('Device authorized', { userCode, userId });

    return res.json({
      success: true,
      message: 'Device authorized successfully'
    });

  } catch (error: any) {
    log('Device authorization error', { error: error.message });
    return res.status(500).json({
      success: false,
      error: 'Device authorization failed'
    });
  }
});

// CLI Device Flow - Poll
app.post('/api/sso/device/poll', (req, res) => {
  try {
    const { deviceCode } = req.body;

    const deviceFlow = deviceFlows.get(deviceCode);
    
    if (!deviceFlow) {
      return res.status(400).json({
        success: false,
        error: 'Invalid device code'
      });
    }

    if (Date.now() > deviceFlow.expiresAt) {
      deviceFlows.delete(deviceCode);
      return res.status(400).json({
        success: false,
        error: 'Device code expired'
      });
    }

    if (!deviceFlow.authorized) {
      return res.status(202).json({
        success: false,
        error: 'Device not authorized yet',
        code: 'DEVICE_PENDING_AUTHORIZATION'
      });
    }

    // Get user and generate tokens
    const user = Array.from(users.values()).find(u => u.id === deviceFlow.userId);
    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'User not found'
      });
    }

    const tokens = generateTokens(user);

    // Clean up device flow
    deviceFlows.delete(deviceCode);

    log('Device flow completed', { deviceCode, userId: user.id });

    return res.json({
      success: true,
      message: 'Device flow completed',
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        },
        tokens
      }
    });

  } catch (error: any) {
    log('Device flow poll error', { error: error.message });
    return res.status(500).json({
      success: false,
      error: 'Device flow polling failed'
    });
  }
});

// API Key Management Endpoints

// Create API Key
app.post('/api/keys/create', async (req, res) => {
  try {
    const { token, name, scopes, expiresIn } = req.body;

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token required'
      });
    }

    // Verify token
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({
        success: false,
        error: 'Invalid access token'
      });
    }

    // Get user
    const user = Array.from(users.values()).find(u => u.id === decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }

    // Generate API key
    const keyId = crypto.randomUUID();
    const apiKey = `rck_${crypto.randomBytes(32).toString('hex')}`;
    
    const keyData = {
      id: keyId,
      key: apiKey,
      name: name || 'Default API Key',
      userId: user.id,
      scopes: scopes || ['read', 'write'],
      createdAt: new Date(),
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
      lastUsed: null,
      isActive: true
    };

    apiKeys.set(apiKey, keyData);

    log('API key created', { 
      keyId, 
      userId: user.id, 
      name: keyData.name,
      scopes: keyData.scopes 
    });

    res.json({
      success: true,
      message: 'API key created successfully',
      data: {
        id: keyId,
        key: apiKey,
        name: keyData.name,
        scopes: keyData.scopes,
        createdAt: keyData.createdAt,
        expiresAt: keyData.expiresAt
      }
    });

  } catch (error: any) {
    log('API key creation error', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to create API key'
    });
    return;
  }
});

// List User API Keys
app.get('/api/keys', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token required'
      });
    }

    // Verify token
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({
        success: false,
        error: 'Invalid access token'
      });
    }

    // Get user API keys
    const userKeys = Array.from(apiKeys.values())
      .filter(key => key.userId === decoded.userId && key.isActive)
      .map(key => ({
        id: key.id,
        name: key.name,
        scopes: key.scopes,
        createdAt: key.createdAt,
        expiresAt: key.expiresAt,
        lastUsed: key.lastUsed,
        keyPreview: key.key.substring(0, 12) + '...'
      }));

    res.json({
      success: true,
      data: {
        keys: userKeys,
        total: userKeys.length
      }
    });

  } catch (error: any) {
    log('List API keys error', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to list API keys'
    });
    return;
  }
});

// Validate API Key
app.post('/api/keys/validate', async (req, res) => {
  try {
    const { apiKey } = req.body;

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'API key required'
      });
    }

    const keyData = apiKeys.get(apiKey);
    
    if (!keyData || !keyData.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key'
      });
    }

    // Check expiration
    if (keyData.expiresAt && new Date() > keyData.expiresAt) {
      return res.status(401).json({
        success: false,
        error: 'API key expired'
      });
    }

    // Update last used
    keyData.lastUsed = new Date();

    // Get user
    const user = Array.from(users.values()).find(u => u.id === keyData.userId);
    
    return res.json({
      success: true,
      message: 'API key is valid',
      data: {
        key: {
          id: keyData.id,
          name: keyData.name,
          scopes: keyData.scopes,
          userId: keyData.userId
        },
        user: user ? {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        } : null
      }
    });

  } catch (error: any) {
    log('API key validation error', { error: error.message });
    return res.status(500).json({
      success: false,
      error: 'API key validation failed'
    });
  }
});

// Revoke API Key
app.delete('/api/keys/:keyId', async (req, res) => {
  try {
    const { keyId } = req.params;
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token required'
      });
    }

    // Verify token
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({
        success: false,
        error: 'Invalid access token'
      });
    }

    // Find and revoke key
    const keyData = Array.from(apiKeys.values()).find(key => 
      key.id === keyId && key.userId === decoded.userId
    );

    if (!keyData) {
      return res.status(404).json({
        success: false,
        error: 'API key not found'
      });
    }

    keyData.isActive = false;
    keyData.revokedAt = new Date();

    log('API key revoked', { keyId, userId: decoded.userId });

    return res.json({
      success: true,
      message: 'API key revoked successfully'
    });

  } catch (error: any) {
    log('API key revocation error', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to revoke API key'
    });
    return;
  }
});

// Utility functions
function generateUserCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ====== PAYMENT & SUBSCRIPTION SYSTEM ======

// Global in-memory storage for subscriptions and usage tracking
const subscriptions = new Map();
const usageRecords = new Map();
const costTracking = new Map();

// AI Provider Cost Configuration (per 1M tokens)
const AI_PROVIDER_COSTS = {
  'anthropic/claude-3.5-sonnet': { input: 3.0, output: 15.0 },
  'google/gemini-2.0-flash': { input: 0.075, output: 0.3 },
  'groq/llama-3.1-70b': { input: 0.59, output: 0.79 },
  'deepseek/coder': { input: 0.14, output: 0.28 },
  'openai/gpt-4': { input: 30.0, output: 60.0 }
};

// Subscription Plans with Cost Structure
const SUBSCRIPTION_PLANS = {
  'free': {
    name: 'Free',
    price: 0,
    limits: { tokens: 10000, requests: 100 }, // 10k tokens, 100 requests per month
    features: ['Basic AI access', 'Limited models', 'Community support'],
    cost_limit: 0 // Free tier
  },
  'weekly': {
    name: 'Weekly',
    price: 1000, // $10.00 in cents
    limits: { tokens: 100000, requests: 1000 }, // 100k tokens, 1k requests per week
    features: ['All AI models', 'Email support', 'All templates'],
    cost_limit: 8.0 // Max $8 cost per week (80% of $10)
  },
  'starter': {
    name: 'Starter',
    price: 2000, // $20.00 in cents
    limits: { tokens: 500000, requests: 5000 }, // 500k tokens, 5k requests per month
    features: ['All AI models', 'Priority support', 'Advanced features'],
    cost_limit: 16.0 // Max $16 cost per month (80% of $20)
  },
  'professional': {
    name: 'Professional',
    price: 10000, // $100.00 in cents
    limits: { tokens: 2500000, requests: 25000 }, // 2.5M tokens, 25k requests per month
    features: ['Premium AI models', 'API access', 'Advanced analytics'],
    cost_limit: 80.0 // Max $80 cost per month (80% of $100)
  },
  'business': {
    name: 'Business',
    price: 20000, // $200.00 in cents
    limits: { tokens: 10000000, requests: 100000 }, // 10M tokens, 100k requests per month
    features: ['Team collaboration', 'Dedicated support', 'Custom integrations'],
    cost_limit: 160.0 // Max $160 cost per month (80% of $200)
  },
  'enterprise': {
    name: 'Enterprise',
    price: 0, // Usage-based pricing
    limits: { tokens: -1, requests: -1 }, // Unlimited
    features: ['Usage-based pricing', 'White-label', 'SLA guarantees'],
    cost_limit: -1 // No limit, usage-based
  }
};

// Get subscription plans
app.get('/api/subscriptions/plans', (req, res) => {
  try {
    const plans = Object.entries(SUBSCRIPTION_PLANS).map(([id, plan]) => ({
      id,
      ...plan,
      price_formatted: `$${(plan.price / 100).toFixed(2)}`,
      profit_margin: plan.price > 0 ? Math.round(((plan.price/100 - plan.cost_limit) / (plan.price/100)) * 100) : 0
    }));

    res.json({
      success: true,
      data: { plans }
    });
  } catch (error: any) {
    log('Failed to get subscription plans', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve subscription plans'
    });
    return;
  }
});

// Create payment link for subscription
app.post('/api/subscriptions/create-payment-link', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token required'
      });
    }

    // Verify token
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({
        success: false,
        error: 'Invalid access token'
      });
    }

    const user = Array.from(users.values()).find(u => u.id === decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }

    const { planId, billingAddress, returnUrl } = req.body;

    if (!planId || !SUBSCRIPTION_PLANS[planId as keyof typeof SUBSCRIPTION_PLANS]) {
      return res.status(400).json({
        success: false,
        error: 'Valid plan ID is required'
      });
    }

    const plan = SUBSCRIPTION_PLANS[planId as keyof typeof SUBSCRIPTION_PLANS];
    const subscriptionId = crypto.randomUUID();
    const paymentLinkId = crypto.randomBytes(16).toString('hex');

    // Create subscription record
    const subscription = {
      id: subscriptionId,
      userId: user.id,
      userEmail: user.email,
      planId,
      planName: plan.name,
      amount: plan.price,
      currency: 'USD',
      status: 'pending_payment',
      createdAt: new Date(),
      billingAddress: billingAddress || {},
      paymentLinkId,
      limits: plan.limits,
      costLimit: plan.cost_limit
    };

    subscriptions.set(subscriptionId, subscription);

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const paymentLink = `https://pay.dodopayments.com/link/${paymentLinkId}?redirect=${encodeURIComponent(returnUrl || `${baseUrl}/subscription/success`)}`;

    log('Created subscription payment link', {
      userId: user.id,
      email: user.email,
      planId,
      subscriptionId,
      amount: plan.price
    });

    res.json({
      success: true,
      message: 'Payment link created successfully',
      data: {
        subscription_id: subscriptionId,
        payment_link_id: paymentLinkId,
        payment_link: paymentLink,
        amount: plan.price / 100,
        currency: 'USD',
        plan: {
          id: planId,
          name: plan.name,
          price: plan.price / 100,
          limits: plan.limits
        },
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      }
    });

  } catch (error: any) {
    log('Failed to create payment link', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to create payment link'
    });
    return;
  }
});

// Get user's subscriptions
app.get('/api/subscriptions/my-subscriptions', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token required'
      });
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({
        success: false,
        error: 'Invalid access token'
      });
    }

    const userSubscriptions = Array.from(subscriptions.values())
      .filter((sub: any) => sub.userId === decoded.userId)
      .map((sub: any) => ({
        id: sub.id,
        plan_id: sub.planId,
        plan_name: sub.planName,
        status: sub.status,
        amount: sub.amount / 100,
        currency: sub.currency,
        created_at: sub.createdAt,
        next_billing_date: sub.nextBillingDate,
        limits: sub.limits,
        usage: getUserUsage(decoded.userId)
      }));

    res.json({
      success: true,
      data: {
        subscriptions: userSubscriptions,
        total: userSubscriptions.length,
        active_count: userSubscriptions.filter(s => s.status === 'active').length
      }
    });

  } catch (error: any) {
    log('Failed to get user subscriptions', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve subscriptions'
    });
    return;
  }
});

// Track AI usage and costs
app.post('/api/usage/track', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token required'
      });
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({
        success: false,
        error: 'Invalid access token'
      });
    }

    const { model, inputTokens, outputTokens, feature, metadata } = req.body;

    if (!model || !inputTokens || !outputTokens) {
      return res.status(400).json({
        success: false,
        error: 'Model, inputTokens, and outputTokens are required'
      });
    }

    // Calculate cost
    const modelCosts = AI_PROVIDER_COSTS[model] || { input: 1.0, output: 2.0 }; // Default costs
    const cost = (inputTokens / 1000000) * modelCosts.input + (outputTokens / 1000000) * modelCosts.output;

    // Get user's active subscription
    const userSubscription = Array.from(subscriptions.values())
      .find((sub: any) => sub.userId === decoded.userId && sub.status === 'active');

    if (!userSubscription) {
      // Check if free tier usage is within limits
      const currentUsage = getUserUsage(decoded.userId);
      const freeLimits = SUBSCRIPTION_PLANS['free'].limits;
      
      if (currentUsage.tokens + inputTokens + outputTokens > freeLimits.tokens) {
        return res.status(402).json({
          success: false,
          error: 'Usage limit exceeded. Please upgrade your subscription.',
          code: 'USAGE_LIMIT_EXCEEDED',
          current_usage: currentUsage,
          limits: freeLimits
        });
      }
    } else {
      // Check subscription limits
      const currentUsage = getUserUsage(decoded.userId);
      const limits = userSubscription.limits;
      
      if (currentUsage.tokens + inputTokens + outputTokens > limits.tokens) {
        return res.status(402).json({
          success: false,
          error: 'Subscription usage limit exceeded.',
          code: 'SUBSCRIPTION_LIMIT_EXCEEDED',
          current_usage: currentUsage,
          limits: limits
        });
      }

      // Check cost limits to prevent bankruptcy
      const currentCost = getUserCost(decoded.userId);
      if (currentCost + cost > userSubscription.costLimit) {
        return res.status(402).json({
          success: false,
          error: 'Cost limit exceeded for this billing period.',
          code: 'COST_LIMIT_EXCEEDED',
          current_cost: currentCost,
          cost_limit: userSubscription.costLimit
        });
      }
    }

    // Record usage
    const usageRecord = {
      id: crypto.randomUUID(),
      userId: decoded.userId,
      model,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      cost,
      feature: feature || 'chat',
      timestamp: new Date(),
      metadata: metadata || {}
    };

    // Store usage record
    const userUsageKey = `${decoded.userId}:${new Date().toISOString().substring(0, 7)}`; // YYYY-MM
    if (!usageRecords.has(userUsageKey)) {
      usageRecords.set(userUsageKey, []);
    }
    usageRecords.get(userUsageKey).push(usageRecord);

    // Update cost tracking
    if (!costTracking.has(decoded.userId)) {
      costTracking.set(decoded.userId, { monthly: 0, total: 0 });
    }
    const userCosts = costTracking.get(decoded.userId);
    userCosts.monthly += cost;
    userCosts.total += cost;

    log('Usage tracked', {
      userId: decoded.userId,
      model,
      tokens: inputTokens + outputTokens,
      cost: cost.toFixed(4),
      feature
    });

    res.json({
      success: true,
      data: {
        usage_recorded: true,
        cost: cost.toFixed(4),
        current_usage: getUserUsage(decoded.userId),
        remaining_quota: getRemainingQuota(decoded.userId)
      }
    });

  } catch (error: any) {
    log('Failed to track usage', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to track usage'
    });
    return;
  }
});

// Get user usage statistics
app.get('/api/usage/stats', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token required'
      });
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({
        success: false,
        error: 'Invalid access token'
      });
    }

    const usage = getUserUsage(decoded.userId);
    const cost = getUserCost(decoded.userId);
    const subscription = Array.from(subscriptions.values())
      .find((sub: any) => sub.userId === decoded.userId && sub.status === 'active');

    const limits = subscription ? subscription.limits : SUBSCRIPTION_PLANS['free'].limits;
    const costLimit = subscription ? subscription.costLimit : SUBSCRIPTION_PLANS['free'].cost_limit;

    res.json({
      success: true,
      data: {
        usage,
        cost: {
          monthly: cost,
          limit: costLimit,
          percentage: (cost / costLimit) * 100
        },
        limits,
        subscription: subscription ? {
          plan: subscription.planId,
          status: subscription.status
        } : null,
        warnings: {
          high_usage: usage.tokens > limits.tokens * 0.8,
          high_cost: cost > costLimit * 0.8,
          approaching_limit: usage.tokens > limits.tokens * 0.9
        }
      }
    });

  } catch (error: any) {
    log('Failed to get usage stats', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve usage statistics'
    });
    return;
  }
});

// Webhook endpoint for payment success
app.post('/api/subscriptions/webhook', express.json(), async (req, res) => {
  try {
    const signature = req.headers['x-dodo-signature'] as string;
    const event = req.body;

    // Simple signature verification
    const expectedSignature = process.env.DODO_WEBHOOK_SECRET || 'webhook_secret';
    if (signature !== expectedSignature) {
      log('Invalid webhook signature', { signature });
      return res.status(400).json({ error: 'Invalid signature' });
    }

    log('Received payment webhook', {
      type: event.type,
      subscriptionId: event.data?.subscription_id
    });

    switch (event.type) {
      case 'subscription.payment_succeeded':
      case 'payment.succeeded':
        const subscription = subscriptions.get(event.data.subscription_id);
        if (subscription) {
          subscription.status = 'active';
          subscription.lastPaymentAt = new Date();
          subscription.nextBillingDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          subscriptions.set(event.data.subscription_id, subscription);
          
          log('Subscription activated', {
            subscriptionId: event.data.subscription_id,
            userId: subscription.userId
          });
        }
        break;
        
      case 'subscription.cancelled':
        const cancelledSub = subscriptions.get(event.data.subscription_id);
        if (cancelledSub) {
          cancelledSub.status = 'cancelled';
          cancelledSub.cancelledAt = new Date();
          subscriptions.set(event.data.subscription_id, cancelledSub);
        }
        break;
    }

    res.json({ received: true });

  } catch (error: any) {
    log('Failed to process webhook', { error: error.message });
    res.status(500).json({ error: 'Webhook processing failed' });
    return;
  }
});

// Subscription analytics
app.get('/api/subscriptions/analytics', async (req, res) => {
  try {
    const allSubscriptions = Array.from(subscriptions.values());
    const activeSubscriptions = allSubscriptions.filter((sub: any) => sub.status === 'active');
    const monthlyRevenue = activeSubscriptions.reduce((sum: number, sub: any) => sum + (sub.amount / 100), 0);
    const totalCosts = activeSubscriptions.reduce((sum: number, sub: any) => sum + (sub.costLimit || 0), 0);
    const netProfit = monthlyRevenue - totalCosts;
    const profitMargin = monthlyRevenue > 0 ? (netProfit / monthlyRevenue) * 100 : 0;

    res.json({
      success: true,
      data: {
        totalRevenue: monthlyRevenue,
        totalCosts,
        netProfit,
        profitMargin: Math.round(profitMargin * 100) / 100,
        activeSubscriptions: activeSubscriptions.length,
        totalSubscriptions: allSubscriptions.length,
        target_metrics: {
          profit_margin_target: 79,
          current_profit_margin: Math.round(profitMargin * 100) / 100,
          target_achieved: profitMargin >= 78
        }
      }
    });

  } catch (error: any) {
    log('Failed to get analytics', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve analytics'
    });
    return;
  }
});

// Helper functions
function getUserUsage(userId: string) {
  const currentMonth = new Date().toISOString().substring(0, 7);
  const userUsageKey = `${userId}:${currentMonth}`;
  const records = usageRecords.get(userUsageKey) || [];
  
  return {
    tokens: records.reduce((sum: number, record: any) => sum + record.totalTokens, 0),
    requests: records.length,
    models_used: Array.from(new Set(records.map((r: any) => r.model)))
  };
}

function getUserCost(userId: string) {
  return costTracking.get(userId)?.monthly || 0;
}

function getRemainingQuota(userId: string) {
  const subscription = Array.from(subscriptions.values())
    .find((sub: any) => sub.userId === userId && sub.status === 'active');
  
  const limits = subscription ? subscription.limits : SUBSCRIPTION_PLANS['free'].limits;
  const usage = getUserUsage(userId);
  
  return {
    tokens: Math.max(0, limits.tokens - usage.tokens),
    requests: Math.max(0, limits.requests - usage.requests)
  };
}

// Start server
app.listen(PORT, () => {
  log(`Simple SSO Server with Payments running on port ${PORT}`, {
    environment: process.env.NODE_ENV || 'development',
    endpoints: [
      // Authentication
      'POST /api/sso/login',
      'POST /api/sso/validate',
      // OAuth
      'GET /api/oauth/github',
      'GET /api/oauth/github/callback', 
      'GET /api/oauth/google',
      'GET /api/oauth/google/callback',
      // Device Flow
      'POST /api/sso/device/start',
      'POST /api/sso/device/authorize',
      'POST /api/sso/device/poll',
      // API Keys
      'POST /api/keys/create',
      'GET /api/keys',
      'POST /api/keys/validate',
      'DELETE /api/keys/:keyId',
      // Payments & Subscriptions
      'GET /api/subscriptions/plans',
      'POST /api/subscriptions/create-payment-link',
      'GET /api/subscriptions/my-subscriptions',
      'POST /api/subscriptions/webhook',
      'GET /api/subscriptions/analytics',
      // Usage Tracking
      'POST /api/usage/track',
      'GET /api/usage/stats',
      // Utility
      'GET /health'
    ],
    oauth: {
      github: {
        authUrl: `http://localhost:${PORT}/api/oauth/github`,
        enabled: !!process.env.GITHUB_CLIENT_ID
      },
      google: {
        authUrl: `http://localhost:${PORT}/api/oauth/google`,
        enabled: !!process.env.GOOGLE_CLIENT_ID
      }
    },
    payments: {
      provider: 'dodo-pay',
      plans: Object.keys(SUBSCRIPTION_PLANS),
      profit_target: 79,
      cost_protection: true
    }
  });
});

export default app;