const serverless = require('serverless-http');
const express = require('express');
const cors = require('cors');

// Set environment to production for serverless
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

// Create minimal Express app for testing
const app = express();

// Basic middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: '1.0.0'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Recoder Backend API',
    status: 'running',
    version: '1.0.0'
  });
});

// API endpoints
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    api: 'running',
    timestamp: new Date().toISOString()
  });
});

// Wrap the Express app with serverless-http
const handler = serverless(app, {
  basePath: '/.netlify/functions/server'
});

module.exports.handler = async (event, context) => {
  // Add serverless context
  context.callbackWaitsForEmptyEventLoop = false;
  
  // Call the handler
  return await handler(event, context);
};
