import crypto from 'crypto';

/**
 * Security utilities for credential encryption
 * Uses AES-256-GCM for authenticated encryption
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY = process.env.ENCRYPTION_KEY || 'assistos-workflow-default-key-32'; // Fallback for dev

/**
 * Derives a 32-byte key from the provided string
 */
function getEncryptionKey(): Buffer {
    return Buffer.from(KEY.padEnd(32, '0').substring(0, 32));
}

/**
 * Encrypt an object into a secure string
 * Format: iv:authTag:encryptedData
 */
export function encryptCredential(data: any): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);

    const plainText = JSON.stringify(data);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');

    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt a secure string back into an object
 */
export function decryptCredential(encryptedData: string): any {
    try {
        const [ivHex, authTagHex, dataHex] = encryptedData.split(':');

        if (!ivHex || !authTagHex || !dataHex) {
            throw new Error('Invalid encrypted data format');
        }

        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);

        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(dataHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return JSON.parse(decrypted);
    } catch (error: any) {
        console.error('[Security] Decryption failed:', error.message);
        throw new Error('Failed to decrypt credential data. Key may be invalid or data corrupted.');
    }
}
