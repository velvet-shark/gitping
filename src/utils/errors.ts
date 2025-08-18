// Error handling utilities for GitPing

export class GitPingError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = 'GitPingError';
  }
}

export class GitHubAPIError extends GitPingError {
  constructor(message: string, statusCode: number, context?: Record<string, any>) {
    super(message, 'GITHUB_API_ERROR', statusCode, context);
    this.name = 'GitHubAPIError';
  }
}

export class TelegramAPIError extends GitPingError {
  constructor(message: string, statusCode: number, context?: Record<string, any>) {
    super(message, 'TELEGRAM_API_ERROR', statusCode, context);
    this.name = 'TelegramAPIError';
  }
}

export class DatabaseError extends GitPingError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'DATABASE_ERROR', 500, context);
    this.name = 'DatabaseError';
  }
}

export class ValidationError extends GitPingError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'VALIDATION_ERROR', 400, context);
    this.name = 'ValidationError';
  }
}

export class RateLimitError extends GitPingError {
  constructor(message: string, retryAfter?: number) {
    super(message, 'RATE_LIMIT_ERROR', 429, { retry_after: retryAfter });
    this.name = 'RateLimitError';
  }
}

// Error response helper
export function createErrorResponse(error: unknown, fallbackStatus = 500): Response {
  let message = 'Internal server error';
  let statusCode = fallbackStatus;
  let code = 'UNKNOWN_ERROR';
  let context: Record<string, any> | undefined;

  if (error instanceof GitPingError) {
    message = error.message;
    statusCode = error.statusCode;
    code = error.code;
    context = error.context;
  } else if (error instanceof Error) {
    message = error.message;
  }

  const responseBody = {
    error: {
      message,
      code,
      ...(context && { context })
    }
  };

  return new Response(JSON.stringify(responseBody), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

// Retry utility with exponential backoff
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelayMs: number = 1000,
  backoffMultiplier: number = 2
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === maxAttempts) {
        throw lastError;
      }

      // Calculate delay with exponential backoff
      const delay = baseDelayMs * Math.pow(backoffMultiplier, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

// Circuit breaker utility
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private failureThreshold: number = 5,
    private recoveryTimeMs: number = 60000 // 1 minute
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime < this.recoveryTimeMs) {
        throw new Error('Circuit breaker is OPEN');
      }
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  getState(): string {
    return this.state;
  }

  getFailureCount(): number {
    return this.failures;
  }
}

// Safe JSON parsing
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}