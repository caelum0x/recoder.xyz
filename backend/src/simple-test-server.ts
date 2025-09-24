/**
 * Simple test server to verify backend functionality
 */

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3004',
    'http://localhost:3010',
    'http://localhost:3007'
  ],
  credentials: true
}));

app.use(express.json());

// Health check
app.get('/health', (req: any, res: any) => {
  res.json({
    status: 'healthy',
    service: 'Recoder Backend Test',
    timestamp: new Date().toISOString(),
    port: PORT
  });
});

// SSO test endpoint
app.get('/api/sso/status', (req: any, res: any) => {
  res.json({
    sso: 'available',
    providers: ['google', 'github', 'credentials'],
    message: 'SSO system operational'
  });
});

// Authentication test
app.post('/api/auth/test', (req: any, res: any) => {
  res.json({
    success: true,
    message: 'Authentication endpoint working',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Simple test server running on port ${PORT}`);
  console.log(`✅ Health check: http://localhost:${PORT}/health`);
  console.log(`✅ SSO status: http://localhost:${PORT}/api/sso/status`);
});

export default app;