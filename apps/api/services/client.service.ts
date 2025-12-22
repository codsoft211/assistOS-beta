/**
 * Client Service - Example of TenantQueryBuilder Usage
 * 
 * This service demonstrates how to query tenant-scoped tables using
 * TenantQueryBuilder once tables are migrated to tenant schemas.
 * 
 * BEFORE MIGRATION: Tables are in public schema, use Drizzle ORM directly
 * AFTER MIGRATION: Tables are in tenant schemas, use TenantQueryBuilder
 */

import { createTenantQueryBuilder } from '../utils/tenant-query-builder';
import { db } from '../db';
import { clients } from '../../../shared/schema';
import { eq, and, or, ilike, desc, count, sql } from 'drizzle-orm';
import type { Environment } from '../../../shared/types/environment';

export class ClientService {
  /**
   * List clients with filters
   * 
   * ✅ UPDATED: Uses TenantQueryBuilder since clients table is in tenant schema
   */
  async listClients(
    tenantId: string,
    environment: Environment,
    options: {
      search?: string;
      status?: string;
      limit?: number;
      offset?: number;
    } = {}
  ) {
    const { search, status, limit = 50, offset = 0 } = options;

    const queryBuilder = createTenantQueryBuilder(tenantId, environment);
    
    // Build conditions
    const conditions: Record<string, any> = {};
    if (status) {
      conditions.status = status;
    }

    // For search, we need to use raw SQL since TenantQueryBuilder doesn't support ILIKE yet
    // For now, we'll do a simple filter and then filter results
    let clientsList = await queryBuilder.select('clients', conditions, {
      limit: limit * 2, // Get more to account for filtering
      offset,
      orderBy: { column: 'created_at', direction: 'DESC' }
    });

    // Apply search filter if provided
    if (search) {
      const searchLower = search.toLowerCase();
      clientsList = clientsList.filter(client => 
        (client.name && client.name.toLowerCase().includes(searchLower)) ||
        (client.email && client.email.toLowerCase().includes(searchLower)) ||
        (client.company && client.company.toLowerCase().includes(searchLower)) ||
        (client.nif && client.nif.toLowerCase().includes(searchLower))
      );
      // Trim to requested limit
      clientsList = clientsList.slice(0, limit);
    }

    // Get total count
    const total = await queryBuilder.count('clients', conditions);

    return {
      clients: clientsList,
      total,
    };
  }

  /**
   * Get client by ID
   * 
   * ✅ UPDATED: Uses TenantQueryBuilder since clients table is in tenant schema
   */
  async getClientById(
    tenantId: string,
    environment: Environment,
    clientId: string
  ) {
    const queryBuilder = createTenantQueryBuilder(tenantId, environment);
    const results = await queryBuilder.select('clients', { id: clientId });
    return results[0] || null;
  }

  /**
   * Create client
   * 
   * ✅ UPDATED: Uses TenantQueryBuilder since clients table is in tenant schema
   */
  async createClient(
    tenantId: string,
    environment: Environment,
    data: {
      name: string;
      email?: string;
      phone?: string;
      company?: string;
      [key: string]: any;
    }
  ) {
    const queryBuilder = createTenantQueryBuilder(tenantId, environment);
    return await queryBuilder.insert('clients', data);
  }

  /**
   * Update client
   * 
   * ✅ UPDATED: Uses TenantQueryBuilder since clients table is in tenant schema
   */
  async updateClient(
    tenantId: string,
    environment: Environment,
    clientId: string,
    updates: Partial<{
      name: string;
      email: string;
      phone: string;
      company: string;
      status: string;
      [key: string]: any;
    }>
  ) {
    const queryBuilder = createTenantQueryBuilder(tenantId, environment);
    const results = await queryBuilder.update('clients', updates, { id: clientId });
    return results[0] || null;
  }

  /**
   * Delete client
   * 
   * ✅ UPDATED: Uses TenantQueryBuilder since clients table is in tenant schema
   */
  async deleteClient(
    tenantId: string,
    environment: Environment,
    clientId: string
  ) {
    const queryBuilder = createTenantQueryBuilder(tenantId, environment);
    await queryBuilder.delete('clients', { id: clientId });
  }
}

export const clientService = new ClientService();

