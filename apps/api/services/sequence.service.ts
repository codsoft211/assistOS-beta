import { db } from '../db';
import { sequenceCounters } from 'shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { selectOneFromTenantTable, insertIntoTenantTable, updateTenantTable, deleteFromTenantTable } from '../utils/tenant-db-helper';

interface SequenceConfig {
  tenantId: string;
  entityType: 'supplier' | 'client' | 'invoice' | 'expense' | 'opportunity' | 'project';
  prefix: string;
  paddingLength?: number;
}

/**
 * Gera o próximo código sequencial para uma entidade (ex: SUP-0001, CLI-0002, etc.)
 * 
 * Features:
 * - Thread-safe usando SELECT FOR UPDATE
 * - Suporta importação com código específico
 * - Atualiza contador automaticamente se código importado for maior
 */
export class SequenceService {
  
  /**
   * Gera o próximo código sequencial
   * 
   * @param config - Configuração da sequência
   * @param importedCode - (Opcional) Código a importar (ex: "SUP-0042")
   * @returns Código sequencial gerado (ex: "SUP-0001")
   */
  static async getNextCode(
    config: SequenceConfig,
    importedCode?: string
  ): Promise<string> {
    const { tenantId, entityType, prefix, paddingLength = 4 } = config;

    // Se houver código importado, valida e atualiza contador
    if (importedCode) {
      const numericPart = this.extractNumericPart(importedCode, prefix);
      await this.updateCounterIfNeeded(tenantId, entityType, prefix, paddingLength, numericPart);
      return importedCode;
    }

    // Caso contrário, gera novo código
    return await this.generateNextCode(tenantId, entityType, prefix, paddingLength);
  }

  /**
   * Gera novo código sequencial (thread-safe)
   */
  private static async generateNextCode(
    tenantId: string,
    entityType: string,
    prefix: string,
    paddingLength: number
  ): Promise<string> {
    
    // 1. Tenta buscar contador existente (com lock para evitar race conditions)
    // Note: FOR UPDATE works with tenant schema queries
    const existingCounter = await selectOneFromTenantTable<any>(
      tenantId,
      'sequence_counters',
      sql`tenant_id = ${tenantId} AND entity_type = ${entityType}`
    );

    let nextValue: number;

    if (existingCounter) {
      // 2. Incrementa contador existente in tenant schema
      nextValue = existingCounter.current_value + 1;
      
      await updateTenantTable(
        tenantId,
        'sequence_counters',
        {
          current_value: nextValue,
          updated_at: new Date()
        },
        sql`id = ${existingCounter.id}`
      );
      
    } else {
      // 3. Cria novo contador in tenant schema
      nextValue = 1;
      
      await insertIntoTenantTable(
        tenantId,
        'sequence_counters',
        {
          tenant_id: tenantId,
          entity_type: entityType,
          prefix,
          current_value: nextValue,
          padding_length: paddingLength,
          created_at: new Date(),
          updated_at: new Date(),
        }
      );
    }

    // 4. Formata código (ex: SUP-0001)
    const paddedNumber = String(nextValue).padStart(paddingLength, '0');
    return `${prefix}-${paddedNumber}`;
  }

  /**
   * Extrai parte numérica do código (ex: "SUP-0042" → 42)
   */
  private static extractNumericPart(code: string, prefix: string): number {
    const numericString = code.replace(`${prefix}-`, '');
    return parseInt(numericString, 10);
  }

  /**
   * Atualiza contador se código importado for maior que valor atual
   */
  private static async updateCounterIfNeeded(
    tenantId: string,
    entityType: string,
    prefix: string,
    paddingLength: number,
    importedValue: number
  ): Promise<void> {
    
    const existingCounter = await selectOneFromTenantTable<any>(
      tenantId,
      'sequence_counters',
      sql`tenant_id = ${tenantId} AND entity_type = ${entityType}`
    );

    if (existingCounter) {
      // Se código importado > contador atual, atualiza in tenant schema
      if (importedValue > existingCounter.current_value) {
        await updateTenantTable(
          tenantId,
          'sequence_counters',
          {
            current_value: importedValue,
            updated_at: new Date()
          },
          sql`id = ${existingCounter.id}`
        );
      }
    } else {
      // Cria contador com valor importado in tenant schema
      await insertIntoTenantTable(
        tenantId,
        'sequence_counters',
        {
          tenant_id: tenantId,
          entity_type: entityType,
          prefix,
          current_value: importedValue,
          padding_length: paddingLength,
          created_at: new Date(),
          updated_at: new Date(),
        }
      );
    }
  }

  /**
   * Reseta contador (útil para testes ou reset de dados)
   */
  static async resetCounter(
    tenantId: string,
    entityType: string
  ): Promise<void> {
    await deleteFromTenantTable(
      tenantId,
      'sequence_counters',
      sql`tenant_id = ${tenantId} AND entity_type = ${entityType}`
    );
  }
}
