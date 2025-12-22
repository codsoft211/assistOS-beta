import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY || process.env.DATABASE_URL;
  if (!key) {
    throw new Error('ENCRYPTION_KEY or DATABASE_URL required for session encryption');
  }
  return crypto.createHash('sha256').update(key).digest().subarray(0, KEY_LENGTH);
}

export function encryptSessionData(data: object): string {
  if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
    throw new Error('Cannot encrypt empty or null session data');
  }
  
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  const jsonData = JSON.stringify(data);
  const encrypted = Buffer.concat([
    cipher.update(jsonData, 'utf8'),
    cipher.final()
  ]);
  
  const authTag = cipher.getAuthTag();
  
  const combined = Buffer.concat([
    iv,
    authTag,
    encrypted
  ]);
  
  return combined.toString('base64');
}

export function decryptSessionData(encryptedData: string): object {
  const key = getEncryptionKey();
  const combined = Buffer.from(encryptedData, 'base64');
  
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);
  
  return JSON.parse(decrypted.toString('utf8'));
}
