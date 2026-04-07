"use strict";
/**
 * App Key Management Routes
 *
 * Endpoints for third-party developers to manage their app keys:
 * - POST   /v1/app-keys     - Create an app key
 * - GET    /v1/app-keys     - List app keys
 * - GET    /v1/app-keys/:id - Get app key details
 * - DELETE /v1/app-keys/:id - Revoke an app key
 * - PATCH  /v1/app-keys/:id - Update app key
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.appKeysRouter = void 0;
const express_1 = require("express");
const middleware_js_1 = require("../middleware.js");
const app_keys_js_1 = require("../app-keys.js");
const validation_js_1 = require("../validation.js");
// ==================== Audit Logging ====================
function logAppKeyEvent(event) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        category: 'app_keys',
        ...event,
    };
    if (event.success) {
        console.log('[App Keys]', JSON.stringify(logEntry));
    }
    else {
        console.warn('[App Keys]', JSON.stringify(logEntry));
    }
}
// ==================== Router ====================
const router = (0, express_1.Router)();
exports.appKeysRouter = router;
/**
 * POST / - Create a new app key
 *
 * Requires: API key authentication
 * Body: { name, description?, allowedCallbackUrls? }
 * Returns: { appKey, keyInfo }
 */
router.post('/', (0, middleware_js_1.asyncApiHandler)(async (req, res) => {
    const requestId = req.requestId || 'unknown';
    const userId = req.userId;
    if (!userId) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'INVALID_API_KEY',
            message: 'Authentication required',
            statusCode: 401,
        }, requestId);
        return;
    }
    const body = req.body;
    // Validate inputs
    const validation = (0, validation_js_1.combineValidations)((0, validation_js_1.validateAppKeyName)(body.name), (0, validation_js_1.validateAppKeyDescription)(body.description), (0, validation_js_1.validateCallbackUrls)(body.allowedCallbackUrls));
    if (!validation.valid) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'VALIDATION_ERROR',
            message: validation.error || 'Invalid request',
            statusCode: 400,
        }, requestId);
        return;
    }
    try {
        const response = (0, app_keys_js_1.createAppKey)(userId, {
            name: body.name.trim(),
            description: body.description?.trim(),
            allowedCallbackUrls: body.allowedCallbackUrls,
        });
        logAppKeyEvent({
            type: 'app_key_created',
            userId,
            requestId,
            success: true,
            appKeyId: response.keyInfo.id,
            details: { keyPrefix: response.keyInfo.keyPrefix },
        });
        (0, middleware_js_1.sendApiSuccess)(res, response, requestId, 201);
    }
    catch (error) {
        logAppKeyEvent({
            type: 'app_key_creation_failed',
            userId,
            requestId,
            success: false,
            details: { error: error instanceof Error ? error.message : 'Unknown error' },
        });
        (0, middleware_js_1.sendApiError)(res, {
            code: 'APP_KEY_CREATION_FAILED',
            message: 'Failed to create app key',
            statusCode: 500,
        }, requestId);
    }
}));
/**
 * GET / - List all app keys for the authenticated user
 *
 * Requires: API key authentication
 * Returns: { appKeys: [...] }
 */
router.get('/', (0, middleware_js_1.asyncApiHandler)(async (req, res) => {
    const requestId = req.requestId || 'unknown';
    const userId = req.userId;
    if (!userId) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'INVALID_API_KEY',
            message: 'Authentication required',
            statusCode: 401,
        }, requestId);
        return;
    }
    const appKeys = (0, app_keys_js_1.listUserAppKeys)(userId);
    (0, middleware_js_1.sendApiSuccess)(res, { appKeys }, requestId);
}));
/**
 * GET /:id - Get app key details
 *
 * Requires: API key authentication
 * Returns: { appKey: {...} }
 */
router.get('/:id', (0, middleware_js_1.asyncApiHandler)(async (req, res) => {
    const requestId = req.requestId || 'unknown';
    const userId = req.userId;
    const keyId = req.params.id;
    if (!userId) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'INVALID_API_KEY',
            message: 'Authentication required',
            statusCode: 401,
        }, requestId);
        return;
    }
    // Validate key ID format
    const validation = (0, validation_js_1.validateUUID)(keyId, 'keyId');
    if (!validation.valid) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'VALIDATION_ERROR',
            message: validation.error || 'Invalid key ID',
            statusCode: 400,
        }, requestId);
        return;
    }
    const appKey = (0, app_keys_js_1.getAppKeyInfo)(keyId);
    if (!appKey) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'APP_KEY_NOT_FOUND',
            message: 'App key not found',
            statusCode: 404,
        }, requestId);
        return;
    }
    // Verify ownership
    if (appKey.ownerId !== userId) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'APP_KEY_FORBIDDEN',
            message: 'You do not own this app key',
            statusCode: 403,
        }, requestId);
        return;
    }
    (0, middleware_js_1.sendApiSuccess)(res, { appKey }, requestId);
}));
/**
 * DELETE /:id - Revoke an app key
 *
 * Requires: API key authentication
 * Returns: { revoked: true }
 */
router.delete('/:id', (0, middleware_js_1.asyncApiHandler)(async (req, res) => {
    const requestId = req.requestId || 'unknown';
    const userId = req.userId;
    const keyId = req.params.id;
    if (!userId) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'INVALID_API_KEY',
            message: 'Authentication required',
            statusCode: 401,
        }, requestId);
        return;
    }
    // Validate key ID format
    const validation = (0, validation_js_1.validateUUID)(keyId, 'keyId');
    if (!validation.valid) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'VALIDATION_ERROR',
            message: validation.error || 'Invalid key ID',
            statusCode: 400,
        }, requestId);
        return;
    }
    const revoked = (0, app_keys_js_1.revokeAppKey)(keyId, userId);
    if (!revoked) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'APP_KEY_NOT_FOUND',
            message: 'App key not found or not owned by you',
            statusCode: 404,
        }, requestId);
        return;
    }
    logAppKeyEvent({
        type: 'app_key_revoked',
        userId,
        requestId,
        success: true,
        appKeyId: keyId,
    });
    (0, middleware_js_1.sendApiSuccess)(res, { revoked: true }, requestId);
}));
/**
 * PATCH /:id - Update app key details
 *
 * Requires: API key authentication
 * Body: { name?, description? }
 * Returns: { updated: true }
 */
router.patch('/:id', (0, middleware_js_1.asyncApiHandler)(async (req, res) => {
    const requestId = req.requestId || 'unknown';
    const userId = req.userId;
    const keyId = req.params.id;
    if (!userId) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'INVALID_API_KEY',
            message: 'Authentication required',
            statusCode: 401,
        }, requestId);
        return;
    }
    // Validate key ID format
    const idValidation = (0, validation_js_1.validateUUID)(keyId, 'keyId');
    if (!idValidation.valid) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'VALIDATION_ERROR',
            message: idValidation.error || 'Invalid key ID',
            statusCode: 400,
        }, requestId);
        return;
    }
    const { name, description } = req.body;
    // Validate inputs if provided
    if (name !== undefined) {
        const nameValidation = (0, validation_js_1.validateAppKeyName)(name);
        if (!nameValidation.valid) {
            (0, middleware_js_1.sendApiError)(res, {
                code: 'VALIDATION_ERROR',
                message: nameValidation.error || 'Invalid name',
                statusCode: 400,
            }, requestId);
            return;
        }
    }
    if (description !== undefined) {
        const descValidation = (0, validation_js_1.validateAppKeyDescription)(description);
        if (!descValidation.valid) {
            (0, middleware_js_1.sendApiError)(res, {
                code: 'VALIDATION_ERROR',
                message: descValidation.error || 'Invalid description',
                statusCode: 400,
            }, requestId);
            return;
        }
    }
    let updated = false;
    const updates = [];
    if (name !== undefined) {
        const result = (0, app_keys_js_1.updateAppKeyName)(keyId, userId, name.trim());
        if (!result) {
            (0, middleware_js_1.sendApiError)(res, {
                code: 'APP_KEY_NOT_FOUND',
                message: 'App key not found or not owned by you',
                statusCode: 404,
            }, requestId);
            return;
        }
        updated = true;
        updates.push('name');
    }
    if (description !== undefined) {
        const result = (0, app_keys_js_1.updateAppKeyDescription)(keyId, userId, description.trim());
        if (!result) {
            (0, middleware_js_1.sendApiError)(res, {
                code: 'APP_KEY_NOT_FOUND',
                message: 'App key not found or not owned by you',
                statusCode: 404,
            }, requestId);
            return;
        }
        updated = true;
        updates.push('description');
    }
    if (!updated) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'VALIDATION_ERROR',
            message: 'No fields to update. Provide name or description.',
            statusCode: 400,
        }, requestId);
        return;
    }
    logAppKeyEvent({
        type: 'app_key_updated',
        userId,
        requestId,
        success: true,
        appKeyId: keyId,
        details: { updatedFields: updates },
    });
    (0, middleware_js_1.sendApiSuccess)(res, { updated: true }, requestId);
}));
