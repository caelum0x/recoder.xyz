/**
 * Project Template Routes
 *
 * Read-only listing, lookup, and search of project starter templates.
 *
 * Extracted verbatim from server.ts (behavior-preserving move). The route handler
 * bodies, paths, and error helpers are unchanged. `templateManager` is imported
 * directly from its existing module.
 */

import express, { Router } from 'express';
import { templateManager } from '../templates/index.js';
import {
  ErrorCode,
  createError,
  sendError,
  sendSuccess,
} from '../errors/index.js';

export function createTemplatesRouter(): Router {
  const router = Router();

  router.get('/api/templates', (_req: express.Request, res: express.Response) => {
    const templates = templateManager.getAllTemplates();
    sendSuccess(res, { templates });
  });

  router.get('/api/templates/:templateId', (req: express.Request, res: express.Response) => {
    const template = templateManager.getTemplate(req.params.templateId);
    if (!template) return sendError(res, createError(ErrorCode.NOT_FOUND, 'Template not found'));
    sendSuccess(res, { template });
  });

  router.get('/api/templates/search/:query', (req: express.Request, res: express.Response) => {
    const results = templateManager.searchTemplates(req.params.query);
    sendSuccess(res, { templates: results });
  });

  return router;
}
