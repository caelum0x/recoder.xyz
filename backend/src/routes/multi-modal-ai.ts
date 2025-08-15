/**
 * Multi-Modal AI API Routes
 * DOMINATION TASK: API endpoints for unified AI processing of code, docs, and conversations
 */

const { Router } = require('express');
const { multiModalAI } = require('../services/multi-modal-ai-service');
const { logger } = require('../utils/logger');
const multer = require('multer');
const path = require('path');

const router = Router();

// Configure multer for file uploads (code and documentation files)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB limit for documents
  },
  fileFilter: (req: any, file: any, cb: any) => {
    const allowedExtensions = [
      '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.go', '.rs', '.php',
      '.md', '.txt', '.html', '.json', '.yaml', '.yml', '.xml'
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type for multi-modal processing'));
    }
  }
});

// Validation middleware
const validateRequest = (req: any, res: any, next: any) => {
  const requestId = req.headers['x-request-id'] || `multimodal_${Date.now()}`;
  req.body.requestId = requestId;
  next();
};

/**
 * POST /api/multi-modal-ai/process
 * Process multi-modal input (code + docs + conversation)
 */
router.post('/process', validateRequest, async (req: any, res: any) => {
  try {
    const { 
      code, 
      documentation, 
      conversation, 
      query, 
      mode = 'unified_analysis' 
    } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query is required'
      });
    }

    logger.info('Multi-modal AI processing requested', {
      requestId: req.body.requestId,
      mode,
      hasCode: !!code,
      hasDocumentation: !!documentation,
      hasConversation: !!conversation,
      queryLength: query.length
    });

    const input = {
      code: code ? {
        content: code.content,
        filePath: code.filePath || 'input.js',
        language: code.language || 'javascript',
        dependencies: code.dependencies,
        framework: code.framework
      } : undefined,
      documentation: documentation ? {
        content: documentation.content,
        format: documentation.format || 'markdown',
        metadata: documentation.metadata
      } : undefined,
      conversation: conversation ? {
        messages: conversation.messages || [],
        context: conversation.context
      } : undefined,
      query,
      mode
    };

    const result = await multiModalAI.processMultiModal(input);

    res.json({
      success: true,
      data: {
        response: result,
        summary: {
          modalitiesUsed: result.usedModalities,
          confidence: result.confidence,
          processingTime: result.processingTime,
          hasGeneratedCode: !!result.generatedCode,
          hasDocumentation: !!result.documentation,
          hasConversationResponse: !!result.conversationResponse,
          hasAnalysis: !!result.analysis
        }
      },
      metadata: {
        requestId: req.body.requestId,
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      }
    });

  } catch (error) {
    logger.error('Multi-modal AI processing failed:', error);
    res.status(500).json({
      success: false,
      error: 'Multi-modal processing failed',
      message: error.message
    });
  }
});

/**
 * POST /api/multi-modal-ai/process-files
 * Process uploaded files with multi-modal AI
 */
router.post('/process-files', 
  upload.fields([
    { name: 'codeFiles', maxCount: 10 },
    { name: 'documentFiles', maxCount: 5 }
  ]), 
  validateRequest, 
  async (req: any, res: any) => {
    try {
      if (!req.files || (!req.files.codeFiles && !req.files.documentFiles)) {
        return res.status(400).json({
          success: false,
          error: 'At least one file must be uploaded'
        });
      }

      const { query, mode = 'unified_analysis', conversationContext } = req.body;

      if (!query) {
        return res.status(400).json({
          success: false,
          error: 'Query is required'
        });
      }

      logger.info('Multi-modal file processing requested', {
        requestId: req.body.requestId,
        codeFiles: req.files.codeFiles?.length || 0,
        documentFiles: req.files.documentFiles?.length || 0,
        query: query.slice(0, 100)
      });

      // Process code files
      let codeContext;
      if (req.files.codeFiles && req.files.codeFiles.length > 0) {
        const codeFile = req.files.codeFiles[0]; // Use first code file
        const content = codeFile.buffer.toString('utf-8');
        const language = detectLanguageFromExtension(path.extname(codeFile.originalname));
        
        codeContext = {
          content,
          filePath: codeFile.originalname,
          language,
          dependencies: req.body.dependencies ? JSON.parse(req.body.dependencies) : undefined,
          framework: req.body.framework
        };
      }

      // Process document files
      let documentContext;
      if (req.files.documentFiles && req.files.documentFiles.length > 0) {
        const docFile = req.files.documentFiles[0]; // Use first document file
        const content = docFile.buffer.toString('utf-8');
        const format = detectDocumentFormat(path.extname(docFile.originalname));
        
        documentContext = {
          content,
          format,
          metadata: {
            title: docFile.originalname,
            created: new Date()
          }
        };
      }

      // Process conversation context
      let conversationContextParsed;
      if (conversationContext) {
        try {
          conversationContextParsed = JSON.parse(conversationContext);
        } catch (e) {
          logger.warn('Invalid conversation context JSON:', e);
        }
      }

      const input = {
        code: codeContext,
        documentation: documentContext,
        conversation: conversationContextParsed,
        query,
        mode
      };

      const result = await multiModalAI.processMultiModal(input);

      res.json({
        success: true,
        data: {
          files: {
            codeFiles: req.files.codeFiles?.map((f: any) => ({
              name: f.originalname,
              size: f.size,
              language: detectLanguageFromExtension(path.extname(f.originalname))
            })) || [],
            documentFiles: req.files.documentFiles?.map((f: any) => ({
              name: f.originalname,
              size: f.size,
              format: detectDocumentFormat(path.extname(f.originalname))
            })) || []
          },
          response: result,
          summary: {
            totalFiles: (req.files.codeFiles?.length || 0) + (req.files.documentFiles?.length || 0),
            modalitiesUsed: result.usedModalities,
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
      logger.error('Multi-modal file processing failed:', error);
      res.status(500).json({
        success: false,
        error: 'File processing failed',
        message: error.message
      });
    }
  }
);

/**
 * POST /api/multi-modal-ai/code-generation
 * Specialized endpoint for code generation with multi-modal context
 */
router.post('/code-generation', validateRequest, async (req: any, res: any) => {
  try {
    const { query, context, language = 'javascript', framework } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query is required for code generation'
      });
    }

    const input = {
      code: context?.existingCode ? {
        content: context.existingCode,
        filePath: context.filePath || 'context.js',
        language,
        framework
      } : undefined,
      documentation: context?.relatedDocs ? {
        content: context.relatedDocs,
        format: 'markdown'
      } : undefined,
      conversation: context?.previousConversation ? {
        messages: context.previousConversation
      } : undefined,
      query,
      mode: 'code_generation'
    };

    const result = await multiModalAI.processMultiModal(input);

    res.json({
      success: true,
      data: {
        generatedCode: result.generatedCode,
        analysis: result.analysis,
        confidence: result.confidence,
        processingTime: result.processingTime
      },
      metadata: {
        requestId: req.body.requestId,
        timestamp: new Date().toISOString(),
        language,
        framework
      }
    });

  } catch (error) {
    logger.error('Multi-modal code generation failed:', error);
    res.status(500).json({
      success: false,
      error: 'Code generation failed',
      message: error.message
    });
  }
});

/**
 * POST /api/multi-modal-ai/documentation-generation
 * Specialized endpoint for documentation generation
 */
router.post('/documentation-generation', validateRequest, async (req: any, res: any) => {
  try {
    const { query, codeContent, existingDocs, format = 'markdown' } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query is required for documentation generation'
      });
    }

    const input = {
      code: codeContent ? {
        content: codeContent,
        filePath: 'source.js',
        language: 'javascript'
      } : undefined,
      documentation: existingDocs ? {
        content: existingDocs,
        format
      } : undefined,
      query,
      mode: 'documentation'
    };

    const result = await multiModalAI.processMultiModal(input);

    res.json({
      success: true,
      data: {
        documentation: result.documentation,
        analysis: result.analysis,
        confidence: result.confidence,
        processingTime: result.processingTime
      },
      metadata: {
        requestId: req.body.requestId,
        timestamp: new Date().toISOString(),
        format
      }
    });

  } catch (error) {
    logger.error('Multi-modal documentation generation failed:', error);
    res.status(500).json({
      success: false,
      error: 'Documentation generation failed',
      message: error.message
    });
  }
});

/**
 * POST /api/multi-modal-ai/conversation
 * Specialized endpoint for conversational AI with context
 */
router.post('/conversation', validateRequest, async (req: any, res: any) => {
  try {
    const { query, conversationHistory, codeContext, documentContext } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query is required for conversation'
      });
    }

    const input = {
      code: codeContext ? {
        content: codeContext.content,
        filePath: codeContext.filePath || 'context.js',
        language: codeContext.language || 'javascript'
      } : undefined,
      documentation: documentContext ? {
        content: documentContext.content,
        format: documentContext.format || 'markdown'
      } : undefined,
      conversation: {
        messages: conversationHistory || [],
        context: {
          sessionId: req.body.requestId,
          timestamp: new Date()
        }
      },
      query,
      mode: 'conversation'
    };

    const result = await multiModalAI.processMultiModal(input);

    res.json({
      success: true,
      data: {
        response: result.conversationResponse,
        analysis: result.analysis,
        confidence: result.confidence,
        processingTime: result.processingTime
      },
      metadata: {
        requestId: req.body.requestId,
        timestamp: new Date().toISOString(),
        sessionId: req.body.requestId
      }
    });

  } catch (error) {
    logger.error('Multi-modal conversation failed:', error);
    res.status(500).json({
      success: false,
      error: 'Conversation processing failed',
      message: error.message
    });
  }
});

/**
 * GET /api/multi-modal-ai/capabilities
 * Get information about multi-modal AI capabilities
 */
router.get('/capabilities', validateRequest, async (req: any, res: any) => {
  try {
    res.json({
      success: true,
      data: {
        supportedModalities: ['code', 'documentation', 'conversation'],
        processingModes: ['code_generation', 'documentation', 'conversation', 'unified_analysis'],
        supportedCodeLanguages: [
          'javascript', 'typescript', 'python', 'java', 'cpp', 'c', 'go', 'rust', 'php'
        ],
        supportedDocumentFormats: ['markdown', 'text', 'html', 'json'],
        features: {
          crossModalAnalysis: true,
          contextAwareness: true,
          realTimeProcessing: true,
          batchProcessing: true,
          fileUpload: true,
          conversationMemory: true
        },
        limits: {
          maxFileSize: '20MB',
          maxCodeFiles: 10,
          maxDocumentFiles: 5,
          maxConversationHistory: 100
        }
      }
    });
  } catch (error) {
    logger.error('Failed to get multi-modal capabilities:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get capabilities'
    });
  }
});

/**
 * GET /api/multi-modal-ai/health
 * Health check endpoint
 */
router.get('/health', (req: any, res: any) => {
  res.json({
    success: true,
    status: 'healthy',
    service: 'Multi-Modal AI',
    timestamp: new Date().toISOString(),
    features: {
      codeProcessing: true,
      documentationProcessing: true,
      conversationProcessing: true,
      unifiedAnalysis: true,
      fileUpload: true,
      realTimeProcessing: true
    }
  });
});

// Helper functions
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

  return langMap[extension.toLowerCase()] || 'text';
}

function detectDocumentFormat(extension: string): string {
  const formatMap: { [key: string]: string } = {
    '.md': 'markdown',
    '.txt': 'text',
    '.html': 'html',
    '.htm': 'html',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.xml': 'xml'
  };

  return formatMap[extension.toLowerCase()] || 'text';
}

// Error handling middleware
router.use((error: any, req: any, res: any, next: any) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large',
        message: 'Maximum file size is 20MB'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        error: 'Too many files',
        message: 'Maximum 10 code files and 5 document files allowed'
      });
    }
  }

  if (error.message?.includes('Unsupported file type')) {
    return res.status(400).json({
      success: false,
      error: 'Unsupported file type',
      message: 'Only supported code and document files are allowed'
    });
  }

  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: error.message
  });
});

module.exports = router;