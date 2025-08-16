import { NextResponse } from 'next/server';
import logger from './logger';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
}

export class ValidationError extends Error {
  statusCode = 400;
  code = 'VALIDATION_ERROR';
  
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  statusCode = 404;
  code = 'NOT_FOUND';
  
  constructor(message: string = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends Error {
  statusCode = 401;
  code = 'UNAUTHORIZED';
  
  constructor(message: string = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export function handleApiError(error: unknown, context?: string): NextResponse {
  const timestamp = new Date().toISOString();
  
  if (error && typeof error === 'object' && 'statusCode' in error && 'code' in error) {
    const apiError = error as ApiError;
    logger.error('API Error', {
      message: apiError.message,
      statusCode: apiError.statusCode,
      code: apiError.code,
      stack: apiError.stack,
      context,
      timestamp
    });
    
    return NextResponse.json(
      {
        error: {
          message: apiError.message,
          code: apiError.code,
          timestamp
        }
      },
      { status: apiError.statusCode || 500 }
    );
  }
  
  if (error instanceof Error) {
    logger.error('Unexpected Error', {
      message: error.message,
      stack: error.stack,
      context,
      timestamp
    });
    
    return NextResponse.json(
      {
        error: {
          message: process.env.NODE_ENV === 'development' 
            ? error.message 
            : 'Internal server error',
          code: 'INTERNAL_ERROR',
          timestamp
        }
      },
      { status: 500 }
    );
  }
  
  logger.error('Unknown Error', {
    error: String(error),
    context,
    timestamp
  });
  
  return NextResponse.json(
    {
      error: {
        message: 'Internal server error',
        code: 'UNKNOWN_ERROR',
        timestamp
      }
    },
    { status: 500 }
  );
}

export function withErrorHandling<T extends any[], R>(
  handler: (...args: T) => Promise<R>,
  context?: string
) {
  return async (...args: T): Promise<R | NextResponse> => {
    try {
      return await handler(...args);
    } catch (error) {
      return handleApiError(error, context);
    }
  };
}