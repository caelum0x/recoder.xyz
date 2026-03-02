/**
 * @module heartbeat.routes
 *
 * Express route handlers for the A2A agent heartbeat and health
 * aggregation system.
 *
 * Provides the following endpoints:
 *
 * | Method | Path                                | Description                              |
 * |--------|-------------------------------------|------------------------------------------|
 * | POST   | /agents/:agentId/heartbeat          | Record an agent heartbeat                |
 * | GET    | /health                             | Aggregated health of all agents          |
 * | GET    | /agents/:agentId/health             | Health record for a single agent         |
 *
 * These routes are mounted under `/api/a2a` alongside the existing
 * gateway and task lifecycle routes.
 */

import { Router, type Request, type Response } from 'express';
import {
  getHeartbeatTracker,
  type AgentHeartbeatStatus,
  type HeartbeatMetadata,
} from './heartbeat-tracker.service';
import { createLogger } from '../logger';

const logger = createLogger('a2a-heartbeat-routes');

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const VALID_HEARTBEAT_STATUSES = new Set<string>(['healthy', 'degraded', 'unhealthy']);

function isValidHeartbeatStatus(value: unknown): value is AgentHeartbeatStatus {
  return typeof value === 'string' && VALID_HEARTBEAT_STATUSES.has(value);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const heartbeatRouter = Router();

// Parse JSON bodies (in case the parent mount uses express.text for A2A)
heartbeatRouter.use((req: Request, _res: Response, next) => {
  if (typeof req.body === 'string') {
    try {
      req.body = JSON.parse(req.body);
    } catch {
      // leave as-is; validation below will catch invalid bodies
    }
  }
  next();
});

// ---------------------------------------------------------------------------
// POST /agents/:agentId/heartbeat -- Record agent heartbeat
// ---------------------------------------------------------------------------

heartbeatRouter.post(
  '/agents/:agentId/heartbeat',
  (req: Request, res: Response) => {
    try {
      const { agentId } = req.params;

      if (!agentId || agentId === 'undefined') {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_AGENT_ID', message: 'agentId parameter is required' },
        });
        return;
      }

      // Validate body
      const body = req.body ?? {};
      const status: AgentHeartbeatStatus = isValidHeartbeatStatus(body.status)
        ? body.status
        : 'healthy'; // default to healthy if not provided

      const metadata: HeartbeatMetadata = {};
      if (body.metadata && typeof body.metadata === 'object') {
        if (typeof body.metadata.cpu === 'number') metadata.cpu = body.metadata.cpu;
        if (typeof body.metadata.memory === 'number') metadata.memory = body.metadata.memory;
        if (typeof body.metadata.activeTaskCount === 'number') {
          metadata.activeTaskCount = body.metadata.activeTaskCount;
        }
        if (typeof body.metadata.version === 'string') metadata.version = body.metadata.version;
        // Pass through any additional keys
        for (const [key, value] of Object.entries(body.metadata)) {
          if (!(key in metadata)) {
            metadata[key] = value;
          }
        }
      }

      const tracker = getHeartbeatTracker();
      const result = tracker.recordHeartbeat(agentId, status, metadata);

      logger.debug({ agentId, status }, 'heartbeat recorded');

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      logger.error({ err, agentId: req.params.agentId }, 'unhandled error in POST heartbeat');
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
      });
    }
  },
);

// ---------------------------------------------------------------------------
// GET /health -- Aggregated health of all registered agents
// ---------------------------------------------------------------------------

heartbeatRouter.get(
  '/health',
  (_req: Request, res: Response) => {
    try {
      const tracker = getHeartbeatTracker();
      const aggregation = tracker.getHealthAggregation();

      res.status(200).json({
        success: true,
        data: aggregation,
      });
    } catch (err) {
      logger.error({ err }, 'unhandled error in GET /health');
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
      });
    }
  },
);

// ---------------------------------------------------------------------------
// GET /agents/:agentId/health -- Single agent health record
// ---------------------------------------------------------------------------

heartbeatRouter.get(
  '/agents/:agentId/health',
  (req: Request, res: Response) => {
    try {
      const { agentId } = req.params;

      if (!agentId || agentId === 'undefined') {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_AGENT_ID', message: 'agentId parameter is required' },
        });
        return;
      }

      const tracker = getHeartbeatTracker();
      const record = tracker.getRecord(agentId);

      if (!record) {
        res.status(404).json({
          success: false,
          error: {
            code: 'AGENT_NOT_FOUND',
            message: `No heartbeat record found for agent: ${agentId}`,
          },
        });
        return;
      }

      const isOnline = tracker.isAgentOnline(agentId);

      res.status(200).json({
        success: true,
        data: {
          agentId: record.agentId,
          status: record.status,
          lastHeartbeat: new Date(record.lastHeartbeatAt).toISOString(),
          isOnline,
          metadata: record.metadata,
          probe: record.probe,
        },
      });
    } catch (err) {
      logger.error({ err, agentId: req.params.agentId }, 'unhandled error in GET agent health');
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
      });
    }
  },
);
