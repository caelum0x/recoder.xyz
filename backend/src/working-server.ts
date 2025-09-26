/**
 * Working Recoder Backend Server
 * OAuth-focused with essential services only
 */

console.log('🔍 Starting working server...');

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const morgan = require('morgan');
const session = require('express-session');
const cookieParser = require('cookie-parser');

console.log('🔍 Basic requires done, loading logger...');
const { logger } = require('./utils/logger');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

console.log('🔍 Setting up middleware...');

// Basic security and CORS
app.use(cors({
  origin: [
    'https://recoder.xyz',
    'https://www.recoder.xyz',
    'https://web.recoder.xyz',
    'https://chat.recoder.xyz',
    process.env.CORS_ORIGIN || 'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID', 'X-Client-Version']
}));

// Session middleware for OAuth
app.use(session({
  secret: process.env.JWT_SECRET || 'recoder-xyz-session-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

app.use(cookieParser());
app.use(morgan('combined', { stream: logger.stream }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

console.log('🔍 Loading core routes...');

// Health check endpoint
app.get('/health', (req: any, res: any) => {
  res.json({
    status: 'healthy',
    service: 'Recoder Backend API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    features: ['OAuth', 'Authentication', 'Core API']
  });
});

// Import core routes with error handling
console.log('🔍 Loading authentication routes...');
try {
  const authRoutes = require('./routes/auth');
  app.use('/api/auth', authRoutes);
  console.log('✅ Auth routes loaded successfully');
} catch (error) {
  console.error('❌ Failed to load auth routes:', error);
}

console.log('🔍 Loading OAuth routes...');
try {
  const oauthRoutes = require('./routes/oauth');
  app.use('/api/oauth', oauthRoutes);
  console.log('✅ OAuth routes loaded successfully');
} catch (error) {
  console.error('❌ Failed to load OAuth routes:', error);
}

console.log('🔍 Loading SSO routes...');
try {
  const ssoRoutes = require('./routes/sso');
  app.use('/api/sso', ssoRoutes.default || ssoRoutes);
  console.log('✅ SSO routes loaded successfully');
} catch (error) {
  console.error('❌ Failed to load SSO routes:', error);
}

console.log('🔍 Loading user routes...');
try {
  const userRoutes = require('./routes/users');
  app.use('/api/users', userRoutes);
  console.log('✅ User routes loaded successfully');
} catch (error) {
  console.error('❌ Failed to load user routes:', error);
}

// API status endpoints
app.get('/api/v1/status', (req: any, res: any) => {
  res.json({
    service: 'Recoder Backend API',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    features: {
      authentication: true,
      oauth: true,
      sso: true,
      users: true
    }
  });
});

// OAuth test endpoints
app.get('/api/test/oauth-providers', (req: any, res: any) => {
  res.json({
    providers: [
      {
        name: 'Google',
        id: 'google',
        authUrl: '/api/oauth/google',
        available: !!process.env.GOOGLE_CLIENT_ID
      },
      {
        name: 'GitHub',
        id: 'github', 
        authUrl: '/api/oauth/github',
        available: !!process.env.GITHUB_CLIENT_ID
      }
    ],
    callbackUrl: '/api/oauth/callback',
    status: 'configured'
  });
});

// 404 handler
app.use('*', (req: any, res: any) => {
  res.status(404).json({
    error: {
      message: 'Route not found',
      code: 'ROUTE_NOT_FOUND',
      path: req.originalUrl
    }
  });
});

// Global error handler
app.use((err: any, req: any, res: any, next: any) => {
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(err.status || 500).json({
    error: {
      message: isDevelopment ? err.message : 'Internal server error',
      code: err.code || 'INTERNAL_ERROR',
      ...(isDevelopment && { stack: err.stack })
    }
  });
});

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  logger.info(`${signal} received, shutting down gracefully`);
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Error handlers
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start server
console.log('🔍 Starting Express server...');

const server = app.listen(PORT, () => {
  console.log(`✅ Recoder Backend API server running on port ${PORT}`);
  logger.info(`Recoder Backend API server running on port ${PORT}`, {
    environment: process.env.NODE_ENV || 'development',
    port: PORT,
    features: {
      oauth: 'Google, GitHub',
      authentication: 'JWT + OAuth',
      api: 'Core endpoints'
    }
  });
});

// Increase timeout for long-running operations
server.timeout = 300000; // 5 minutes

console.log('🔍 Server started successfully - OAuth ready!');

module.exports = app;