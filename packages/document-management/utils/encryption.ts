/**
 * Credential Encryption Utility
 * 
 * Implements AES-256-GCM encryption for storage provider credentials.
 * Uses environment variable ENCRYPTION_KEY for the master encryption key.
 * 
 * Security features:
 * - AES-256-GCM authenticated encryption
 * - Random IV for each encryption (stored with ciphertext)
 * - Support for key versioning and rotation
 * - Tenant-specific key derivation for multi-tenant isolation
 * 
 * @example
 * ```typescript
 * const encrypted = encryptCredentials(credentials, tenantId);
 * const decrypted = decryptCredentials(encrypted, tenantId);
 * ```
 */

import crypto from 'crypto';

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits authentication tag
const KEY_LENGTH = 32; // 256 bits for AES-256
const SALT_LENGTH = 32; // 256 bits salt for key derivation
const PBKDF2_ITERATIONS = 100000; // OWASP recommended minimum
const ENCRYPTION_VERSION = 'v1'; // For future key rotation support

// ═══════════════════════════════════════════════════════════════════════════════
// Error Classes
// ═══════════════════════════════════════════════════════════════════════════════

export class EncryptionError extends Error {
  constructor(message: string) {
    super(`Encryption failed: ${message}`);
    this.name = 'EncryptionError';
  }
}

export class DecryptionError extends Error {
  constructor(message: string) {
    super(`Decryption failed: ${message}`);
    this.name = 'DecryptionError';
  }
}

export class KeyNotConfiguredError extends Error {
  constructor() {
    super('ENCRYPTION_KEY environment variable not configured');
    this.name = 'KeyNotConfiguredError';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface EncryptedData {
  version: string;
  encryptedData: string;
  iv: string;
  authTag: string;
  keyId: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Key Management
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get the master encryption key from environment
 * Throws if not configured
 */
function getMasterKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new KeyNotConfiguredError();
  }
  
  // Validate key format (should be hex-encoded 256-bit key)
  if (key.length < 64) {
    console.warn('[Encryption] ENCRYPTION_KEY should be at least 64 hex characters (256 bits)');
  }
  
  return key;
}

/**
 * Derive tenant-specific encryption key using PBKDF2
 * Provides cryptographic isolation between tenants
 * 
 * @param tenantId - Tenant identifier
 * @returns 256-bit derived key buffer
 */
function deriveTenantKey(tenantId: string): Buffer {
  const masterKey = getMasterKey();
  
  // Use tenant ID as salt for deterministic derivation
  // This allows same tenant to always get same derived key
  const salt = crypto.createHash('sha256').update(tenantId).digest();
  
  // Derive key using PBKDF2
  return crypto.pbkdf2Sync(
    masterKey,
    salt,
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    'sha256'
  );
}

/**
 * Generate encryption key ID for tracking
 * Format: {version}_{tenantId}_{timestamp}
 */
function generateKeyId(tenantId: string): string {
  const timestamp = Date.now();
  return `${ENCRYPTION_VERSION}_${tenantId}_${timestamp}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Encryption / Decryption
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Encrypt credentials using AES-256-GCM
 * 
 * @param credentials - Credential object to encrypt
 * @param tenantId - Tenant ID for key derivation
 * @returns Encrypted data object
 * 
 * @example
 * ```typescript
 * const encrypted = encryptCredentials({
 *   accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
 *   secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
 * }, 'tenant-123');
 * ```
 */
export function encryptCredentials(
  credentials: Record<string, string>,
  tenantId: string
): EncryptedData {
  try {
    // 1. Derive tenant-specific key
    const key = deriveTenantKey(tenantId);
    
    // 2. Generate random IV (must be unique for each encryption)
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // 3. Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    // 4. Encrypt credentials (convert to JSON first)
    const plaintext = JSON.stringify(credentials);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // 5. Get authentication tag (GCM provides authenticated encryption)
    const authTag = cipher.getAuthTag();
    
    // 6. Generate key ID for tracking
    const keyId = generateKeyId(tenantId);
    
    // 7. Return encrypted data with metadata
    return {
      version: ENCRYPTION_VERSION,
      encryptedData: encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      keyId,
    };
  } catch (error: any) {
    throw new EncryptionError(error.message);
  }
}

/**
 * Decrypt credentials using AES-256-GCM
 * 
 * @param encryptedData - Encrypted data object
 * @param tenantId - Tenant ID for key derivation
 * @returns Decrypted credentials object
 * 
 * @example
 * ```typescript
 * const decrypted = decryptCredentials(encrypted, 'tenant-123');
 * console.log(decrypted.accessKeyId);
 * ```
 */
export function decryptCredentials(
  encryptedData: EncryptedData,
  tenantId: string
): Record<string, string> {
  try {
    // 1. Validate version (for future key rotation support)
    if (encryptedData.version !== ENCRYPTION_VERSION) {
      throw new DecryptionError(`Unsupported encryption version: ${encryptedData.version}`);
    }
    
    // 2. Derive tenant-specific key (same derivation as encryption)
    const key = deriveTenantKey(tenantId);
    
    // 3. Convert hex strings back to buffers
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const authTag = Buffer.from(encryptedData.authTag, 'hex');
    const encrypted = Buffer.from(encryptedData.encryptedData, 'hex');
    
    // 4. Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    // 5. Decrypt
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    // 6. Parse JSON and return
    return JSON.parse(decrypted.toString('utf8'));
  } catch (error: any) {
    // Don't leak sensitive information in error messages
    if (error instanceof DecryptionError) {
      throw error;
    }
    throw new DecryptionError('Invalid encrypted data or wrong key');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Legacy Support (for migration from base64 encoding)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if data is legacy base64-encoded credentials
 * Used during migration period
 */
export function isLegacyEncryption(data: string): boolean {
  try {
    // Legacy format is just base64-encoded JSON
    const decoded = Buffer.from(data, 'base64').toString('utf-8');
    JSON.parse(decoded);
    return true;
  } catch {
    return false;
  }
}

/**
 * Decrypt legacy base64-encoded credentials
 * Only used for backward compatibility during migration
 */
export function decryptLegacyCredentials(encryptedData: string): Record<string, string> {
  try {
    const json = Buffer.from(encryptedData, 'base64').toString('utf-8');
    return JSON.parse(json);
  } catch (error: any) {
    throw new DecryptionError('Failed to decrypt legacy credentials');
  }
}

/**
 * Migrate legacy credentials to new encryption format
 * 
 * @param legacyEncrypted - Legacy base64-encoded string
 * @param tenantId - Tenant ID
 * @returns New encrypted data object
 */
export function migrateLegacyCredentials(
  legacyEncrypted: string,
  tenantId: string
): EncryptedData {
  // 1. Decrypt legacy format
  const credentials = decryptLegacyCredentials(legacyEncrypted);
  
  // 2. Re-encrypt with new format
  return encryptCredentials(credentials, tenantId);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Serialize encrypted data for database storage
 * Stores as JSON string containing all encryption metadata
 */
export function serializeEncryptedData(data: EncryptedData): string {
  return JSON.stringify(data);
}

/**
 * Deserialize encrypted data from database
 */
export function deserializeEncryptedData(serialized: string): EncryptedData {
  try {
    const data = JSON.parse(serialized);
    
    // Validate structure
    if (!data.version || !data.encryptedData || !data.iv || !data.authTag || !data.keyId) {
      throw new Error('Invalid encrypted data structure');
    }
    
    return data as EncryptedData;
  } catch (error: any) {
    throw new DecryptionError(`Invalid serialized data: ${error.message}`);
  }
}

/**
 * Constant-time string comparison to prevent timing attacks
 * Used for comparing encryption keys or auth tokens
 */
export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Key Rotation Support
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Re-encrypt credentials with a new key version
 * Used during key rotation process
 * 
 * @param encryptedData - Current encrypted data
 * @param tenantId - Tenant ID
 * @returns Re-encrypted data with new key ID
 */
export function rotateEncryption(
  encryptedData: EncryptedData,
  tenantId: string
): EncryptedData {
  // 1. Decrypt with current key
  const credentials = decryptCredentials(encryptedData, tenantId);
  
  // 2. Re-encrypt with same key but new IV and key ID
  return encryptCredentials(credentials, tenantId);
}
