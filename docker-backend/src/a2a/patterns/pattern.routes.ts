/**
 * @module patterns/pattern.routes
 *
 * Express routes for executing collaboration patterns.
 *
 * | Method | Path      | Description                     |
 * |--------|-----------|---------------------------------|
 * | GET    | /         | List available patterns         |
 * | GET    | /:type    | Get pattern details             |
 * | POST   | /execute  | Execute a collaboration pattern |
 */

import { Router, type Request, type Response } from 'express';
import { getPatternRegistry } from './pattern-registry';
import type { PatternConfig, PatternInput } from './types';
import { createLogger } from '../../logger';

const logger = createLogger('a2a-pattern-routes');

export const patternRouter = Router();

// Parse JSON text body
patternRouter.use((req: Request, _res: Response, next) => {
  if (typeof req.body === 'string') {
    try {
      req.body = JSON.parse(req.body);
    } catch {
      // leave as-is
    }
  }
  next();
});

// GET / -- List available patterns
patternRouter.get('/', (_req: Request, res: Response) => {
  try {
    const registry = getPatternRegistry();
    res.status(200).json({
      success: true,
      data: {
        patterns: registry.getDetails(),
        count: registry.list().length,
      },
    });
  } catch (err) {
    logger.error({ err }, 'Error listing patterns');
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
});

// GET /:type -- Get pattern details
patternRouter.get('/:type', (req: Request, res: Response) => {
  try {
    const { type } = req.params;
    const registry = getPatternRegistry();
    const pattern = registry.get(type);

    if (!pattern) {
      res.status(404).json({
        success: false,
        error: { message: `Pattern not found: ${type}`, available: registry.list() },
      });
      return;
    }

    const details = registry.getDetails().find((d) => d.type === type);
    res.status(200).json({
      success: true,
      data: {
        type: pattern.patternType,
        description: details?.description || '',
      },
    });
  } catch (err) {
    logger.error({ err }, 'Error getting pattern details');
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
});

// POST /execute -- Execute a collaboration pattern
patternRouter.post('/execute', async (req: Request, res: Response) => {
  try {
    const { patternType, config, input } = req.body || {};

    if (!patternType || typeof patternType !== 'string') {
      res.status(400).json({
        success: false,
        error: { message: 'Missing required field: patternType' },
      });
      return;
    }

    const registry = getPatternRegistry();
    const pattern = registry.get(patternType);

    if (!pattern) {
      res.status(404).json({
        success: false,
        error: { message: `Pattern not found: ${patternType}`, available: registry.list() },
      });
      return;
    }

    if (!config || !input) {
      res.status(400).json({
        success: false,
        error: { message: 'Missing required fields: config, input' },
      });
      return;
    }

    const patternConfig: PatternConfig = {
      patternType: patternType as PatternConfig['patternType'],
      workspaceId: config.workspaceId || 'default',
      threadId: config.threadId || `thr-${Date.now()}`,
      requester: config.requester || { agent_id: 'api-caller', platform: 'recoder_app', name: 'API Caller' },
    };

    const result = await pattern.execute(patternConfig, input as PatternInput);

    res.status(result.success ? 200 : 500).json({
      success: result.success,
      data: result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'Error executing pattern');
    res.status(500).json({
      success: false,
      error: { message: `Pattern execution failed: ${message}` },
    });
  }
});
