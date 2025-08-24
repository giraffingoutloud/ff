export class LineupOptimizerError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'LineupOptimizerError';
  }
}

export class DataError extends LineupOptimizerError {
  constructor(message: string, details?: any) {
    super(message, 'DATA_ERROR', details);
    this.name = 'DataError';
  }
}

export class ValidationError extends LineupOptimizerError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class APIError extends LineupOptimizerError {
  constructor(message: string, statusCode?: number, details?: any) {
    super(message, 'API_ERROR', { statusCode, ...details });
    this.name = 'APIError';
  }
}

export class DatabaseError extends LineupOptimizerError {
  constructor(message: string, details?: any) {
    super(message, 'DATABASE_ERROR', details);
    this.name = 'DatabaseError';
  }
}

export class ErrorHandler {
  private static instance: ErrorHandler;
  private errorLog: Array<{
    timestamp: Date;
    error: LineupOptimizerError;
    context?: any;
  }> = [];

  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  handleError(error: Error, context?: any): void {
    const optimizerError = this.wrapError(error);
    
    this.errorLog.push({
      timestamp: new Date(),
      error: optimizerError,
      context
    });

    console.error(`[${optimizerError.code}] ${optimizerError.message}`);
    if (optimizerError.details) {
      console.error('Details:', optimizerError.details);
    }
    if (context) {
      console.error('Context:', context);
    }

    if (process.env.NODE_ENV === 'development') {
      console.error('Stack:', optimizerError.stack);
    }
  }

  wrapError(error: Error): LineupOptimizerError {
    if (error instanceof LineupOptimizerError) {
      return error;
    }

    if (error.message.includes('fetch')) {
      return new APIError(error.message);
    }

    if (error.message.includes('database') || error.message.includes('query')) {
      return new DatabaseError(error.message);
    }

    if (error.message.includes('invalid') || error.message.includes('required')) {
      return new ValidationError(error.message);
    }

    return new LineupOptimizerError(error.message, 'UNKNOWN_ERROR');
  }

  async withRetry<T>(
    operation: () => Promise<T>,
    options: {
      maxRetries?: number;
      delay?: number;
      backoff?: number;
      shouldRetry?: (error: Error) => boolean;
    } = {}
  ): Promise<T> {
    const {
      maxRetries = 3,
      delay = 1000,
      backoff = 2,
      shouldRetry = (error) => error instanceof APIError
    } = options;

    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (!shouldRetry(lastError) || attempt === maxRetries - 1) {
          throw lastError;
        }

        const waitTime = delay * Math.pow(backoff, attempt);
        console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    throw lastError;
  }

  getRecentErrors(limit: number = 10): typeof this.errorLog {
    return this.errorLog.slice(-limit);
  }

  clearErrorLog(): void {
    this.errorLog = [];
  }
}

export class DataValidator {
  static validatePlayerProjection(data: any): void {
    if (!data || typeof data !== 'object') {
      throw new ValidationError('Invalid player projection data');
    }

    const required = ['player', 'projection'];
    for (const field of required) {
      if (!(field in data)) {
        throw new ValidationError(`Missing required field: ${field}`);
      }
    }

    this.validatePlayer(data.player);
    this.validateProjection(data.projection);
  }

  static validatePlayer(player: any): void {
    if (!player || typeof player !== 'object') {
      throw new ValidationError('Invalid player data');
    }

    const required = ['id', 'name', 'team', 'position'];
    for (const field of required) {
      if (!(field in player)) {
        throw new ValidationError(`Missing required player field: ${field}`);
      }
    }

    const validPositions = ['QB', 'RB', 'WR', 'TE', 'DST', 'K'];
    if (!validPositions.includes(player.position)) {
      throw new ValidationError(
        `Invalid position: ${player.position}`,
        { validPositions }
      );
    }

    if (typeof player.projectedPoints !== 'number' || player.projectedPoints < 0) {
      throw new ValidationError('Invalid projected points');
    }
  }

  static validateProjection(projection: any): void {
    if (!projection || typeof projection !== 'object') {
      throw new ValidationError('Invalid projection data');
    }

    const required = ['floor', 'median', 'ceiling'];
    for (const field of required) {
      if (!(field in projection)) {
        throw new ValidationError(`Missing required projection field: ${field}`);
      }
      
      if (typeof projection[field] !== 'number' || projection[field] < 0) {
        throw new ValidationError(`Invalid ${field} value: ${projection[field]}`);
      }
    }

    if (projection.floor > projection.median || projection.median > projection.ceiling) {
      throw new ValidationError(
        'Invalid projection range: floor <= median <= ceiling',
        { floor: projection.floor, median: projection.median, ceiling: projection.ceiling }
      );
    }

    if (projection.confidence !== undefined) {
      if (projection.confidence < 0 || projection.confidence > 1) {
        throw new ValidationError(
          `Confidence must be between 0 and 1: ${projection.confidence}`
        );
      }
    }
  }

  static validateLineupRequirements(requirements: any): void {
    if (!requirements || typeof requirements !== 'object') {
      throw new ValidationError('Invalid lineup requirements');
    }

    const positions = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'DST', 'K'];
    let totalSlots = 0;

    for (const position of positions) {
      if (position in requirements) {
        const count = requirements[position];
        if (!Number.isInteger(count) || count < 0) {
          throw new ValidationError(
            `Invalid count for ${position}: ${count}`
          );
        }
        totalSlots += count;
      }
    }

    if (totalSlots === 0) {
      throw new ValidationError('No roster slots specified');
    }

    if (totalSlots > 20) {
      throw new ValidationError(
        `Too many roster slots: ${totalSlots} (max 20)`
      );
    }
  }

  static validateWeatherData(weather: any): void {
    if (!weather || typeof weather !== 'object') {
      throw new ValidationError('Invalid weather data');
    }

    if (typeof weather.temperature !== 'number') {
      throw new ValidationError('Invalid temperature');
    }

    if (weather.windSpeed < 0) {
      throw new ValidationError('Wind speed cannot be negative');
    }

    if (weather.precipitation < 0) {
      throw new ValidationError('Precipitation cannot be negative');
    }
  }

  static sanitizeInput(input: any): any {
    if (typeof input === 'string') {
      return input.trim().replace(/[<>]/g, '');
    }
    
    if (Array.isArray(input)) {
      return input.map(item => this.sanitizeInput(item));
    }
    
    if (input && typeof input === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(input)) {
        sanitized[key] = this.sanitizeInput(value);
      }
      return sanitized;
    }
    
    return input;
  }
}

export class RateLimiter {
  private requests: Map<string, number[]> = new Map();

  constructor(
    private maxRequests: number = 10,
    private windowMs: number = 60000
  ) {}

  async checkLimit(key: string): Promise<boolean> {
    const now = Date.now();
    const requests = this.requests.get(key) || [];
    
    const recentRequests = requests.filter(
      timestamp => now - timestamp < this.windowMs
    );
    
    if (recentRequests.length >= this.maxRequests) {
      const oldestRequest = recentRequests[0];
      const waitTime = this.windowMs - (now - oldestRequest);
      
      throw new APIError(
        `Rate limit exceeded. Try again in ${Math.ceil(waitTime / 1000)}s`,
        429,
        { waitTime }
      );
    }
    
    recentRequests.push(now);
    this.requests.set(key, recentRequests);
    
    return true;
  }

  reset(key?: string): void {
    if (key) {
      this.requests.delete(key);
    } else {
      this.requests.clear();
    }
  }
}

export const errorHandler = ErrorHandler.getInstance();