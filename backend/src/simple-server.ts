/**
 * Simple Test Server for Payment Integration
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import unifiedPaymentsRoutes from './routes/unified-payments-test';
import usageMonitoringRoutes from './routes/usage-monitoring';
import { authenticate } from './middleware/auth';

const app = express();
const port = process.env.PORT || 3001;

// Basic middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URLS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:3010',
    'https://recoder.xyz'
  ],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 1000, // limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'recoder-backend',
    version: '1.0.0'
  });
});

// Test payment interface
app.get('/test', (req, res) => {
  res.sendFile(__dirname + '/test-payment.html');
});

// Payment routes (auth is handled within the router)
app.use('/api/payments', unifiedPaymentsRoutes);

// Usage monitoring routes
app.use('/api/usage', usageMonitoringRoutes);

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.originalUrl
  });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Recoder Backend Server running on port ${port}`);
  console.log(`📍 Health check: http://localhost:${port}/health`);
  console.log(`💳 Payment API: http://localhost:${port}/api/payments`);
  console.log(`📊 Usage monitoring: http://localhost:${port}/api/usage`);
  console.log(`🧪 Test interface: http://localhost:${port}/test`);
});