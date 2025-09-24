/**
 * Generate test JWT token for API testing
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Use a fixed JWT secret for testing (in production this should be from env)
const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-recoder-testing-only-not-for-production';

// Create a test user payload (matching auth middleware expectations)
const testUser = {
  userId: 'test-user-123', // Auth middleware expects userId, not id
  email: 'test@recoder.xyz',
  name: 'Test User',
  role: 'user',
  plan: '$20/month',
  permissions: ['read', 'write'],
  emailVerified: true,
  sessionId: 'session-' + Date.now()
};

// Generate JWT token
const token = jwt.sign(testUser, JWT_SECRET, {
  expiresIn: '24h',
  issuer: 'recoder-api',
  audience: 'recoder-client'
});

console.log('Test JWT Token:');
console.log(token);
console.log('\nTest with curl:');
console.log(`curl -H "Authorization: Bearer ${token}" http://localhost:3001/api/ai/models`);
console.log('\nUser payload:');
console.log(JSON.stringify(testUser, null, 2));