import { db } from '../../../../apps/api/db';
import { suppliers } from '../../../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { SequenceService } from '../../../../apps/api/services/sequence.service';
import type { ExtractedDocumentData } from '../../document-processing/types';
import { scopedFilter, withEnvironment } from '../../../../apps/api/utils/environment-query.utils';
import type { Environment } from '../../../../shared/types/environment';

interface SupplierSyncResult {
  supplierId: string;
  wasCreated: boolean;
}

/**
 * Supplier Sync Service
 * 
 * Implementa lógica NIF-first para criar/atualizar fornecedores automaticamente via OCR.
 * 
 * Fluxo:
 * 1. Valida que NIF (taxId) existe nos dados extraídos
 * 2. Procura fornecedor existente por NIF + tenantId
 * 3. Se encontrado: atualiza campos não-nulos
 * 4. Se não encontrado: cria novo com code auto-gerado
 * 
 * Business Rules:
 * - NIF é OBRIGATÓRIO (lança erro se ausente)
 * - Code é AUTO-GERADO via SequenceService para novos fornecedores
 * - Apenas campos não-nulos são atualizados
 * - NIF é único por tenant (constraint na BD)
 */
export class SupplierSyncService {
  
  /**
   * Sincroniza fornecedor a partir de dados extraídos por OCR
   * 
   * @param tenantId - ID do tenant
   * @param environment - Environment (production/sandbox)
   * @param extractedData - Dados extraídos do documento (issuer* fields)
   * @returns Informação do fornecedor criado/atualizado
   * @throws Error se NIF não estiver presente
   */
  static async syncFromOCR(
    tenantId: string,
    environment: Environment,
    extractedData: ExtractedDocumentData
  ): Promise<SupplierSyncResult> {
    
    // 1. Validação OBRIGATÓRIA: NIF deve existir
    if (!extractedData.issuerNIF) {
      throw new Error('NIF (Tax ID) is required to sync supplier from OCR data');
    }

    const taxId = extractedData.issuerNIF;

    // 2. Procura fornecedor existente por NIF + tenantId + environment
    const existingSupplier = await db.query.suppliers.findFirst({
      where: and(
        scopedFilter(suppliers, tenantId, environment),
        eq(suppliers.taxId, taxId)
      )
    });

    if (existingSupplier) {
      // 3. Fornecedor existe → UPDATE apenas campos não-nulos
      await this.updateSupplier(existingSupplier.id, tenantId, environment, extractedData);
      
      return {
        supplierId: existingSupplier.id,
        wasCreated: false
      };
    } else {
      // 4. Fornecedor NÃO existe → CREATE com code auto-gerado
      const newSupplierId = await this.createSupplier(tenantId, environment, taxId, extractedData);
      
      return {
        supplierId: newSupplierId,
        wasCreated: true
      };
    }
  }

  /**
   * Cria novo fornecedor com code auto-gerado
   */
  private static async createSupplier(
    tenantId: string,
    environment: Environment,
    taxId: string,
    data: ExtractedDocumentData
  ): Promise<string> {
    
    // 1. Gera código sequencial (ex: SUP-0001)
    const code = await SequenceService.getNextCode({
      tenantId,
      entityType: 'supplier',
      prefix: 'SUP',
      paddingLength: 4
    });

    // 2. Prepara dados para inserção (apenas campos não-nulos)
    const supplierData: any = {
      tenantId,
      code,
      taxId,
      name: data.issuer || 'Supplier (from OCR)', // Nome obrigatório
      isActive: true
    };

    // Campos opcionais (apenas se não-nulos)
    if (data.issuerAddress) supplierData.address = data.issuerAddress;
    if (data.issuerCity) supplierData.city = data.issuerCity;
    if (data.issuerPostalCode) supplierData.postalCode = data.issuerPostalCode;
    if (data.issuerCountry) supplierData.country = data.issuerCountry;
    if (data.issuerEmail) supplierData.email = data.issuerEmail;
    if (data.issuerPhone) supplierData.phone = data.issuerPhone;
    if (data.issuerWebsite) supplierData.website = data.issuerWebsite;
    if (data.issuerIban) supplierData.iban = data.issuerIban;

    // 3. Insere novo fornecedor com environment isolation
    const supplierWithEnvironment = withEnvironment(supplierData, environment);
    const [newSupplier] = await db.insert(suppliers).values(supplierWithEnvironment).returning();

    return newSupplier.id;
  }

  /**
   * Atualiza fornecedor existente (apenas campos não-nulos do OCR)
   */
  private static async updateSupplier(
    supplierId: string,
    tenantId: string,
    environment: Environment,
    data: ExtractedDocumentData
  ): Promise<void> {
    
    // Prepara campos para atualização (apenas não-nulos)
    const updateData: any = {
      updatedAt: new Date()
    };

    // Atualiza nome se fornecido
    if (data.issuer) updateData.name = data.issuer;

    // Atualiza campos de contacto (apenas se não-nulos)
    if (data.issuerAddress) updateData.address = data.issuerAddress;
    if (data.issuerCity) updateData.city = data.issuerCity;
    if (data.issuerPostalCode) updateData.postalCode = data.issuerPostalCode;
    if (data.issuerCountry) updateData.country = data.issuerCountry;
    if (data.issuerEmail) updateData.email = data.issuerEmail;
    if (data.issuerPhone) updateData.phone = data.issuerPhone;
    if (data.issuerWebsite) updateData.website = data.issuerWebsite;
    if (data.issuerIban) updateData.iban = data.issuerIban;

    // Atualiza apenas se houver campos para atualizar (além do updatedAt)
    if (Object.keys(updateData).length > 1) {
      await db
        .update(suppliers)
        .set(updateData)
        .where(and(
          eq(suppliers.id, supplierId),
          scopedFilter(suppliers, tenantId, environment)
        ));
    }
  }
}
