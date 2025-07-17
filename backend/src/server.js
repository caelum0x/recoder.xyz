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
const agentRoutes = require('./routes/agents');
const projectRoutes = require('./routes/projects');
const plannerRoutes = require('./routes/planner');
const structureRoutes = require('./routes/structure');
const validationRoutes = require('./routes/validation');
const templateRoutes = require('./routes/templates');
const modelRoutes = require('./routes/models');
const billingRoutes = require('./routes/billing');

// Import middleware
const authMiddleware = require('./middleware/auth');
const rateLimitMiddleware = require('./middleware/rateLimit');
const usageMiddleware = require('./middleware/usage');
const validationMiddleware = require('./middleware/validation');
const planningMiddleware = require('./middleware/planning');

// Import services
const { logger } = require('./utils/logger');
const { connectDB } = require('./db/connection');
const { connectRedis } = require('./services/redis');
const { initializeQueues } = require('./services/queue');

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

    // Rate limiting
    this.app.use(rateLimitMiddleware);

    // Usage tracking
    this.app.use(usageMiddleware);
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
    this.app.use('/api/agents', authMiddleware, agentRoutes);
    this.app.use('/api/projects', authMiddleware, projectRoutes);
    this.app.use('/api/planner', authMiddleware, planningMiddleware, plannerRoutes);
    this.app.use('/api/structure', authMiddleware, structureRoutes);
    this.app.use('/api/validation', authMiddleware, validationRoutes);
    this.app.use('/api/templates', templateRoutes);
    this.app.use('/api/models', modelRoutes);
    this.app.use('/api/billing', authMiddleware, billingRoutes);

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
    this.io.on('connection', (socket) => {
      logger.info(`Client connected: ${socket.id}`);

      // Join user-specific room for real-time updates
      socket.on('join', (data) => {
        if (data.userId) {
          socket.join(`user:${data.userId}`);
          logger.info(`User ${data.userId} joined room`);
        }
      });

      // Handle planning updates
      socket.on('planning:start', (data) => {
        // Emit planning progress updates
        this.emitPlanningProgress(socket, data);
      });

      // Handle generation updates
      socket.on('generation:start', (data) => {
        // Emit generation progress updates
        this.emitGenerationProgress(socket, data);
      });

      // Handle validation updates
      socket.on('validation:start', (data) => {
        // Emit validation progress updates
        this.emitValidationProgress(socket, data);
      });

      socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id}`);
      });
    });
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

  async emitPlanningProgress(socket, data) {
    // Simulate planning progress
    const stages = [
      'Analyzing requirements',
      'Detecting project type',
      'Planning architecture',
      'Selecting tech stack',
      'Creating implementation phases',
      'Validating plan'
    ];

    for (let i = 0; i < stages.length; i++) {
      setTimeout(() => {
        socket.emit('planning:progress', {
          stage: stages[i],
          progress: Math.round(((i + 1) / stages.length) * 100),
          completed: i === stages.length - 1
        });
      }, i * 1000);
    }
  }

  async emitGenerationProgress(socket, data) {
    // Simulate generation progress
    const stages = [
      'Setting up project structure',
      'Generating core files',
      'Implementing features',
      'Adding integrations',
      'Creating tests',
      'Configuring deployment'
    ];

    for (let i = 0; i < stages.length; i++) {
      setTimeout(() => {
        socket.emit('generation:progress', {
          stage: stages[i],
          progress: Math.round(((i + 1) / stages.length) * 100),
          completed: i === stages.length - 1
        });
      }, i * 2000);
    }
  }

  async emitValidationProgress(socket, data) {
    // Simulate validation progress
    const checks = [
      'Checking code syntax',
      'Validating integrations',
      'Testing functionality',
      'Security scan',
      'Performance check',
      'Production readiness'
    ];

    for (let i = 0; i < checks.length; i++) {
      setTimeout(() => {
        socket.emit('validation:progress', {
          check: checks[i],
          progress: Math.round(((i + 1) / checks.length) * 100),
          completed: i === checks.length - 1
        });
      }, i * 1500);
    }
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