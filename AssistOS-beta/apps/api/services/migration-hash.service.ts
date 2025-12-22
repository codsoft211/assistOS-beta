import { createHash } from 'crypto';

/**
 * Migration Hash Service
 * 
 * Provides SQL hash verification to prevent sandbox bypass attacks.
 * Ensures that production migrations use EXACTLY the same SQL tested in sandbox.
 * 
 * Security: SHA-256 hash guarantees SQL integrity across environments
 */

/**
 * Calculate SHA-256 hash of SQL statements
 * @param sqlStatements - Array of SQL statements (upSql or downSql)
 * @returns Hex string hash (64 characters)
 */
export function calculateSqlHash(sqlStatements: string[]): string {
  // Normalize: join with newlines, trim whitespace
  const normalized = sqlStatements
    .map(sql => sql.trim())
    .join('\n');
  
  const hash = createHash('sha256')
    .update(normalized)
    .digest('hex');
  
  return hash;
}

/**
 * Verify that two SQL arrays produce the same hash
 * @param sqlA - First SQL array
 * @param sqlB - Second SQL array
 * @returns true if hashes match (SQL is identical)
 */
export function verifySqlMatch(sqlA: string[], sqlB: string[]): boolean {
  const hashA = calculateSqlHash(sqlA);
  const hashB = calculateSqlHash(sqlB);
  return hashA === hashB;
}
