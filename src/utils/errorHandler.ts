/**
 * Centralized error handling utilities
 */

export class AppError extends Error {
  code: string;
  statusCode?: number;
  isOperational: boolean;
  
  constructor(
    message: string,
    code: string,
    statusCode?: number,
    isOperational: boolean = true
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
  }
}

export const handleApiError = (error: unknown, context: string): AppError => {
  console.error(`[${context}] API Error:`, error);
  
  if (error instanceof AppError) {
    return error;
  }
  
  if (error instanceof Error) {
    return new AppError(
      error.message,
      'API_ERROR',
      500,
      true
    );
  }
  
  return new AppError(
    'An unexpected error occurred',
    'UNKNOWN_ERROR',
    500,
    false
  );
};

export const validateApiResponse = <T>(
  response: unknown,
  requiredFields: string[]
): response is T => {
  if (!response || typeof response !== 'object') {
    return false;
  }
  
  return requiredFields.every(field => 
    field in (response as Record<string, unknown>)
  );
};

export const sanitizeInput = (input: string): string => {
  // Remove any potentially dangerous characters
  return input
    .replace(/[<>]/g, '') // Remove HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim();
};

export const logError = (error: AppError, additionalInfo?: Record<string, unknown>): void => {
  const errorLog = {
    timestamp: new Date().toISOString(),
    message: error.message,
    code: error.code,
    statusCode: error.statusCode,
    isOperational: error.isOperational,
    stack: error.stack,
    ...additionalInfo
  };
  
  console.error('[ERROR LOG]', errorLog);
  
  // In production, send to error tracking service
  if (import.meta.env.PROD) {
    // Send to Sentry, LogRocket, etc.
  }
};

export const withErrorHandler = async <T>(
  fn: () => Promise<T>,
  context: string,
  fallback?: T
): Promise<T | undefined> => {
  try {
    return await fn();
  } catch (error) {
    const appError = handleApiError(error, context);
    logError(appError);
    
    if (fallback !== undefined) {
      return fallback;
    }
    
    throw appError;
  }
};