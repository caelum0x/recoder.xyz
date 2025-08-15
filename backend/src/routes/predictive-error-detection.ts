/**
 * Predictive Error Detection API Routes
 * DOMINATION TASK: API endpoints for AI-powered error prediction and code quality analysis
 */

const { Router } = require('express');
const { predictiveErrorDetection } = require('../services/predictive-error-detection');
const { logger } = require('../utils/logger');
const multer = require('multer');
const path = require('path');

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.go', '.rs', '.php'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type for code analysis'));
    }
  }
});

// Validation middleware
const validateRequest = (req: any, res: any, next: any) => {
  const requestId = req.headers['x-request-id'] || 'anonymous';
  req.body.requestId = requestId;
  next();
};

/**
 * POST /api/predictive-error-detection/analyze
 * Analyze code for potential errors and quality issues
 */
router.post('/analyze', validateRequest, async (req: any, res: any) => {
  try {
    const { code, filePath, language, framework, dependencies, gitHistory } = req.body;

    if (!code || !filePath || !language) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: code, filePath, language'
      });
    }

    logger.info('Predictive error analysis requested', {
      requestId: req.body.requestId,
      filePath,
      language,
      codeLength: code.length
    });

    const context = {
      filePath,
      content: code,
      language,
      framework,
      dependencies,
      gitHistory
    };

    const result = await predictiveErrorDetection.analyzeCode(context);

    res.json({
      success: true,
      data: {
        predictions: result.predictions,
        qualityMetrics: result.qualityMetrics,
        recommendations: result.recommendations,
        confidence: result.confidence,
        processingTime: result.processingTime,
        summary: {
          totalErrors: result.predictions.length,
          criticalErrors: result.predictions.filter(p => p.severity === 'critical').length,
          highPriorityErrors: result.predictions.filter(p => p.severity === 'high').length,
          overallQuality: result.qualityMetrics.overall,
          technicalDebtHours: result.qualityMetrics.technicalDebt.estimatedHours
        }
      },
      metadata: {
        requestId: req.body.requestId,
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      }
    });

  } catch (error) {
    logger.error('Predictive error analysis failed:', error);
    res.status(500).json({
      success: false,
      error: 'Analysis failed',
      message: error.message
    });
  }
});

/**
 * POST /api/predictive-error-detection/analyze-file
 * Analyze uploaded file for potential errors
 */
router.post('/analyze-file', upload.single('file'), validateRequest, async (req: any, res: any) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const { framework, dependencies } = req.body;
    const filePath = req.file.originalname;
    const content = req.file.buffer.toString('utf-8');
    const language = detectLanguageFromExtension(path.extname(filePath));

    logger.info('File analysis requested', {
      requestId: req.body.requestId,
      filePath,
      language,
      fileSize: req.file.size
    });

    const context = {
      filePath,
      content,
      language,
      framework,
      dependencies: dependencies ? JSON.parse(dependencies) : undefined
    };

    const result = await predictiveErrorDetection.analyzeCode(context);

    res.json({
      success: true,
      data: {
        file: {
          name: filePath,
          size: req.file.size,
          language
        },
        analysis: {
          predictions: result.predictions,
          qualityMetrics: result.qualityMetrics,
          recommendations: result.recommendations,
          confidence: result.confidence,
          processingTime: result.processingTime
        }
      },
      metadata: {
        requestId: req.body.requestId,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('File analysis failed:', error);
    res.status(500).json({
      success: false,
      error: 'File analysis failed',
      message: error.message
    });
  }
});

/**
 * GET /api/predictive-error-detection/patterns
 * Get available error patterns and their descriptions
 */
router.get('/patterns', validateRequest, async (req: any, res: any) => {
  try {
    const { type, severity, language } = req.query;

    // For now, return mock patterns since we're using in-memory storage
    const patterns = [
      {
        id: 'undefined_variable',
        type: 'runtime',
        severity: 'high',
        description: 'Variable is used before being declared or is out of scope',
        languages: ['javascript', 'typescript'],
        examples: ['console.log(myVar); // myVar is not defined']
      },
      {
        id: 'async_await_missing',
        type: 'logic',
        severity: 'medium',
        description: 'Async function called without await, may cause timing issues',
        languages: ['javascript', 'typescript'],
        examples: ['const result = fetchData(); // Missing await']
      },
      {
        id: 'sql_injection_risk',
        type: 'security',
        severity: 'critical',
        description: 'SQL query built with string concatenation, vulnerable to injection',
        languages: ['javascript', 'typescript', 'python', 'php'],
        examples: ['query = "SELECT * FROM users WHERE id = " + userId;']
      }
    ];

    let filteredPatterns = patterns;

    // Apply filters
    if (type) {
      filteredPatterns = filteredPatterns.filter(p => p.type === type);
    }
    if (severity) {
      filteredPatterns = filteredPatterns.filter(p => p.severity === severity);
    }
    if (language) {
      filteredPatterns = filteredPatterns.filter(p => p.languages.includes(language as string));
    }

    res.json({
      success: true,
      data: {
        patterns: filteredPatterns,
        total: filteredPatterns.length,
        filters: { type, severity, language }
      }
    });

  } catch (error) {
    logger.error('Failed to get patterns:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get patterns'
    });
  }
});

/**
 * GET /api/predictive-error-detection/analytics
 * Get analytics and trends for error predictions
 */
router.get('/analytics', validateRequest, async (req: any, res: any) => {
  try {
    const { timeRange = 7 } = req.query;
    const analytics = await predictiveErrorDetection.getAnalytics(Number(timeRange));

    res.json({
      success: true,
      data: analytics || {
        totalPredictions: 0,
        averageQuality: 0,
        mostCommonErrors: [],
        qualityTrend: [],
        improvementSuggestions: []
      },
      metadata: {
        timeRange: Number(timeRange),
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Failed to get analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get analytics'
    });
  }
});

/**
 * POST /api/predictive-error-detection/feedback
 * Provide feedback on prediction accuracy for model training
 */
router.post('/feedback', validateRequest, async (req: any, res: any) => {
  try {
    const { filePath, actualErrors, qualityFeedback, predictionAccuracy } = req.body;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: filePath'
      });
    }

    logger.info('Received prediction feedback', {
      requestId: req.body.requestId,
      filePath,
      actualErrorsCount: actualErrors?.length || 0,
      qualityFeedback,
      predictionAccuracy
    });

    await predictiveErrorDetection.trainWithFeedback(
      filePath,
      actualErrors || [],
      qualityFeedback || 0.5
    );

    res.json({
      success: true,
      message: 'Feedback received and will be used to improve predictions',
      data: {
        filePath,
        feedbackProcessed: true
      }
    });

  } catch (error) {
    logger.error('Failed to process feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process feedback'
    });
  }
});

/**
 * POST /api/predictive-error-detection/batch-analyze
 * Analyze multiple files in batch
 */
router.post('/batch-analyze', upload.array('files', 20), validateRequest, async (req: any, res: any) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files uploaded'
      });
    }

    logger.info('Batch analysis requested', {
      requestId: req.body.requestId,
      fileCount: req.files.length
    });

    const results = [];
    const files = req.files as Express.Multer.File[];

    for (const file of files) {
      try {
        const filePath = file.originalname;
        const content = file.buffer.toString('utf-8');
        const language = detectLanguageFromExtension(path.extname(filePath));

        const context = {
          filePath,
          content,
          language
        };

        const result = await predictiveErrorDetection.analyzeCode(context);
        
        results.push({
          file: filePath,
          success: true,
          analysis: {
            errorCount: result.predictions.length,
            qualityScore: result.qualityMetrics.overall,
            criticalErrors: result.predictions.filter(p => p.severity === 'critical').length,
            confidence: result.confidence,
            processingTime: result.processingTime
          },
          summary: {
            needsAttention: result.predictions.length > 0 || result.qualityMetrics.overall < 0.7,
            priority: result.predictions.some(p => p.severity === 'critical') ? 'high' : 'medium'
          }
        });

      } catch (error) {
        results.push({
          file: file.originalname,
          success: false,
          error: error.message
        });
      }
    }

    // Generate batch summary
    const successful = results.filter(r => r.success);
    const totalErrors = successful.reduce((sum, r) => sum + (r.analysis?.errorCount || 0), 0);
    const avgQuality = successful.length > 0 
      ? successful.reduce((sum, r) => sum + (r.analysis?.qualityScore || 0), 0) / successful.length
      : 0;

    res.json({
      success: true,
      data: {
        results,
        summary: {
          totalFiles: files.length,
          successfulAnalyses: successful.length,
          failedAnalyses: results.length - successful.length,
          totalErrorsPredicted: totalErrors,
          averageQuality: avgQuality,
          filesNeedingAttention: successful.filter(r => r.summary?.needsAttention).length
        }
      },
      metadata: {
        requestId: req.body.requestId,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Batch analysis failed:', error);
    res.status(500).json({
      success: false,
      error: 'Batch analysis failed'
    });
  }
});

/**
 * GET /api/predictive-error-detection/health
 * Health check endpoint
 */
router.get('/health', (req: any, res: any) => {
  res.json({
    success: true,
    status: 'healthy',
    service: 'Predictive Error Detection',
    timestamp: new Date().toISOString(),
    features: {
      errorPrediction: true,
      qualityAnalysis: true,
      batchProcessing: true,
      fileUpload: true,
      analytics: true,
      feedback: true
    }
  });
});

// Helper function to detect language from file extension
function detectLanguageFromExtension(extension: string): string {
  const langMap: { [key: string]: string } = {
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.py': 'python',
    '.java': 'java',
    '.cpp': 'cpp',
    '.c': 'c',
    '.go': 'go',
    '.rs': 'rust',
    '.php': 'php',
    '.rb': 'ruby',
    '.cs': 'csharp',
    '.swift': 'swift',
    '.kt': 'kotlin'
  };

  return langMap[extension.toLowerCase()] || 'unknown';
}

// Error handling middleware
router.use((error: any, req: any, res: any, next: any) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large',
        message: 'Maximum file size is 10MB'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        error: 'Too many files',
        message: 'Maximum 20 files allowed for batch processing'
      });
    }
  }

  if (error.message?.includes('Unsupported file type')) {
    return res.status(400).json({
      success: false,
      error: 'Unsupported file type',
      message: 'Only source code files are supported'
    });
  }

  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: error.message
  });
});

module.exports = router;