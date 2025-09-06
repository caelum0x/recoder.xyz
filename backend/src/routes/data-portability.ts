/**
 * Data Portability API Routes
 * PRODUCTION FEATURE: Enterprise data export/import for GDPR compliance
 * Enterprise data migration capabilities that Cursor/Copilot don't provide
 */

import express from 'express';
import { body, query, validationResult } from 'express-validator';
import { Logger } from '../utils/logger';
import { dataPortabilityService, ExportRequest, ImportRequest } from '../services/data-portability';
import { authenticateUser, requireSubscription } from '../middleware/auth';
import { apiLimiter } from '../middleware/rate-limit';

const router = express.Router();

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
 * POST /api/data-portability/export - Request data export
 */
router.post('/export',
  authenticateUser,
  requireSubscription(['monthly', 'enterprise']),
  apiLimiter,
  [
    body('exportType').isIn(['full', 'partial']).withMessage('Export type must be full or partial'),
    body('format').isIn(['json', 'csv', 'xml']).withMessage('Format must be json, csv, or xml'),
    body('includeData').isObject().withMessage('Include data must be an object'),
    body('compression').optional().isBoolean(),
    body('encryption').optional().isBoolean(),
    body('encryptionKey').optional().isString().isLength({ min: 8 }),
    body('dateRange').optional().isObject(),
    body('dateRange.start').optional().isISO8601(),
    body('dateRange.end').optional().isISO8601()
  ],
  validateRequest,
  async (req, res) => {
    try {
      const request: ExportRequest = {
        userId: req.user.id,
        exportType: req.body.exportType,
        format: req.body.format,
        includeData: req.body.includeData,
        compression: req.body.compression || false,
        encryption: req.body.encryption || false,
        encryptionKey: req.body.encryptionKey,
        dateRange: req.body.dateRange ? {
          start: new Date(req.body.dateRange.start),
          end: new Date(req.body.dateRange.end)
        } : undefined
      };

      const result = await dataPortabilityService.exportUserData(request);

      res.json({
        success: true,
        message: 'Data export initiated successfully',
        export: {
          exportId: result.exportId,
          status: result.status,
          downloadUrl: result.downloadUrl,
          fileSize: result.fileSize,
          recordCount: result.recordCount,
          metadata: result.metadata
        },
        enterpriseAdvantage: {
          message: "Enterprise data portability with GDPR compliance",
          features: [
            "Full data export in multiple formats (JSON, CSV, XML)",
            "GDPR-compliant data export and deletion",
            "Enterprise encryption and compression",
            "S3 integration for large file handling",
            "Comprehensive audit trails",
            "Conflict resolution during imports"
          ],
          competitors: "Cursor and Copilot provide NO data export or GDPR compliance capabilities"
        }
      });

    } catch (error: any) {
      Logger.error('Data export failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to export data',
        details: error.message
      });
    }
  }
);

/**
 * POST /api/data-portability/import - Import user data
 */
router.post('/import',
  authenticateUser,
  requireSubscription(['enterprise']), // Import only for enterprise
  apiLimiter,
  [
    body('filePath').isString().notEmpty().withMessage('File path is required'),
    body('format').isIn(['json', 'csv', 'xml']).withMessage('Format must be json, csv, or xml'),
    body('importMode').isIn(['merge', 'replace', 'append']).withMessage('Import mode must be merge, replace, or append'),
    body('conflictResolution').isIn(['skip', 'overwrite', 'prompt']).withMessage('Conflict resolution must be skip, overwrite, or prompt'),
    body('validateSchema').optional().isBoolean(),
    body('dryRun').optional().isBoolean()
  ],
  validateRequest,
  async (req, res) => {
    try {
      const request: ImportRequest = {
        userId: req.user.id,
        filePath: req.body.filePath,
        format: req.body.format,
        importMode: req.body.importMode,
        conflictResolution: req.body.conflictResolution,
        validateSchema: req.body.validateSchema !== false, // Default true
        dryRun: req.body.dryRun || false
      };

      const result = await dataPortabilityService.importUserData(request);

      res.json({
        success: true,
        message: 'Data import completed successfully',
        import: {
          importId: result.importId,
          status: result.status,
          recordsProcessed: result.recordsProcessed,
          recordsCreated: result.recordsCreated,
          recordsUpdated: result.recordsUpdated,
          recordsSkipped: result.recordsSkipped,
          errors: result.errors,
          warnings: result.warnings,
          metadata: result.metadata
        }
      });

    } catch (error: any) {
      Logger.error('Data import failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to import data',
        details: error.message
      });
    }
  }
);

/**
 * GET /api/data-portability/export/:exportId/status - Get export status
 */
router.get('/export/:exportId/status',
  authenticateUser,
  requireSubscription(['monthly', 'enterprise']),
  async (req, res) => {
    try {
      const { exportId } = req.params;
      const result = dataPortabilityService.getExportStatus(exportId);

      if (!result) {
        return res.status(404).json({
          success: false,
          error: 'Export not found'
        });
      }

      res.json({
        success: true,
        export: result
      });

    } catch (error: any) {
      Logger.error('Failed to get export status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get export status'
      });
    }
  }
);

/**
 * GET /api/data-portability/import/:importId/status - Get import status
 */
router.get('/import/:importId/status',
  authenticateUser,
  requireSubscription(['enterprise']),
  async (req, res) => {
    try {
      const { importId } = req.params;
      const result = dataPortabilityService.getImportStatus(importId);

      if (!result) {
        return res.status(404).json({
          success: false,
          error: 'Import not found'
        });
      }

      res.json({
        success: true,
        import: result
      });

    } catch (error: any) {
      Logger.error('Failed to get import status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get import status'
      });
    }
  }
);

/**
 * POST /api/data-portability/gdpr-export - Generate GDPR-compliant export
 */
router.post('/gdpr-export',
  authenticateUser,
  apiLimiter,
  async (req, res) => {
    try {
      const result = await dataPortabilityService.generateGDPRExport(req.user.id);

      res.json({
        success: true,
        message: 'GDPR export generated successfully',
        export: {
          exportId: result.exportId,
          status: result.status,
          downloadUrl: result.downloadUrl,
          fileSize: result.fileSize,
          recordCount: result.recordCount,
          metadata: result.metadata
        },
        gdprCompliance: {
          purpose: "GDPR Article 20 - Right to data portability",
          dataIncluded: "All personal data you have provided to Recoder",
          format: "Machine-readable JSON format",
          encryption: "Not encrypted for data readability",
          retention: "Export link expires in 7 days"
        }
      });

    } catch (error: any) {
      Logger.error('GDPR export failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate GDPR export',
        details: error.message
      });
    }
  }
);

/**
 * DELETE /api/data-portability/gdpr-delete - Delete user data (GDPR right to be forgotten)
 */
router.delete('/gdpr-delete',
  authenticateUser,
  [
    body('confirmDeletion').equals('DELETE_MY_DATA').withMessage('Must confirm deletion with "DELETE_MY_DATA"'),
    body('retainAnalytics').optional().isBoolean()
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { retainAnalytics = false } = req.body;
      
      // This is a destructive operation - require explicit confirmation
      if (req.body.confirmDeletion !== 'DELETE_MY_DATA') {
        return res.status(400).json({
          success: false,
          error: 'Deletion not confirmed. Must provide confirmDeletion: "DELETE_MY_DATA"'
        });
      }

      const result = await dataPortabilityService.deleteUserData(req.user.id, retainAnalytics);

      res.json({
        success: true,
        message: 'User data deleted successfully',
        deletion: {
          deleted: result.deleted,
          recordsDeleted: result.recordsDeleted,
          tablesAffected: result.tablesAffected,
          completedAt: new Date().toISOString()
        },
        gdprCompliance: {
          purpose: "GDPR Article 17 - Right to be forgotten",
          scope: "All personal data associated with your account",
          analyticsRetained: retainAnalytics ? "Anonymized analytics data retained" : "All data deleted",
          irreversible: "This action cannot be undone"
        }
      });

    } catch (error: any) {
      Logger.error('GDPR deletion failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete user data',
        details: error.message
      });
    }
  }
);

/**
 * GET /api/data-portability/formats - Get supported export/import formats
 */
router.get('/formats',
  authenticateUser,
  async (req, res) => {
    try {
      res.json({
        success: true,
        supportedFormats: {
          export: [
            {
              format: 'json',
              description: 'JSON format with complete data structure',
              recommended: true,
              features: ['Complete data', 'Nested relationships', 'Machine readable']
            },
            {
              format: 'csv',
              description: 'CSV format for tabular data analysis',
              recommended: false,
              features: ['Spreadsheet compatible', 'Limited nesting', 'Human readable']
            },
            {
              format: 'xml',
              description: 'XML format for enterprise systems',
              recommended: false,
              features: ['Enterprise compatible', 'Schema validation', 'Nested data']
            }
          ],
          import: [
            {
              format: 'json',
              description: 'Import from JSON exports',
              supported: true,
              features: ['Full data restoration', 'Conflict resolution', 'Schema validation']
            },
            {
              format: 'csv',
              description: 'Import from CSV files',
              supported: false,
              features: ['Coming soon']
            },
            {
              format: 'xml',
              description: 'Import from XML files',
              supported: false,
              features: ['Coming soon']
            }
          ]
        },
        dataTypes: {
          users: 'User profile and account information',
          projects: 'All projects and associated files',
          usageAnalytics: 'Usage statistics and analytics data',
          codeGeneration: 'Code generation history and templates',
          subscriptions: 'Billing and subscription data',
          integrations: 'Third-party integrations and configurations',
          templates: 'Custom templates and snippets',
          collaborations: 'Team and collaboration data',
          backups: 'Backup metadata (enterprise only)'
        }
      });

    } catch (error: any) {
      Logger.error('Failed to get formats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get supported formats'
      });
    }
  }
);

/**
 * POST /api/data-portability/cleanup - Clean up old export files
 */
router.post('/cleanup',
  authenticateUser,
  requireSubscription(['enterprise']),
  async (req, res) => {
    try {
      await dataPortabilityService.cleanup();

      res.json({
        success: true,
        message: 'Cleanup completed successfully'
      });

    } catch (error: any) {
      Logger.error('Cleanup failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to cleanup old files'
      });
    }
  }
);

/**
 * GET /api/data-portability/health - Health check
 */
router.get('/health', async (req, res) => {
  try {
    // Basic health check - ensure service is responding
    res.json({
      success: true,
      status: 'healthy',
      service: 'data-portability',
      features: [
        'Enterprise data export (JSON, CSV, XML)',
        'GDPR-compliant data portability',
        'Enterprise data import with conflict resolution',
        'Secure file encryption and compression',
        'S3 integration for large files',
        'Comprehensive audit trails',
        'Right to be forgotten implementation'
      ],
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      error: error.message
    });
  }
});

export { router as dataPortabilityRouter };