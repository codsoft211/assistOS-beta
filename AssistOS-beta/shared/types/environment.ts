/**
 * Environment Taxonomy for AssistOS
 * 
 * This module defines the complete environment taxonomy, validation rules,
 * and guard-rails for the sandbox isolation system.
 * 
 * @module shared/types/environment
 */

// ==================== ENVIRONMENT CONSTANTS ====================

/**
 * Available environments in the system.
 * 
 * - PRODUCTION: Real business data (default)
 * - SANDBOX: Isolated testing/experimentation environment
 */
export const ENVIRONMENTS = {
  PRODUCTION: 'production',
  SANDBOX: 'sandbox',
} as const;

/**
 * Environment type - can be 'production' or 'sandbox'
 */
export type Environment = typeof ENVIRONMENTS[keyof typeof ENVIRONMENTS];

/**
 * Default environment for all new records
 */
export const DEFAULT_ENVIRONMENT: Environment = ENVIRONMENTS.PRODUCTION;

// ==================== VALIDATION FUNCTIONS ====================

/**
 * Type guard to check if a value is a valid Environment
 * 
 * @param value - Value to check
 * @returns True if value is a valid Environment
 * 
 * @example
 * ```typescript
 * if (isValidEnvironment(userInput)) {
 *   // userInput is now typed as Environment
 *   const env: Environment = userInput;
 * }
 * ```
 */
export function isValidEnvironment(value: unknown): value is Environment {
  return typeof value === 'string' && Object.values(ENVIRONMENTS).includes(value as any);
}

/**
 * Validates and returns an Environment value
 * 
 * @param value - Value to validate
 * @returns Valid Environment value
 * @throws Error if value is not a valid environment
 * 
 * @example
 * ```typescript
 * const env = validateEnvironment(req.body.environment);
 * // env is guaranteed to be 'production' | 'sandbox'
 * ```
 */
export function validateEnvironment(value: unknown): Environment {
  if (!isValidEnvironment(value)) {
    throw new Error(
      `Invalid environment: ${value}. Must be one of: ${Object.values(ENVIRONMENTS).join(', ')}`
    );
  }
  return value;
}

/**
 * Safely coerce a value to an Environment, returning default if invalid
 * 
 * @param value - Value to coerce
 * @param fallback - Fallback value (defaults to DEFAULT_ENVIRONMENT)
 * @returns Valid Environment value
 * 
 * @example
 * ```typescript
 * const env = coerceEnvironment(userInput); // Returns 'production' if invalid
 * const env2 = coerceEnvironment(userInput, ENVIRONMENTS.SANDBOX); // Custom fallback
 * ```
 */
export function coerceEnvironment(
  value: unknown,
  fallback: Environment = DEFAULT_ENVIRONMENT
): Environment {
  return isValidEnvironment(value) ? value : fallback;
}

// ==================== GUARD-RAILS ====================

/**
 * Environment guard-rails configuration
 * 
 * These rules enforce safe patterns and prevent accidental data corruption
 */
export const ENVIRONMENT_GUARD_RAILS = {
  /**
   * Environment is immutable after creation
   * Once a record is created, its environment cannot be changed
   * Use promotion workflow instead
   */
  IMMUTABLE: true,

  /**
   * Promotion is only allowed FROM sandbox
   */
  PROMOTION_ALLOWED_FROM: [ENVIRONMENTS.SANDBOX] as const,

  /**
   * Promotion is only allowed TO production
   */
  PROMOTION_ALLOWED_TO: [ENVIRONMENTS.PRODUCTION] as const,

  /**
   * Default environment for new records
   */
  DEFAULT: DEFAULT_ENVIRONMENT,
  
  /**
   * Cross-environment foreign keys are prohibited
   * FK relationships must respect environment boundaries
   */
  NO_CROSS_ENVIRONMENT_FK: true,
} as const;

// ==================== PROMOTION VALIDATION ====================

/**
 * Validates if promotion from one environment to another is allowed
 * 
 * @param from - Source environment
 * @param to - Target environment
 * @returns True if promotion is allowed
 * 
 * @example
 * ```typescript
 * if (canPromote(ENVIRONMENTS.SANDBOX, ENVIRONMENTS.PRODUCTION)) {
 *   // Proceed with promotion
 * }
 * ```
 */
export function canPromote(from: Environment, to: Environment): boolean {
  return (
    ENVIRONMENT_GUARD_RAILS.PROMOTION_ALLOWED_FROM.includes(from as any) &&
    ENVIRONMENT_GUARD_RAILS.PROMOTION_ALLOWED_TO.includes(to as any)
  );
}

/**
 * Validates promotion and throws error if not allowed
 * 
 * @param from - Source environment
 * @param to - Target environment
 * @throws Error if promotion is not allowed
 * 
 * @example
 * ```typescript
 * validatePromotion(source.environment, ENVIRONMENTS.PRODUCTION);
 * // Throws if not sandbox → production
 * ```
 */
export function validatePromotion(from: Environment, to: Environment): void {
  if (!canPromote(from, to)) {
    throw new Error(
      `Invalid promotion: Cannot promote from '${from}' to '${to}'. ` +
      `Only sandbox → production promotions are allowed.`
    );
  }
}

// ==================== ENVIRONMENT FILTERING ====================

/**
 * Creates a WHERE clause for environment filtering
 * 
 * @param environment - Environment to filter by
 * @returns Object suitable for Drizzle where clause
 * 
 * @example
 * ```typescript
 * const data = await db.select()
 *   .from(clients)
 *   .where(and(
 *     eq(clients.tenantId, tenantId),
 *     ...environmentFilter(currentEnvironment)
 *   ));
 * ```
 */
export function environmentFilter(environment: Environment) {
  return { environment };
}

/**
 * Validates that all related records are in the same environment
 * 
 * @param records - Array of records with environment property
 * @param expectedEnvironment - Expected environment
 * @throws Error if any record is in a different environment
 * 
 * @example
 * ```typescript
 * validateSameEnvironment(
 *   [client, order, invoice],
 *   ENVIRONMENTS.PRODUCTION
 * );
 * ```
 */
export function validateSameEnvironment<T extends { environment: Environment }>(
  records: T[],
  expectedEnvironment: Environment
): void {
  const violations = records.filter(r => r.environment !== expectedEnvironment);
  
  if (violations.length > 0) {
    throw new Error(
      `Environment violation: Expected all records to be in '${expectedEnvironment}' ` +
      `but found ${violations.length} record(s) in different environment(s). ` +
      `Cross-environment references are not allowed.`
    );
  }
}

/**
 * Validates that a new record can reference an existing record
 * (both must be in the same environment)
 * 
 * @param newRecordEnvironment - Environment of the new record
 * @param existingRecordEnvironment - Environment of the existing record
 * @throws Error if environments don't match
 * 
 * @example
 * ```typescript
 * validateForeignKeyEnvironment(
 *   newOrder.environment,
 *   client.environment
 * );
 * ```
 */
export function validateForeignKeyEnvironment(
  newRecordEnvironment: Environment,
  existingRecordEnvironment: Environment
): void {
  if (newRecordEnvironment !== existingRecordEnvironment) {
    throw new Error(
      `Cross-environment foreign key violation: Cannot create ${newRecordEnvironment} ` +
      `record referencing ${existingRecordEnvironment} record. ` +
      `Both records must be in the same environment.`
    );
  }
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Gets the opposite environment (for testing/comparison purposes)
 * 
 * @param environment - Current environment
 * @returns The opposite environment
 * 
 * @example
 * ```typescript
 * getOppositeEnvironment(ENVIRONMENTS.PRODUCTION) // Returns 'sandbox'
 * getOppositeEnvironment(ENVIRONMENTS.SANDBOX) // Returns 'production'
 * ```
 */
export function getOppositeEnvironment(environment: Environment): Environment {
  return environment === ENVIRONMENTS.PRODUCTION
    ? ENVIRONMENTS.SANDBOX
    : ENVIRONMENTS.PRODUCTION;
}

/**
 * Checks if environment is production
 * 
 * @param environment - Environment to check
 * @returns True if production
 */
export function isProduction(environment: Environment): boolean {
  return environment === ENVIRONMENTS.PRODUCTION;
}

/**
 * Checks if environment is sandbox
 * 
 * @param environment - Environment to check
 * @returns True if sandbox
 */
export function isSandbox(environment: Environment): boolean {
  return environment === ENVIRONMENTS.SANDBOX;
}

/**
 * Gets a human-readable label for an environment
 * 
 * @param environment - Environment to get label for
 * @returns Human-readable label
 * 
 * @example
 * ```typescript
 * getEnvironmentLabel(ENVIRONMENTS.PRODUCTION) // Returns 'Production'
 * getEnvironmentLabel(ENVIRONMENTS.SANDBOX) // Returns 'Sandbox (Testing)'
 * ```
 */
export function getEnvironmentLabel(environment: Environment): string {
  switch (environment) {
    case ENVIRONMENTS.PRODUCTION:
      return 'Production';
    case ENVIRONMENTS.SANDBOX:
      return 'Sandbox (Testing)';
    default:
      return environment;
  }
}

/**
 * Gets environment badge color for UI
 * 
 * @param environment - Environment to get color for
 * @returns Color name suitable for UI badges
 */
export function getEnvironmentBadgeColor(environment: Environment): string {
  switch (environment) {
    case ENVIRONMENTS.PRODUCTION:
      return 'blue';
    case ENVIRONMENTS.SANDBOX:
      return 'orange';
    default:
      return 'gray';
  }
}
