/**
 * Minimal server for debugging startup issues
 */

console.log('🔍 MINIMAL: Starting minimal server...');

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

console.log('🔍 MINIMAL: Basic imports done');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env['PORT'] || 3001;

console.log('🔍 MINIMAL: Setting up basic middleware...');

app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

console.log('🔍 MINIMAL: Adding basic routes...');

// Basic health check
app.get('/health', (req: any, res: any) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    message: 'Minimal server is running'
  });
});

// Basic status route
app.get('/api/v1/status', (req: any, res: any) => {
  res.json({
    service: 'Recoder Backend (Minimal)',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

console.log('🔍 MINIMAL: Starting Express server...');

// Start server
const server = app.listen(PORT, () => {
  console.log(`✅ MINIMAL: Server running on port ${PORT}`);
  console.log(`✅ MINIMAL: Health check: http://localhost:${PORT}/health`);
  console.log(`✅ MINIMAL: Status: http://localhost:${PORT}/api/v1/status`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🔍 MINIMAL: SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('🔍 MINIMAL: Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🔍 MINIMAL: SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('🔍 MINIMAL: Server closed');
    process.exit(0);
  });
});

console.log('🔍 MINIMAL: Server setup complete');

module.exports = app;