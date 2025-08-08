const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const oauthRoutes = require('./routes/oauth');
const devicesRoutes = require('./routes/devices');
const syncRoutes = require('./routes/sync');
const aiProvidersRoutes = require('./routes/ai-providers');
const agentRoutes = require('./routes/agents');
const projectRoutes = require('./routes/projects');
const plannerRoutes = require('./routes/planner');
const structureRoutes = require('./routes/structure');
const validationRoutes = require('./routes/validation');
const templateRoutes = require('./routes/templates');
const modelRoutes = require('./routes/models');
const billingRoutes = require('./routes/billing');
const analyticsRoutes = require('./routes/analytics');
const notificationsRoutes = require('./routes/notifications');

// Import middleware
const { authenticateToken } = require('./middleware/auth');
// Rate limiting and usage middleware - commented out to fix app startup
// const rateLimitMiddleware = require('./middleware/rateLimit');
// const usageMiddleware = require('./middleware/usage');
// const validationMiddleware = require('./middleware/validation'); // Not used directly in routes
const { validatePlanningRequest } = require('./middleware/planning');

// Import services
const { logger } = require('./utils/logger');
const { connectDB } = require('./models/index');
const { connectRedis } = require('./services/redis');
const { initializeQueues } = require('./services/queue');
const WebSocketService = require('./services/websocket');

class CodeCraftServer {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new Server(this.server, {
      cors: {
        origin: process.env.CORS_ORIGIN || "*",
        methods: ["GET", "POST", "PUT", "DELETE"]
      }
    });
    this.port = process.env.PORT || 3001;
    
    // Initialize WebSocket service
    this.webSocketService = null;
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupErrorHandling();
  }

  setupMiddleware() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // CORS
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || "*",
      credentials: true
    }));

    // Compression
    this.app.use(compression());

    // Logging
    this.app.use(morgan('combined', {
      stream: { write: message => logger.info(message.trim()) }
    }));

    // Body parsing
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    // Rate limiting - TODO: fix middleware
    // this.app.use(rateLimitMiddleware);

    // Usage tracking - TODO: fix middleware
    // this.app.use(usageMiddleware);
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development'
      });
    });

    // API documentation
    if (process.env.NODE_ENV !== 'production') {
      const swaggerJsdoc = require('swagger-jsdoc');
      const swaggerUi = require('swagger-ui-express');
      
      const options = {
        definition: {
          openapi: '3.0.0',
          info: {
            title: 'CodeCraft API',
            version: '1.0.0',
            description: 'AI-powered development platform API',
          },
          servers: [
            {
              url: `http://localhost:${this.port}`,
              description: 'Development server',
            },
          ],
        },
        apis: ['./src/routes/*.js'],
      };
      
      const specs = swaggerJsdoc(options);
      this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
    }

    // API routes
    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/oauth', oauthRoutes);
    this.app.use('/api/devices', devicesRoutes);
    this.app.use('/api/sync', syncRoutes);
    this.app.use('/api/ai-providers', aiProvidersRoutes);
    this.app.use('/api/agents', authenticateToken, agentRoutes);
    this.app.use('/api/projects', authenticateToken, projectRoutes);
    this.app.use('/api/planner', authenticateToken, validatePlanningRequest, plannerRoutes);
    this.app.use('/api/structure', authenticateToken, structureRoutes);
    this.app.use('/api/validation', authenticateToken, validationRoutes);
    this.app.use('/api/templates', templateRoutes);
    this.app.use('/api/models', modelRoutes);
    this.app.use('/api/billing', authenticateToken, billingRoutes);
    this.app.use('/api/analytics', analyticsRoutes);
    this.app.use('/api/notifications', notificationsRoutes);

    // Make server instance available to routes
    this.app.set('server', this);

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: {
          message: 'Endpoint not found',
          code: 'NOT_FOUND',
          path: req.originalUrl
        }
      });
    });
  }

  setupWebSocket() {
    // Initialize enhanced WebSocket service
    this.webSocketService = new WebSocketService(this.io);
    
    logger.info('Enhanced WebSocket services initialized with:');
    logger.info('- Cross-platform synchronization');
    logger.info('- Real-time collaboration');
    logger.info('- Push notifications');
    logger.info('- Activity tracking');
    logger.info('- Analytics integration');
  }

  setupErrorHandling() {
    // Global error handler
    this.app.use((error, req, res, next) => {
      logger.error('Unhandled error:', error);

      // Don't leak error details in production
      const isDevelopment = process.env.NODE_ENV === 'development';
      
      res.status(error.status || 500).json({
        error: {
          message: error.message || 'Internal server error',
          code: error.code || 'INTERNAL_ERROR',
          ...(isDevelopment && { stack: error.stack }),
          timestamp: new Date().toISOString()
        }
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });
  }

  // WebSocket service accessors
  sendNotification(userId, notification) {
    return this.webSocketService?.sendNotification(userId, notification);
  }

  sendToDevice(deviceId, event, data) {
    return this.webSocketService?.sendToDevice(deviceId, event, data);
  }

  broadcastToChannel(channel, event, data) {
    return this.webSocketService?.broadcastToChannel(channel, event, data);
  }

  getConnectedUsers() {
    return this.webSocketService?.getConnectedUsers() || [];
  }

  getCollaborationStatus(projectId) {
    return this.webSocketService?.getCollaborationStatus(projectId);
  }

  async initialize() {
    try {
      // Connect to database
      await connectDB();
      logger.info('Database connected successfully');

      // Connect to Redis
      await connectRedis();
      logger.info('Redis connected successfully');

      // Initialize job queues
      await initializeQueues();
      logger.info('Job queues initialized');

      logger.info('Server initialization completed');
    } catch (error) {
      logger.error('Server initialization failed:', error);
      process.exit(1);
    }
  }

  async start() {
    try {
      await this.initialize();
      
      this.server.listen(this.port, () => {
        logger.info(`🚀 CodeCraft API Server running on port ${this.port}`);
        logger.info(`📚 API Documentation: http://localhost:${this.port}/api-docs`);
        logger.info(`🔍 Health Check: http://localhost:${this.port}/health`);
        logger.info(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
      });
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  async stop() {
    logger.info('Stopping server...');
    
    return new Promise((resolve) => {
      this.server.close(() => {
        logger.info('Server stopped');
        resolve();
      });
    });
  }
}

// Create and start server
const server = new CodeCraftServer();

if (require.main === module) {
  server.start().catch(error => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });
}

module.exports = { CodeCraftServer };