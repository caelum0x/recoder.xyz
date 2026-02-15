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

import { Router } from 'express';
import type { CreateAppKeyRequest, PublicApiErrorCode } from '../types.js';
import {
  type AuthenticatedApiRequest,
  sendApiSuccess,
  sendApiError,
  asyncApiHandler,
} from '../middleware.js';
import {
  createAppKey,
  listUserAppKeys,
  getAppKeyInfo,
  revokeAppKey,
  deleteAppKey,
  updateAppKeyName,
  updateAppKeyDescription,
} from '../app-keys.js';
import {
  validateAppKeyName,
  validateAppKeyDescription,
  validateCallbackUrls,
  validateUUID,
  combineValidations,
} from '../validation.js';

// ==================== Audit Logging ====================

function logAppKeyEvent(event: {
  type: string;
  userId: string;
  requestId: string;
  success: boolean;
  appKeyId?: string;
  details?: Record<string, unknown>;
}): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    category: 'app_keys',
    ...event,
  };

  if (event.success) {
    console.log('[App Keys]', JSON.stringify(logEntry));
  } else {
    console.warn('[App Keys]', JSON.stringify(logEntry));
  }
}

// ==================== Router ====================

const router = Router();

/**
 * POST / - Create a new app key
 *
 * Requires: API key authentication
 * Body: { name, description?, allowedCallbackUrls? }
 * Returns: { appKey, keyInfo }
 */
router.post(
  '/',
  asyncApiHandler(async (req: AuthenticatedApiRequest, res) => {
    const requestId = req.requestId || 'unknown';
    const userId = req.userId;

    if (!userId) {
      sendApiError(res, {
        code: 'INVALID_API_KEY' as PublicApiErrorCode,
        message: 'Authentication required',
        statusCode: 401,
      }, requestId);
      return;
    }

    const body = req.body as CreateAppKeyRequest;

    // Validate inputs
    const validation = combineValidations(
      validateAppKeyName(body.name),
      validateAppKeyDescription(body.description),
      validateCallbackUrls(body.allowedCallbackUrls)
    );

    if (!validation.valid) {
      sendApiError(res, {
        code: 'VALIDATION_ERROR' as PublicApiErrorCode,
        message: validation.error || 'Invalid request',
        statusCode: 400,
      }, requestId);
      return;
    }

    try {
      const response = createAppKey(userId, {
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

      sendApiSuccess(res, response, requestId, 201);
    } catch (error) {
      logAppKeyEvent({
        type: 'app_key_creation_failed',
        userId,
        requestId,
        success: false,
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
      });
      sendApiError(res, {
        code: 'APP_KEY_CREATION_FAILED' as PublicApiErrorCode,
        message: 'Failed to create app key',
        statusCode: 500,
      }, requestId);
    }
  })
);

/**
 * GET / - List all app keys for the authenticated user
 *
 * Requires: API key authentication
 * Returns: { appKeys: [...] }
 */
router.get(
  '/',
  asyncApiHandler(async (req: AuthenticatedApiRequest, res) => {
    const requestId = req.requestId || 'unknown';
    const userId = req.userId;

    if (!userId) {
      sendApiError(res, {
        code: 'INVALID_API_KEY' as PublicApiErrorCode,
        message: 'Authentication required',
        statusCode: 401,
      }, requestId);
      return;
    }

    const appKeys = listUserAppKeys(userId);
    sendApiSuccess(res, { appKeys }, requestId);
  })
);

/**
 * GET /:id - Get app key details
 *
 * Requires: API key authentication
 * Returns: { appKey: {...} }
 */
router.get(
  '/:id',
  asyncApiHandler(async (req: AuthenticatedApiRequest, res) => {
    const requestId = req.requestId || 'unknown';
    const userId = req.userId;
    const keyId = req.params.id;

    if (!userId) {
      sendApiError(res, {
        code: 'INVALID_API_KEY' as PublicApiErrorCode,
        message: 'Authentication required',
        statusCode: 401,
      }, requestId);
      return;
    }

    // Validate key ID format
    const validation = validateUUID(keyId, 'keyId');
    if (!validation.valid) {
      sendApiError(res, {
        code: 'VALIDATION_ERROR' as PublicApiErrorCode,
        message: validation.error || 'Invalid key ID',
        statusCode: 400,
      }, requestId);
      return;
    }

    const appKey = getAppKeyInfo(keyId);

    if (!appKey) {
      sendApiError(res, {
        code: 'APP_KEY_NOT_FOUND' as PublicApiErrorCode,
        message: 'App key not found',
        statusCode: 404,
      }, requestId);
      return;
    }

    // Verify ownership
    if (appKey.ownerId !== userId) {
      sendApiError(res, {
        code: 'APP_KEY_FORBIDDEN' as PublicApiErrorCode,
        message: 'You do not own this app key',
        statusCode: 403,
      }, requestId);
      return;
    }

    sendApiSuccess(res, { appKey }, requestId);
  })
);

/**
 * DELETE /:id - Revoke an app key
 *
 * Requires: API key authentication
 * Returns: { revoked: true }
 */
router.delete(
  '/:id',
  asyncApiHandler(async (req: AuthenticatedApiRequest, res) => {
    const requestId = req.requestId || 'unknown';
    const userId = req.userId;
    const keyId = req.params.id;

    if (!userId) {
      sendApiError(res, {
        code: 'INVALID_API_KEY' as PublicApiErrorCode,
        message: 'Authentication required',
        statusCode: 401,
      }, requestId);
      return;
    }

    // Validate key ID format
    const validation = validateUUID(keyId, 'keyId');
    if (!validation.valid) {
      sendApiError(res, {
        code: 'VALIDATION_ERROR' as PublicApiErrorCode,
        message: validation.error || 'Invalid key ID',
        statusCode: 400,
      }, requestId);
      return;
    }

    const revoked = revokeAppKey(keyId, userId);

    if (!revoked) {
      sendApiError(res, {
        code: 'APP_KEY_NOT_FOUND' as PublicApiErrorCode,
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

    sendApiSuccess(res, { revoked: true }, requestId);
  })
);

/**
 * PATCH /:id - Update app key details
 *
 * Requires: API key authentication
 * Body: { name?, description? }
 * Returns: { updated: true }
 */
router.patch(
  '/:id',
  asyncApiHandler(async (req: AuthenticatedApiRequest, res) => {
    const requestId = req.requestId || 'unknown';
    const userId = req.userId;
    const keyId = req.params.id;

    if (!userId) {
      sendApiError(res, {
        code: 'INVALID_API_KEY' as PublicApiErrorCode,
        message: 'Authentication required',
        statusCode: 401,
      }, requestId);
      return;
    }

    // Validate key ID format
    const idValidation = validateUUID(keyId, 'keyId');
    if (!idValidation.valid) {
      sendApiError(res, {
        code: 'VALIDATION_ERROR' as PublicApiErrorCode,
        message: idValidation.error || 'Invalid key ID',
        statusCode: 400,
      }, requestId);
      return;
    }

    const { name, description } = req.body as { name?: string; description?: string };

    // Validate inputs if provided
    if (name !== undefined) {
      const nameValidation = validateAppKeyName(name);
      if (!nameValidation.valid) {
        sendApiError(res, {
          code: 'VALIDATION_ERROR' as PublicApiErrorCode,
          message: nameValidation.error || 'Invalid name',
          statusCode: 400,
        }, requestId);
        return;
      }
    }

    if (description !== undefined) {
      const descValidation = validateAppKeyDescription(description);
      if (!descValidation.valid) {
        sendApiError(res, {
          code: 'VALIDATION_ERROR' as PublicApiErrorCode,
          message: descValidation.error || 'Invalid description',
          statusCode: 400,
        }, requestId);
        return;
      }
    }

    let updated = false;
    const updates: string[] = [];

    if (name !== undefined) {
      const result = updateAppKeyName(keyId, userId, name.trim());
      if (!result) {
        sendApiError(res, {
          code: 'APP_KEY_NOT_FOUND' as PublicApiErrorCode,
          message: 'App key not found or not owned by you',
          statusCode: 404,
        }, requestId);
        return;
      }
      updated = true;
      updates.push('name');
    }

    if (description !== undefined) {
      const result = updateAppKeyDescription(keyId, userId, description.trim());
      if (!result) {
        sendApiError(res, {
          code: 'APP_KEY_NOT_FOUND' as PublicApiErrorCode,
          message: 'App key not found or not owned by you',
          statusCode: 404,
        }, requestId);
        return;
      }
      updated = true;
      updates.push('description');
    }

    if (!updated) {
      sendApiError(res, {
        code: 'VALIDATION_ERROR' as PublicApiErrorCode,
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

    sendApiSuccess(res, { updated: true }, requestId);
  })
);

export { router as appKeysRouter };
