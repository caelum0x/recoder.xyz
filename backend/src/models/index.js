const { PrismaClient } = require('@prisma/client');
const { logger } = require('../utils/logger');

// Initialize Prisma Client
const prisma = new PrismaClient({
  log: [
    {
      emit: 'event',
      level: 'query',
    },
    {
      emit: 'event',
      level: 'error',
    },
    {
      emit: 'event',
      level: 'info',
    },
    {
      emit: 'event',
      level: 'warn',
    },
  ],
});

// Log database queries in development
if (process.env.NODE_ENV === 'development') {
  prisma.$on('query', (e) => {
    logger.debug('Query:', e.query);
    logger.debug('Duration:', e.duration + 'ms');
  });
}

// Log database errors
prisma.$on('error', (e) => {
  logger.error('Database error:', e);
});

// Model exports using Prisma client
const User = prisma.user;
const Project = prisma.project;
const Template = prisma.template;
const Agent = prisma.agent;
const UsageRecord = prisma.usageRecord;
const Subscription = prisma.subscription;
const Invoice = prisma.invoice;
const PaymentMethod = prisma.paymentMethod;
const Integration = prisma.integration;
const ApiKey = prisma.apiKey;
const AuditLog = prisma.auditLog;
const Configuration = prisma.configuration;
const NotificationSettings = prisma.notificationSettings;
const FileUpload = prisma.fileUpload;
const Webhook = prisma.webhook;
const WebhookDelivery = prisma.webhookDelivery;

// New models for cross-platform integration
const OAuthAccount = prisma.oAuthAccount;
const UserDevice = prisma.userDevice;
const SyncState = prisma.syncState;
const AIProviderStatus = prisma.aIProviderStatus;
const UsageAnalytics = prisma.usageAnalytics;

// Connection management
const connectDB = async () => {
  try {
    await prisma.$connect();
    logger.info('Database connected successfully');
    return prisma;
  } catch (error) {
    logger.error('Database connection failed:', error);
    throw error;
  }
};

const disconnectDB = async () => {
  try {
    await prisma.$disconnect();
    logger.info('Database disconnected');
  } catch (error) {
    logger.error('Database disconnection failed:', error);
    throw error;
  }
};

// Health check
const healthCheck = async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'healthy', timestamp: new Date() };
  } catch (error) {
    logger.error('Database health check failed:', error);
    return { status: 'unhealthy', error: error.message, timestamp: new Date() };
  }
};

module.exports = {
  // Prisma client instance
  prisma,
  
  // Connection management
  connectDB,
  disconnectDB,
  healthCheck,
  
  // Core models
  User,
  Project,
  Template,
  Agent,
  UsageRecord,
  Subscription,
  Invoice,
  PaymentMethod,
  Integration,
  ApiKey,
  AuditLog,
  Configuration,
  NotificationSettings,
  FileUpload,
  Webhook,
  WebhookDelivery,
  
  // Cross-platform integration models
  OAuthAccount,
  UserDevice,
  SyncState,
  AIProviderStatus,
  UsageAnalytics
};