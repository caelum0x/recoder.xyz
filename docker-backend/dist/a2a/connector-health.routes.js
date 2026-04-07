"use strict";
/**
 * @module connector-health.routes
 *
 * Express route handlers for connector health monitoring, circuit breaker
 * inspection, and manual restart triggers.
 *
 * Provides the following endpoints:
 *
 * | Method | Path                                         | Description                          |
 * |--------|----------------------------------------------|--------------------------------------|
 * | GET    | /connectors/health                           | All connector health status          |
 * | GET    | /connectors/:connectorId/health               | Single connector health + circuit    |
 * | POST   | /connectors/:connectorId/restart               | Manual restart trigger               |
 * | POST   | /connectors/:connectorId/circuit/reset         | Reset circuit breaker                |
 *
 * These routes are mounted under `/api/a2a` alongside the existing
 * heartbeat, agent registry, and task lifecycle routes.
 *
 * P13-008: Connector Health Monitor with Auto-Restart and Circuit Breaker
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectorHealthRouter = void 0;
const express_1 = require("express");
const connector_health_monitor_service_1 = require("./connector-health-monitor.service");
const logger_1 = require("../logger");
const logger = (0, logger_1.createLogger)('a2a-connector-health-routes');
// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
exports.connectorHealthRouter = (0, express_1.Router)();
// Parse JSON bodies (in case the parent mount uses express.text for A2A)
exports.connectorHealthRouter.use((req, _res, next) => {
    if (typeof req.body === 'string') {
        try {
            req.body = JSON.parse(req.body);
        }
        catch {
            // leave as-is; validation below will catch invalid bodies
        }
    }
    next();
});
// ---------------------------------------------------------------------------
// GET /connectors/health -- All connector health status
// ---------------------------------------------------------------------------
exports.connectorHealthRouter.get('/connectors/health', (_req, res) => {
    try {
        const monitor = (0, connector_health_monitor_service_1.getConnectorHealthMonitor)();
        const health = monitor.getAllConnectorsHealth();
        res.status(200).json({
            success: true,
            data: health,
        });
    }
    catch (err) {
        logger.error({ err }, 'unhandled error in GET /connectors/health');
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
        });
    }
});
// ---------------------------------------------------------------------------
// GET /connectors/:connectorId/health -- Single connector health + circuit
// ---------------------------------------------------------------------------
exports.connectorHealthRouter.get('/connectors/:connectorId/health', (req, res) => {
    try {
        const { connectorId } = req.params;
        if (!connectorId || connectorId === 'undefined') {
            res.status(400).json({
                success: false,
                error: { code: 'INVALID_CONNECTOR_ID', message: 'connectorId parameter is required' },
            });
            return;
        }
        const monitor = (0, connector_health_monitor_service_1.getConnectorHealthMonitor)();
        if (!monitor.isRegistered(connectorId)) {
            res.status(404).json({
                success: false,
                error: {
                    code: 'CONNECTOR_NOT_FOUND',
                    message: `Connector not registered: ${connectorId}`,
                },
            });
            return;
        }
        const health = monitor.getConnectorHealth(connectorId);
        res.status(200).json({
            success: true,
            data: health,
        });
    }
    catch (err) {
        logger.error({ err, connectorId: req.params.connectorId }, 'unhandled error in GET connector health');
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
        });
    }
});
// ---------------------------------------------------------------------------
// POST /connectors/:connectorId/restart -- Manual restart trigger
// ---------------------------------------------------------------------------
exports.connectorHealthRouter.post('/connectors/:connectorId/restart', async (req, res) => {
    try {
        const { connectorId } = req.params;
        if (!connectorId || connectorId === 'undefined') {
            res.status(400).json({
                success: false,
                error: { code: 'INVALID_CONNECTOR_ID', message: 'connectorId parameter is required' },
            });
            return;
        }
        const monitor = (0, connector_health_monitor_service_1.getConnectorHealthMonitor)();
        if (!monitor.isRegistered(connectorId)) {
            res.status(404).json({
                success: false,
                error: {
                    code: 'CONNECTOR_NOT_FOUND',
                    message: `Connector not registered: ${connectorId}`,
                },
            });
            return;
        }
        logger.info({ connectorId }, 'manual restart triggered via API');
        await monitor.restartConnector(connectorId);
        const health = monitor.getConnectorHealth(connectorId);
        res.status(200).json({
            success: true,
            data: {
                message: `Connector ${connectorId} restart initiated`,
                health,
            },
        });
    }
    catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error({ err, connectorId: req.params.connectorId }, 'error restarting connector');
        res.status(500).json({
            success: false,
            error: { code: 'RESTART_FAILED', message: errorMessage },
        });
    }
});
// ---------------------------------------------------------------------------
// POST /connectors/:connectorId/circuit/reset -- Reset circuit breaker
// ---------------------------------------------------------------------------
exports.connectorHealthRouter.post('/connectors/:connectorId/circuit/reset', (req, res) => {
    try {
        const { connectorId } = req.params;
        if (!connectorId || connectorId === 'undefined') {
            res.status(400).json({
                success: false,
                error: { code: 'INVALID_CONNECTOR_ID', message: 'connectorId parameter is required' },
            });
            return;
        }
        const monitor = (0, connector_health_monitor_service_1.getConnectorHealthMonitor)();
        if (!monitor.isRegistered(connectorId)) {
            res.status(404).json({
                success: false,
                error: {
                    code: 'CONNECTOR_NOT_FOUND',
                    message: `Connector not registered: ${connectorId}`,
                },
            });
            return;
        }
        logger.info({ connectorId }, 'circuit breaker reset triggered via API');
        monitor.resetCircuit(connectorId);
        const circuit = monitor.getCircuitStatus(connectorId);
        res.status(200).json({
            success: true,
            data: {
                message: `Circuit breaker for ${connectorId} reset to closed`,
                circuit,
            },
        });
    }
    catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error({ err, connectorId: req.params.connectorId }, 'error resetting circuit breaker');
        res.status(500).json({
            success: false,
            error: { code: 'CIRCUIT_RESET_FAILED', message: errorMessage },
        });
    }
});
