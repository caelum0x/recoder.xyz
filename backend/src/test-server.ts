/**
 * Test Server - Minimal version to debug startup issues
 */

const express = require('express');
const { logger } = require('./utils/logger');

// Test importing the services that were causing issues
import { intelligentFailover } from './services/intelligent-failover';
import { redisCache } from './services/redis-cache';
import { databaseOptimization } from './services/database-optimization';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

app.get('/health', (req: any, res: any) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/test', (req: any, res: any) => {
  res.json({ message: 'Test server working' });
});

const server = app.listen(PORT, () => {
  logger.info(`Test server running on port ${PORT}`);
});

module.exports = app;