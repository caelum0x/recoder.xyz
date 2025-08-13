// RAG System API Routes
// Retrieval-Augmented Generation endpoints for code understanding

import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authenticateUser, requireSubscription } from '../middleware/auth';
import { codeAnalysis } from '../services/code-analysis';
import { semanticSearch } from '../services/semantic-search';
import { vectorDatabase } from '../services/vector-database';
import { prisma } from '../database/prisma';
import { logger } from '../utils/logger';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import archiver from 'archiver';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    const supportedExtensions = codeAnalysis.getSupportedExtensions();
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (supportedExtensions.includes(ext) || file.mimetype === 'application/zip') {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type'));
    }
  }
});

// Validation middleware
const validateRequest = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

/**
 * POST /api/rag/knowledge-bases
 * Create a new knowledge base
 */
router.post('/knowledge-bases',
  authenticateUser,
  requireSubscription(['weekly', 'monthly', 'enterprise']),
  [
    body('name').notEmpty().isLength({ min: 1, max: 255 }).withMessage('Name is required'),
    body('description').optional().isLength({ max: 1000 }),
    body('type').optional().isIn(['project', 'library', 'framework', 'documentation']),
    body('language').optional().isString(),
    body('framework').optional().isString(),
    body('repositoryUrl').optional().isURL(),
    body('projectId').optional().isString()
  ],
  validateRequest,
  async (req, res) => {
    try {
      const {
        name,
        description,
        type = 'project',
        language,
        framework,
        repositoryUrl,
        projectId
      } = req.body;

      const knowledgeBase = await prisma.codebaseKnowledge.create({
        data: {
          name,
          description,
          type,
          language,
          framework,
          repositoryUrl,
          status: 'active',
          userId: req.user.id,
          projectId
        }
      });

      // Create vector index
      await vectorDatabase.createIndex(knowledgeBase.id);

      logger.info('Knowledge base created', {
        knowledgeBaseId: knowledgeBase.id,
        userId: req.user.id,
        name
      });

      res.status(201).json({
        success: true,
        knowledgeBase,
        message: 'Knowledge base created successfully'
      });

    } catch (error) {
      logger.error('Failed to create knowledge base:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create knowledge base'
      });
    }
  }
);

/**
 * GET /api/rag/knowledge-bases
 * List user's knowledge bases
 */
router.get('/knowledge-bases',
  authenticateUser,
  [
    query('type').optional().isIn(['project', 'library', 'framework', 'documentation']),
    query('language').optional().isString(),
    query('status').optional().isIn(['active', 'processing', 'indexed', 'error'])
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { type, language, status } = req.query;
      
      const where: any = { userId: req.user.id };
      if (type) where.type = type;
      if (language) where.language = language;
      if (status) where.status = status;

      const knowledgeBases = await prisma.codebaseKnowledge.findMany({
        where,
        include: {
          _count: {
            select: {
              codeChunks: true,
              vectorEmbeddings: true,
              semanticQueries: true
            }
          },
          project: {
            select: { name: true, type: true }
          }
        },
        orderBy: { updatedAt: 'desc' }
      });

      res.json({
        success: true,
        knowledgeBases: knowledgeBases.map(kb => ({
          ...kb,
          stats: {
            totalChunks: kb._count.codeChunks,
            totalEmbeddings: kb._count.vectorEmbeddings,
            totalQueries: kb._count.semanticQueries
          }
        }))
      });

    } catch (error) {
      logger.error('Failed to list knowledge bases:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list knowledge bases'
      });
    }
  }
);

/**
 * POST /api/rag/knowledge-bases/:id/upload
 * Upload and analyze code files
 */
router.post('/knowledge-bases/:id/upload',
  authenticateUser,
  requireSubscription(['weekly', 'monthly', 'enterprise']),
  upload.array('files', 100),
  [param('id').isString().withMessage('Knowledge base ID is required')],
  validateRequest,
  async (req, res) => {
    try {
      const { id: knowledgeBaseId } = req.params;
      const files = req.files as Express.Multer.File[];

      // Verify knowledge base ownership
      const knowledgeBase = await prisma.codebaseKnowledge.findFirst({
        where: { id: knowledgeBaseId, userId: req.user.id }
      });

      if (!knowledgeBase) {
        return res.status(404).json({
          success: false,
          error: 'Knowledge base not found'
        });
      }

      if (!files || files.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No files uploaded'
        });
      }

      // Process uploaded files
      const codeFiles = [];
      
      for (const file of files) {
        try {
          const content = await fs.readFile(file.path, 'utf-8');
          const extension = path.extname(file.originalname).toLowerCase();
          
          if (codeAnalysis.isFileSupported(file.originalname)) {
            codeFiles.push({
              path: file.originalname,
              content,
              language: codeAnalysis.getLanguageFromExtension(extension),
              extension
            });
          }

          // Clean up uploaded file
          await fs.unlink(file.path);

        } catch (error) {
          logger.warn('Failed to process uploaded file:', {
            filename: file.originalname,
            error: error.message
          });
        }
      }

      if (codeFiles.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No supported code files found'
        });
      }

      // Start analysis asynchronously
      codeAnalysis.analyzeCodebase(knowledgeBaseId, codeFiles, {
        generateSummaries: true,
        includeComments: true,
        includeImports: true,
        chunkSize: 500,
        overlap: 50
      }).catch(error => {
        logger.error('Codebase analysis failed:', error);
      });

      res.json({
        success: true,
        message: 'Files uploaded and analysis started',
        filesProcessed: codeFiles.length,
        knowledgeBaseId
      });

    } catch (error) {
      logger.error('Failed to upload files:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to upload files'
      });
    }
  }
);

/**
 * POST /api/rag/search
 * Perform semantic search
 */
router.post('/search',
  authenticateUser,
  [
    body('query').notEmpty().isLength({ min: 1, max: 1000 }).withMessage('Query is required'),
    body('knowledgeBaseId').notEmpty().withMessage('Knowledge base ID is required'),
    body('queryType').optional().isIn(['search', 'explain', 'generate', 'refactor']),
    body('filters.language').optional().isString(),
    body('filters.framework').optional().isString(),
    body('filters.contentType').optional().isArray(),
    body('filters.complexity').optional().isIn(['simple', 'medium', 'complex']),
    body('options.maxResults').optional().isInt({ min: 1, max: 50 }),
    body('options.threshold').optional().isFloat({ min: 0, max: 1 }),
    body('options.includeContext').optional().isBoolean(),
    body('options.rerank').optional().isBoolean()
  ],
  validateRequest,
  async (req, res) => {
    try {
      const searchQuery = {
        query: req.body.query,
        knowledgeBaseId: req.body.knowledgeBaseId,
        userId: req.user.id,
        queryType: req.body.queryType,
        filters: req.body.filters || {},
        options: req.body.options || {}
      };

      // Verify knowledge base access
      const knowledgeBase = await prisma.codebaseKnowledge.findFirst({
        where: {
          id: searchQuery.knowledgeBaseId,
          OR: [
            { userId: req.user.id },
            { visibility: 'public' }
          ]
        }
      });

      if (!knowledgeBase) {
        return res.status(404).json({
          success: false,
          error: 'Knowledge base not found or access denied'
        });
      }

      const results = await semanticSearch.search(searchQuery);

      res.json({
        success: true,
        ...results
      });

    } catch (error) {
      logger.error('Semantic search failed:', error);
      res.status(500).json({
        success: false,
        error: 'Search failed'
      });
    }
  }
);

/**
 * GET /api/rag/knowledge-bases/:id/analytics
 * Get knowledge base analytics
 */
router.get('/knowledge-bases/:id/analytics',
  authenticateUser,
  [
    param('id').isString().withMessage('Knowledge base ID is required'),
    query('timeRange').optional().isInt({ min: 1, max: 30 })
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { id: knowledgeBaseId } = req.params;
      const timeRange = parseInt(req.query.timeRange as string) || 7;

      // Verify ownership
      const knowledgeBase = await prisma.codebaseKnowledge.findFirst({
        where: { id: knowledgeBaseId, userId: req.user.id }
      });

      if (!knowledgeBase) {
        return res.status(404).json({
          success: false,
          error: 'Knowledge base not found'
        });
      }

      const analytics = await semanticSearch.getAnalytics(knowledgeBaseId, timeRange);

      res.json({
        success: true,
        analytics
      });

    } catch (error) {
      logger.error('Failed to get analytics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get analytics'
      });
    }
  }
);

/**
 * GET /api/rag/knowledge-bases/:id/status
 * Get knowledge base processing status
 */
router.get('/knowledge-bases/:id/status',
  authenticateUser,
  [param('id').isString().withMessage('Knowledge base ID is required')],
  validateRequest,
  async (req, res) => {
    try {
      const { id: knowledgeBaseId } = req.params;

      const knowledgeBase = await prisma.codebaseKnowledge.findFirst({
        where: {
          id: knowledgeBaseId,
          OR: [
            { userId: req.user.id },
            { visibility: 'public' }
          ]
        },
        include: {
          _count: {
            select: {
              codeChunks: true,
              vectorEmbeddings: true
            }
          }
        }
      });

      if (!knowledgeBase) {
        return res.status(404).json({
          success: false,
          error: 'Knowledge base not found'
        });
      }

      const status = {
        id: knowledgeBase.id,
        name: knowledgeBase.name,
        status: knowledgeBase.status,
        totalFiles: knowledgeBase.totalFiles,
        indexedFiles: knowledgeBase.indexedFiles,
        totalChunks: knowledgeBase._count.codeChunks,
        totalEmbeddings: knowledgeBase._count.vectorEmbeddings,
        lastIndexedAt: knowledgeBase.lastIndexedAt,
        processingMeta: knowledgeBase.processingMeta,
        progress: knowledgeBase.totalFiles > 0 
          ? (knowledgeBase.indexedFiles / knowledgeBase.totalFiles) * 100 
          : 0
      };

      res.json({
        success: true,
        status
      });

    } catch (error) {
      logger.error('Failed to get status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get status'
      });
    }
  }
);

/**
 * DELETE /api/rag/knowledge-bases/:id
 * Delete knowledge base
 */
router.delete('/knowledge-bases/:id',
  authenticateUser,
  [param('id').isString().withMessage('Knowledge base ID is required')],
  validateRequest,
  async (req, res) => {
    try {
      const { id: knowledgeBaseId } = req.params;

      // Verify ownership
      const knowledgeBase = await prisma.codebaseKnowledge.findFirst({
        where: { id: knowledgeBaseId, userId: req.user.id }
      });

      if (!knowledgeBase) {
        return res.status(404).json({
          success: false,
          error: 'Knowledge base not found'
        });
      }

      // Delete from vector database
      try {
        const chunkIds = await prisma.codeChunk.findMany({
          where: { knowledgeBaseId },
          select: { id: true }
        });

        if (chunkIds.length > 0) {
          await vectorDatabase.delete(
            `kb-${knowledgeBaseId}`,
            chunkIds.map(chunk => chunk.id)
          );
        }
      } catch (error) {
        logger.warn('Failed to delete vectors:', error.message);
      }

      // Delete from database (cascades to related records)
      await prisma.codebaseKnowledge.delete({
        where: { id: knowledgeBaseId }
      });

      res.json({
        success: true,
        message: 'Knowledge base deleted successfully'
      });

    } catch (error) {
      logger.error('Failed to delete knowledge base:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete knowledge base'
      });
    }
  }
);

/**
 * GET /api/rag/health
 * Get RAG system health status
 */
router.get('/health',
  async (req, res) => {
    try {
      const vectorDbHealth = await vectorDatabase.healthCheck();
      const vectorDbStats = await vectorDatabase.getStats();

      const dbStats = await prisma.codebaseKnowledge.aggregate({
        _count: { id: true }
      });

      res.json({
        success: true,
        health: {
          vectorDatabase: vectorDbHealth,
          stats: {
            ...vectorDbStats,
            totalKnowledgeBases: dbStats._count.id
          }
        }
      });

    } catch (error) {
      logger.error('RAG health check failed:', error);
      res.status(500).json({
        success: false,
        error: 'Health check failed'
      });
    }
  }
);

export default router;