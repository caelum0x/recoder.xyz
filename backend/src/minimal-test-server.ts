/**
 * Minimal Test Server - just Express with basic routes
 */

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

console.log('🔍 Starting minimal test server...');

// Basic middleware
app.use(cors());
app.use(express.json());

// Test route
app.get('/health', (req: any, res: any) => {
  res.json({
    status: 'healthy',
    message: 'Minimal server is running',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/test', (req: any, res: any) => {
  res.json({
    message: 'Test endpoint working',
    server: 'minimal-test'
  });
});

console.log('🔍 About to start server...');

// Start server
const server = app.listen(PORT, () => {
  console.log(`✅ Minimal test server running on port ${PORT}`);
});

console.log('🔍 Server started successfully');

module.exports = app;