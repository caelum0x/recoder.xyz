/**
 * Simple OAuth Server - Core functionality only
 */

console.log('🔍 Starting simple OAuth server...');

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const session = require('express-session');
const cookieParser = require('cookie-parser');

const { logger } = require('./utils/logger');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

console.log('🔍 Setting up basic middleware...');

// Basic middleware
app.use(cors({
  origin: [
    'https://recoder.xyz',
    'https://www.recoder.xyz', 
    'https://web.recoder.xyz',
    'https://chat.recoder.xyz',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
}));

app.use(session({
  secret: process.env.JWT_SECRET || 'recoder-xyz-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

console.log('🔍 Loading core routes...');

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Simple OAuth Server',
    timestamp: new Date().toISOString(),
    features: ['OAuth', 'Authentication']
  });
});

// Auth routes
try {
  const authRoutes = require('./routes/auth');
  app.use('/api/auth', authRoutes);
  console.log('✅ Auth routes loaded');
} catch (error) {
  console.error('❌ Failed to load auth routes:', error);
}

// OAuth routes  
try {
  const oauthRoutes = require('./routes/oauth');
  app.use('/api/oauth', oauthRoutes);
  console.log('✅ OAuth routes loaded');
} catch (error) {
  console.error('❌ Failed to load OAuth routes:', error);
}

// User routes
try {
  const userRoutes = require('./routes/users');
  app.use('/api/users', userRoutes);
  console.log('✅ User routes loaded');
} catch (error) {
  console.error('❌ Failed to load user routes:', error);
}

// API status
app.get('/api/v1/status', (req, res) => {
  res.json({
    service: 'Simple OAuth Backend',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

// OAuth providers endpoint
app.get('/api/oauth/providers', (req, res) => {
  res.json({
    google: {
      available: !!process.env.GOOGLE_CLIENT_ID,
      authUrl: '/api/oauth/google'
    },
    github: {
      available: !!process.env.GITHUB_CLIENT_ID,
      authUrl: '/api/oauth/github'
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Server error'
  });
});

console.log('🔍 Starting server...');

// Start server
const server = app.listen(PORT, () => {
  console.log(`✅ Simple OAuth server running on port ${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 OAuth providers: http://localhost:${PORT}/api/oauth/providers`);
});

server.timeout = 60000; // 1 minute timeout

console.log('🔍 Server started successfully!');

module.exports = app;