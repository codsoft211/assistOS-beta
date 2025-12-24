import { db } from '../../db.js';
import { assistbuildCredentials } from '../../../../shared/schema.js';
import { eq, and } from 'drizzle-orm';
import { encryptCredential, decryptCredential } from '../../../../packages/execution/security.js';

/**
 * CredentialService
 * Manages encrypted credentials for workflows
 */
export class CredentialService {
    /**
     * Create a new credential
     */
    static async create(tenantId: string, data: { name: string; type: string; data: any }) {
        const encryptedData = encryptCredential(data.data);

        const [credential] = await db.insert(assistbuildCredentials).values({
            tenantId,
            name: data.name,
            type: data.type,
            encryptedData,
        }).returning();

        return credential;
    }

    /**
     * List credentials for a tenant
     */
    static async list(tenantId: string, type?: string) {
        const filters = [eq(assistbuildCredentials.tenantId, tenantId)];
        if (type) {
            filters.push(eq(assistbuildCredentials.type, type));
        }

        const credentials = await db.select({
            id: assistbuildCredentials.id,
            name: assistbuildCredentials.name,
            type: assistbuildCredentials.type,
            createdAt: assistbuildCredentials.createdAt,
            updatedAt: assistbuildCredentials.updatedAt,
        })
            .from(assistbuildCredentials)
            .where(and(...filters));

        return credentials;
    }

    /**
     * Get a specific credential (decrypted)
     */
    static async getDecrypted(id: string, tenantId: string) {
        const [credential] = await db.select()
            .from(assistbuildCredentials)
            .where(
                and(
                    eq(assistbuildCredentials.id, id),
                    eq(assistbuildCredentials.tenantId, tenantId)
                )
            )
            .limit(1);

        if (!credential) return null;

        const decryptedData = decryptCredential(credential.encryptedData);
        return {
            ...credential,
            data: decryptedData
        };
    }

    /**
     * Get a specific credential (metadata only)
     */
    static async get(id: string, tenantId: string) {
        const [credential] = await db.select({
            id: assistbuildCredentials.id,
            name: assistbuildCredentials.name,
            type: assistbuildCredentials.type,
            createdAt: assistbuildCredentials.createdAt,
            updatedAt: assistbuildCredentials.updatedAt,
        })
            .from(assistbuildCredentials)
            .where(
                and(
                    eq(assistbuildCredentials.id, id),
                    eq(assistbuildCredentials.tenantId, tenantId)
                )
            )
            .limit(1);

        return credential || null;
    }

    /**
     * Delete a credential
     */
    static async delete(id: string, tenantId: string) {
        const [result] = await db.delete(assistbuildCredentials)
            .where(
                and(
                    eq(assistbuildCredentials.id, id),
                    eq(assistbuildCredentials.tenantId, tenantId)
                )
            )
            .returning();

        return result || null;
    }
}
