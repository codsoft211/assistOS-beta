/**
 * Database Retry Utility
 * 
 * Provides retry logic for database operations that may fail due to transient
 * connection pool errors (e.g., MaxClientsInSessionMode).
 * 
 * **Usage Example:**
 * ```typescript
 * import { withDbRetry } from '@/shared/utils/db-retry';
 * 
 * const result = await withDbRetry(async () => {
 *   return await db.query.users.findFirst({ where: eq(users.id, userId) });
 * });
 * ```
 */


/**
 * Checks if an error is a database pool-related error that should be retried
 */
function isRetryableDbError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const errorMessage = error.message.toLowerCase();
  const errorCode = (error as any).code;

  // Check for pool-related errors
  const poolErrorPatterns = [
    'maxclientsinsessionmode',
    'pool_size',
    'max clients reached',
    'too many clients',
    'connection pool exhausted',
    'connection timeout',
  ];

  // Check for specific error codes
  const retryableCodes = ['XX000', '53300', '57P01']; // Internal error, too many connections, admin shutdown

  return (
    poolErrorPatterns.some(pattern => errorMessage.includes(pattern)) ||
    retryableCodes.includes(errorCode)
  );
}

/**
 * Sleep utility for delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export interface DbRetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in milliseconds for exponential backoff (default: 100) */
  baseDelay?: number;
  /** Custom error predicate to determine if error is retryable */
  isRetryable?: (error: unknown) => boolean;
}

/**
 * Retries a database operation with exponential backoff when encountering
 * transient pool-related errors.
 * 
 * @param operation - The database operation to retry
 * @param options - Retry configuration options
 * @returns The result of the operation
 * @throws The last error if all retries are exhausted
 */
export async function withDbRetry<T>(
  operation: () => Promise<T>,
  options: DbRetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 100,
    isRetryable = isRetryableDbError,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Check if error is retryable
      if (!isRetryable(error)) {
        // Not a retryable error, throw immediately
        throw error;
      }

      // If this was the last attempt, throw the error
      if (attempt >= maxRetries) {
        console.error(
          `[DB Retry] All ${maxRetries} retry attempts exhausted for database operation`,
          { error: error instanceof Error ? error.message : String(error) }
        );
        throw error;
      }

      // Calculate exponential backoff delay: baseDelay * 2^(attempt-1)
      // Attempt 1: 100ms, Attempt 2: 200ms, Attempt 3: 400ms
      const delay = baseDelay * Math.pow(2, attempt - 1);

      console.warn(
        `[DB Retry] Database pool error on attempt ${attempt}/${maxRetries}, retrying in ${delay}ms...`,
        { error: error instanceof Error ? error.message : String(error) }
      );

      // Wait before retrying
      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError;
}
