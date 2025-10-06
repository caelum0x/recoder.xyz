// Advanced RAG Learning API Routes
// RESTful endpoints for self-learning RAG system with pattern recognition

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { advancedRAGLearning } = require('../services/advanced-rag-learning');
const { authenticateUser } = require('../middleware/auth');
const { logger } = require('../utils/logger');
const { getErrorMessage } = require('../utils/error-helpers');

const router = express.Router();

// Rate limiting for learning endpoints
const learningLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit to 50 learning requests per windowMs
  message: {
    error: 'Too many learning requests, please try again later.',
    retryAfter: 15 * 60
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(learningLimiter);
router.use(authenticateUser);

/**
 * POST /api/advanced-rag-learning/query
 * Enhanced RAG query with self-learning and pattern recognition
 */
router.post('/query', [
  body('query').isString().isLength({ min: 1, max: 5000 }).withMessage('Query must be 1-5000 characters'),
  body('taskType').isIn(['generation', 'explanation', 'refactoring', 'debugging', 'optimization']).withMessage('Invalid task type'),
  body('language').optional().isString().withMessage('Language must be a string'),
  body('framework').optional().isString().withMessage('Framework must be a string'),
  body('codeContext').optional().isString().withMessage('Code context must be a string'),
  body('learningEnabled').optional().isBoolean().withMessage('Learning enabled must be boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const userId = req.user.id;
    const {
      query,
      taskType,
      language,
      framework,
      codeContext,
      learningEnabled = true
    } = req.body;

    const startTime = Date.now();

    const result = await advancedRAGLearning.queryWithLearning({
      userId,
      query,
      codeContext,
      language,
      framework,
      taskType,
      learningEnabled
    });

    const processingTime = Date.now() - startTime;

    logger.info('Advanced RAG learning query completed', {
      userId,
      taskType,
      processingTime,
      patternsRecognized: result.recognizedPatterns.length,
      adaptationsMade: result.adaptations.length
    });

    res.json({
      success: true,
      data: {
        ...result,
        processingTime,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Advanced RAG learning query failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process learning query',
      details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? getErrorMessage(error) : String(error)) : undefined
    });
  }
});

/**
 * POST /api/advanced-rag-learning/feedback
 * Provide feedback for learning system improvement
 */
router.post('/feedback', [
  body('sessionId').isString().withMessage('Session ID is required'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1-5'),
  body('specificFeedback').isString().withMessage('Specific feedback is required'),
  body('accepted').isBoolean().withMessage('Accepted must be boolean'),
  body('modifications').optional().isArray().withMessage('Modifications must be an array'),
  body('suggestedPatterns').optional().isArray().withMessage('Suggested patterns must be an array')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const {
      sessionId,
      rating,
      specificFeedback,
      accepted,
      modifications,
      suggestedPatterns
    } = req.body;

    const result = await advancedRAGLearning.provideFeedback(sessionId, {
      rating,
      specificFeedback,
      accepted,
      modifications,
      suggestedPatterns
    });

    res.json({
      success: true,
      data: {
        ...result,
        message: 'Feedback processed and learned successfully',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Feedback processing failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process feedback',
      details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? getErrorMessage(error) : String(error)) : undefined
    });
  }
});

/**
 * GET /api/advanced-rag-learning/recommendations
 * Get personalized code recommendations based on learned patterns
 */
router.get('/recommendations', [
  query('language').optional().isString(),
  query('framework').optional().isString(),
  query('projectType').optional().isString(),
  query('taskType').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const userId = req.user.id;
    const { language, framework, projectType, taskType } = req.query;

    const recommendations = await advancedRAGLearning.getPersonalizedRecommendations(
      userId,
      { language, framework, projectType, taskType }
    );

    res.json({
      success: true,
      data: {
        ...recommendations,
        generatedAt: new Date().toISOString(),
        userId
      }
    });

  } catch (error) {
    logger.error('Getting recommendations failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get recommendations',
      details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? getErrorMessage(error) : String(error)) : undefined
    });
  }
});

/**
 * POST /api/advanced-rag-learning/analyze-codebase
 * Analyze codebase patterns for learning
 */
router.post('/analyze-codebase', [
  body('codeFiles').isArray().withMessage('Code files must be an array'),
  body('codeFiles.*.path').isString().withMessage('File path is required'),
  body('codeFiles.*.content').isString().withMessage('File content is required'),
  body('codeFiles.*.language').isString().withMessage('File language is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const userId = req.user.id;
    const { codeFiles } = req.body;

    // Limit the number of files to analyze
    if (codeFiles.length > 50) {
      return res.status(400).json({
        success: false,
        error: 'Too many files to analyze. Maximum 50 files allowed.',
      });
    }

    const startTime = Date.now();

    const analysis = await advancedRAGLearning.analyzeCodebasePatterns(userId, codeFiles);

    const processingTime = Date.now() - startTime;

    logger.info('Codebase pattern analysis completed', {
      userId,
      filesAnalyzed: codeFiles.length,
      patternsDiscovered: analysis.discoveredPatterns.length,
      processingTime
    });

    res.json({
      success: true,
      data: {
        ...analysis,
        processingTime,
        filesAnalyzed: codeFiles.length,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Codebase analysis failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze codebase',
      details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? getErrorMessage(error) : String(error)) : undefined
    });
  }
});

/**
 * GET /api/advanced-rag-learning/analytics
 * Get learning analytics and insights
 */
router.get('/analytics', [
  query('timeRange').optional().isInt({ min: 1, max: 365 }).withMessage('Time range must be 1-365 days')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const userId = req.user.id;
    const { timeRange = 30 } = req.query;

    const analytics = await advancedRAGLearning.getLearningAnalytics(
      userId,
      parseInt(timeRange)
    );

    res.json({
      success: true,
      data: {
        ...analytics,
        timeRange: parseInt(timeRange),
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Getting learning analytics failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get learning analytics',
      details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? getErrorMessage(error) : String(error)) : undefined
    });
  }
});

/**
 * GET /api/advanced-rag-learning/patterns
 * Get discovered patterns for user
 */
router.get('/patterns', [
  query('category').optional().isString(),
  query('language').optional().isString(),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const userId = req.user.id;
    const { category, language, limit = 20 } = req.query;

    // Mock implementation - would get user's discovered patterns
    const patterns = [
      {
        id: 'user_pattern_1',
        type: 'code_structure',
        pattern: 'React Hook Pattern',
        description: 'Custom hooks following React best practices',
        examples: ['const useCustomHook = () => { ... }'],
        frequency: 15,
        confidence: 0.92,
        languages: ['typescript', 'javascript'],
        frameworks: ['react'],
        usageContext: ['hooks', 'state_management'],
        createdAt: new Date(),
        lastSeen: new Date()
      }
      // Additional patterns would be loaded from the service
    ];

    const filteredPatterns = patterns
      .filter(p => !category || p.type === category)
      .filter(p => !language || p.languages.includes(language))
      .slice(0, parseInt(limit));

    res.json({
      success: true,
      data: {
        patterns: filteredPatterns,
        totalPatterns: patterns.length,
        filteredCount: filteredPatterns.length,
        filters: {
          category: category || null,
          language: language || null,
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    logger.error('Getting patterns failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get patterns',
      details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? getErrorMessage(error) : String(error)) : undefined
    });
  }
});

/**
 * POST /api/advanced-rag-learning/pattern/reinforce
 * Reinforce a specific pattern based on positive usage
 */
router.post('/pattern/reinforce', [
  body('patternId').isString().withMessage('Pattern ID is required'),
  body('context').optional().isString().withMessage('Context must be a string'),
  body('example').optional().isString().withMessage('Example must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const userId = req.user.id;
    const { patternId, context, example } = req.body;

    // Mock implementation - would reinforce the pattern
    logger.info('Pattern reinforced', { userId, patternId, context });

    res.json({
      success: true,
      data: {
        patternId,
        reinforced: true,
        message: 'Pattern reinforcement applied successfully',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Pattern reinforcement failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reinforce pattern',
      details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? getErrorMessage(error) : String(error)) : undefined
    });
  }
});

/**
 * GET /api/advanced-rag-learning/insights
 * Get contextual insights and recommendations
 */
router.get('/insights', [
  query('taskType').optional().isString(),
  query('language').optional().isString(),
  query('framework').optional().isString()
], async (req, res) => {
  try {
    const userId = req.user.id;
    const { taskType, language, framework } = req.query;

    // Mock implementation - would generate contextual insights
    const insights = [
      {
        type: 'suggestion',
        title: 'Performance Optimization Opportunity',
        description: 'Consider using React.memo for this component to prevent unnecessary re-renders',
        codeExample: 'const MyComponent = React.memo(() => { ... });',
        severity: 'medium',
        confidence: 0.85,
        applicableLanguages: ['typescript', 'javascript'],
        relatedPatterns: ['react_optimization'],
        actionable: true,
        estimatedImpact: 'medium'
      },
      {
        type: 'best_practice',
        title: 'Error Handling Enhancement',
        description: 'Add comprehensive error boundaries for better user experience',
        severity: 'low',
        confidence: 0.9,
        applicableLanguages: ['typescript', 'javascript'],
        relatedPatterns: ['error_handling'],
        actionable: true,
        estimatedImpact: 'high'
      }
    ];

    res.json({
      success: true,
      data: {
        insights,
        context: {
          taskType: taskType || null,
          language: language || null,
          framework: framework || null
        },
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Getting insights failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get insights',
      details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? getErrorMessage(error) : String(error)) : undefined
    });
  }
});

/**
 * GET /api/advanced-rag-learning/system/status
 * Get learning system status
 */
router.get('/system/status', async (req, res) => {
  try {
    // Mock system status
    const systemStatus = {
      learningSystem: {
        status: 'operational',
        patternsInDatabase: 15847,
        activeLearningSessions: 23,
        totalUsersWithPatterns: 1247,
        lastPatternUpdate: new Date(Date.now() - 3600000).toISOString()
      },
      patternRecognition: {
        status: 'operational',
        accuracy: 0.89,
        averageConfidence: 0.84,
        recognitionLatency: 45
      },
      adaptationEngine: {
        status: 'operational',
        activeAdaptations: 156,
        averageAdaptationScore: 0.78,
        lastModelUpdate: new Date(Date.now() - 86400000).toISOString()
      },
      performance: {
        averageQueryTime: 850,
        learningLatency: 120,
        cacheHitRate: 0.85,
        successRate: 0.96
      }
    };

    res.json({
      success: true,
      data: {
        ...systemStatus,
        timestamp: new Date().toISOString(),
        version: '2.0.0'
      }
    });

  } catch (error) {
    logger.error('Getting system status failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get system status',
      details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? getErrorMessage(error) : String(error)) : undefined
    });
  }
});

// Error handling middleware
router.use((error, req, res, next) => {
  logger.error('Advanced RAG learning API error:', {
    error: getErrorMessage(error),
    stack: error.stack,
    url: req.url,
    method: req.method,
    userId: req.user?.id
  });

  res.status(error.status || 500).json({
    success: false,
    error: 'Advanced RAG learning service error',
    message: process.env.NODE_ENV === 'development' ? getErrorMessage(error) : 'Internal server error'
  });
});

module.exports = router;