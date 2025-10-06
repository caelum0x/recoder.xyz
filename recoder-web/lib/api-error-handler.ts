/**
 * Unified API Error Handler for Recoder.xyz
 * Standardizes error responses across all API endpoints
 */

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';

export enum ErrorCode {
  // Authentication & Authorization
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  
  // Validation
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  
  // Database
  DATABASE_ERROR = 'DATABASE_ERROR',
  RECORD_NOT_FOUND = 'RECORD_NOT_FOUND',
  DUPLICATE_RECORD = 'DUPLICATE_RECORD',
  FOREIGN_KEY_CONSTRAINT = 'FOREIGN_KEY_CONSTRAINT',
  
  // AI & External Services
  AI_PROVIDER_ERROR = 'AI_PROVIDER_ERROR',
  AI_RATE_LIMIT = 'AI_RATE_LIMIT',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  
  // System
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  
  // Business Logic
  INSUFFICIENT_CREDITS = 'INSUFFICIENT_CREDITS',
  FEATURE_NOT_AVAILABLE = 'FEATURE_NOT_AVAILABLE',
  SUBSCRIPTION_REQUIRED = 'SUBSCRIPTION_REQUIRED',
}

export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: any;
  timestamp: string;
  requestId?: string;
  statusCode: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: {
    timestamp: string;
    requestId?: string;
    version?: string;
  };
}

/**
 * Create standardized API response
 */
export function createApiResponse<T>(
  data: T,
  meta?: { requestId?: string }
): NextResponse<ApiResponse<T>> {
  return NextResponse.json({
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: meta?.requestId,
      version: process.env.NEXT_PUBLIC_RECODER_VERSION || '1.0.0',
    },
  });
}

/**
 * Create standardized API error response
 */
export function createApiError(
  code: ErrorCode,
  message: string,
  statusCode: number = 500,
  details?: any,
  requestId?: string
): NextResponse<ApiResponse> {
  const error: ApiError = {
    code,
    message,
    details,
    timestamp: new Date().toISOString(),
    requestId,
    statusCode,
  };

  // Log error for monitoring
  console.error('API Error:', {
    code,
    message,
    statusCode,
    details,
    requestId,
    timestamp: error.timestamp,
  });

  return NextResponse.json(
    {
      success: false,
      error,
      meta: {
        timestamp: error.timestamp,
        requestId,
      },
    },
    { status: statusCode }
  );
}

/**
 * Unified error handler for API routes
 */
export function handleApiError(
  error: unknown,
  requestId?: string
): NextResponse<ApiResponse> {
  console.error('Unhandled API error:', error);

  // Zod validation errors
  if (error instanceof ZodError) {
    return createApiError(
      ErrorCode.VALIDATION_ERROR,
      'Invalid input data',
      400,
      {
        validationErrors: error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        })),
      },
      requestId
    );
  }

  // Prisma database errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        return createApiError(
          ErrorCode.DUPLICATE_RECORD,
          'Record already exists',
          409,
          { constraint: error.meta?.target },
          requestId
        );
      case 'P2025':
        return createApiError(
          ErrorCode.RECORD_NOT_FOUND,
          'Record not found',
          404,
          { operation: error.meta?.cause },
          requestId
        );
      case 'P2003':
        return createApiError(
          ErrorCode.FOREIGN_KEY_CONSTRAINT,
          'Foreign key constraint failed',
          400,
          { constraint: error.meta?.field_name },
          requestId
        );
      default:
        return createApiError(
          ErrorCode.DATABASE_ERROR,
          'Database operation failed',
          500,
          { prismaCode: error.code },
          requestId
        );
    }
  }

  // Prisma connection errors
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return createApiError(
      ErrorCode.SERVICE_UNAVAILABLE,
      'Database connection failed',
      503,
      { reason: 'Database unavailable' },
      requestId
    );
  }

  // JSON parsing errors
  if (error instanceof SyntaxError && error.message.includes('JSON')) {
    return createApiError(
      ErrorCode.VALIDATION_ERROR,
      'Invalid JSON in request body',
      400,
      { hint: 'Ensure your request body is valid JSON format' },
      requestId
    );
  }

  // Generic JavaScript errors
  if (error instanceof Error) {
    // Check for specific error patterns
    if (error.message.includes('rate limit')) {
      return createApiError(
        ErrorCode.RATE_LIMIT_EXCEEDED,
        'Rate limit exceeded',
        429,
        { retryAfter: '60s' },
        requestId
      );
    }

    if (error.message.includes('unauthorized') || error.message.includes('401')) {
      return createApiError(
        ErrorCode.UNAUTHORIZED,
        'Authentication required',
        401,
        undefined,
        requestId
      );
    }

    if (error.message.includes('forbidden') || error.message.includes('403')) {
      return createApiError(
        ErrorCode.FORBIDDEN,
        'Insufficient permissions',
        403,
        undefined,
        requestId
      );
    }

    // AI provider specific errors
    if (error.message.includes('anthropic') || error.message.includes('openai') || error.message.includes('openrouter')) {
      return createApiError(
        ErrorCode.AI_PROVIDER_ERROR,
        'AI service temporarily unavailable',
        502,
        { provider: 'AI service', originalError: error.message },
        requestId
      );
    }

    // Generic error with message
    return createApiError(
      ErrorCode.INTERNAL_SERVER_ERROR,
      error.message || 'An unexpected error occurred',
      500,
      { originalError: error.name },
      requestId
    );
  }

  // Unknown error type
  return createApiError(
    ErrorCode.INTERNAL_SERVER_ERROR,
    'An unexpected error occurred',
    500,
    { errorType: typeof error },
    requestId
  );
}

/**
 * Wrapper for API route handlers with automatic error handling
 */
export function withErrorHandler<T extends any[], R>(
  handler: (...args: T) => Promise<NextResponse<ApiResponse<R>>>
) {
  return async (...args: T): Promise<NextResponse<ApiResponse<R>>> => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    try {
      return await handler(...args);
    } catch (error) {
      return handleApiError(error, requestId) as NextResponse<ApiResponse<R>>;
    }
  };
}

/**
 * Helper to validate required environment variables
 */
export function validateRequiredEnvVars(vars: string[]): void {
  const missing = vars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

/**
 * Helper to create success response with pagination
 */
export function createPaginatedResponse<T>(
  data: T[],
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  },
  requestId?: string
): NextResponse<ApiResponse<{ items: T[]; pagination: typeof pagination }>> {
  return NextResponse.json({
    success: true,
    data: {
      items: data,
      pagination,
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId,
    },
  });
}

export default {
  createApiResponse,
  createApiError,
  handleApiError,
  withErrorHandler,
  validateRequiredEnvVars,
  createPaginatedResponse,
  ErrorCode,
};