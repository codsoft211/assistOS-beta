// Migrated from AssistOS legacy - Phase 2
// Extended with pgvector semantic search support (Sprint 1)
// Task 1.3: Extended with entity embeddings (suppliers, invoices, projects)
// Task 2.2.7.4: Added environment isolation to semantic search
import OpenAI from "openai";
import { db } from "../db";
import { 
  documentEmbeddings, 
  supplierEmbeddings, 
  invoiceEmbeddings, 
  projectEmbeddings,
  clientEmbeddings,
  productEmbeddings,
  suppliers,
  purchasingInvoices,
  projects,
  clients,
  products
} from "../../../shared/schema";
import { cosineDistance, desc, sql } from "drizzle-orm";
import { eq, and } from "drizzle-orm";
import { scopedFilter, withEnvironment } from "../utils/environment-query.utils";
import type { Environment } from "../../../shared/types/environment";

// Lazy-load OpenAI client to allow server to start without API key
let _openaiClient: OpenAI | null = null;
const openai = new Proxy({} as OpenAI, {
  get(target, prop) {
    if (!_openaiClient) {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error(
          'OpenAI API key is not configured. Please set OPENAI_API_KEY environment variable to use embedding service.'
        );
      }
      _openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    }
    return (_openaiClient as any)[prop];
  }
});

export interface SemanticSearchResult {
  id: string;
  documentId: string;
  embeddingSource: string;
  similarity: number;
  createdAt: Date;
}

export class EmbeddingService {
  /**
   * Gera embedding para texto usando text-embedding-3-small
   * Custo: ~$0.00002 per 1K tokens (muito barato!)
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
        dimensions: 1536,
      });
      
      return response.data[0].embedding;
    } catch (error) {
      console.error("[Embedding Service] Error generating embedding:", error);
      throw error;
    }
  }
  
  /**
   * Gera embeddings em batch (mais eficiente)
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: texts,
        dimensions: 1536,
      });
      
      return response.data.map(item => item.embedding);
    } catch (error) {
      console.error("[Embedding Service] Error generating embeddings:", error);
      throw error;
    }
  }
  
  /**
   * Calcula cosine similarity entre dois vetores (client-side)
   * Nota: Para queries use semanticSearch() que usa pgvector nativo
   * 
   * @returns Similarity score [-1, 1] onde 1 = idênticos, 0 = ortogonais, -1 = opostos
   * Returns 0 if either vector is zero (no direction)
   */
  cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    // Handle zero vectors (prevent division by zero)
    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    if (magnitude === 0) {
      return 0; // Zero vector has no direction
    }
    
    return dotProduct / magnitude;
  }
  
  /**
   * Semantic search usando pgvector (SPRINT 1 - PRODUCTION)
   * Usa cosine similarity nativo do pgvector (operador <=>)
   * 
   * @param query - Texto de pesquisa
   * @param tenantId - Tenant ID para filtrar resultados
   * @param environment - Environment (production/sandbox)
   * @param options - Opções de pesquisa
   * @returns Resultados ordenados por similaridade (maior = mais similar)
   */
  async semanticSearch(
    query: string,
    tenantId: string,
    environment: Environment,
    options: {
      limit?: number;
      minSimilarity?: number;
      embeddingSource?: string;
    } = {}
  ): Promise<SemanticSearchResult[]> {
    const { limit = 10, minSimilarity = 0.5, embeddingSource } = options;
    
    try {
      // 1. Gerar embedding da query
      const queryEmbedding = await this.generateEmbedding(query);
      
      // 2. Calcular similarity usando pgvector (1 - cosineDistance = similarity)
      const similarity = sql<number>`1 - (${cosineDistance(documentEmbeddings.embedding, queryEmbedding)})`;
      
      // 3. Query com filtros (ENVIRONMENT-SCOPED)
      let queryBuilder = db
        .select({
          id: documentEmbeddings.id,
          documentId: documentEmbeddings.documentId,
          embeddingSource: documentEmbeddings.embeddingSource,
          similarity,
          createdAt: documentEmbeddings.createdAt,
        })
        .from(documentEmbeddings)
        .where(scopedFilter(documentEmbeddings, tenantId, environment))
        .$dynamic();
      
      // Adicionar filtro de similaridade mínima
      if (minSimilarity > 0) {
        queryBuilder = queryBuilder.where(sql`${similarity} > ${minSimilarity}`);
      }
      
      // Adicionar filtro de embedding source
      if (embeddingSource) {
        queryBuilder = queryBuilder.where(eq(documentEmbeddings.embeddingSource, embeddingSource));
      }
      
      // 4. Ordenar por similarity e limitar
      const results = await queryBuilder
        .orderBy(desc(similarity))
        .limit(limit);
      
      return results;
    } catch (error) {
      console.error("[Embedding Service] Error in semantic search:", error);
      throw error;
    }
  }
  
  /**
   * Busca documentos similares a um documento existente
   * SECURITY: Filtra por tenantId e environment para prevenir cross-environment data leaks
   */
  async findSimilarDocuments(
    documentId: string,
    tenantId: string,
    environment: Environment,
    options: { limit?: number; minSimilarity?: number } = {}
  ): Promise<SemanticSearchResult[]> {
    const { limit = 10, minSimilarity = 0.5 } = options;
    
    try {
      // 1. Obter embedding do documento de referência (COM FILTRO DE TENANT + ENVIRONMENT!)
      const [refEmbedding] = await db
        .select({ embedding: documentEmbeddings.embedding })
        .from(documentEmbeddings)
        .where(and(
          eq(documentEmbeddings.documentId, documentId),
          scopedFilter(documentEmbeddings, tenantId, environment)
        ))
        .limit(1);
      
      if (!refEmbedding) {
        throw new Error(`No embedding found for document ${documentId}`);
      }
      
      // 2. Buscar documentos similares (ENVIRONMENT-SCOPED)
      const similarity = sql<number>`1 - (${cosineDistance(documentEmbeddings.embedding, refEmbedding.embedding)})`;
      
      const results = await db
        .select({
          id: documentEmbeddings.id,
          documentId: documentEmbeddings.documentId,
          embeddingSource: documentEmbeddings.embeddingSource,
          similarity,
          createdAt: documentEmbeddings.createdAt,
        })
        .from(documentEmbeddings)
        .where(and(
          scopedFilter(documentEmbeddings, tenantId, environment),
          sql`${similarity} > ${minSimilarity}`,
          sql`${documentEmbeddings.documentId} != ${documentId}`
        ))
        .orderBy(desc(similarity))
        .limit(limit);
      
      return results;
    } catch (error) {
      console.error("[Embedding Service] Error finding similar documents:", error);
      throw error;
    }
  }
  
  // ============================================================================
  // SPRINT 1 - TASK 1.3: Entity Embeddings (Suppliers, Invoices, Projects)
  // ============================================================================
  
  /**
   * Genera embedding para supplier e armazena no banco
   * Combina: name, legalName, category, type, contactInfo
   */
  async generateSupplierEmbedding(
    supplierId: string,
    tenantId: string,
    environment: Environment
  ): Promise<void> {
    try {
      // 1. Buscar supplier data (ENVIRONMENT-SCOPED)
      const [supplier] = await db
        .select()
        .from(suppliers)
        .where(and(
          eq(suppliers.id, supplierId),
          scopedFilter(suppliers, tenantId, environment)
        ))
        .limit(1);
      
      if (!supplier) {
        throw new Error(`Supplier ${supplierId} not found in ${environment}`);
      }
      
      // 2. Criar texto descritivo combinado
      const combinedText = [
        supplier.name,
        supplier.legalName,
        supplier.brand,
        supplier.category,
        supplier.type,
        supplier.address,
        supplier.email,
        supplier.phone,
        supplier.paymentTerms,
        supplier.deliveryTerms
      ].filter(Boolean).join(' | ');
      
      // 3. Gerar embedding
      const embedding = await this.generateEmbedding(combinedText);
      
      // 4. Armazenar no banco (upsert) WITH ENVIRONMENT
      const embeddingData = withEnvironment({
        supplierId,
        tenantId,
        embedding,
        embeddingSource: 'combined'
      }, environment);
      
      await db.insert(supplierEmbeddings).values(embeddingData).onConflictDoUpdate({
        target: [supplierEmbeddings.supplierId, supplierEmbeddings.tenantId, supplierEmbeddings.embeddingSource, supplierEmbeddings.environment],
        set: {
          embedding,
          updatedAt: sql`NOW()`
        }
      });
      
      console.log(`[Embedding Service] ✅ Generated embedding for supplier ${supplierId} (${environment})`);
    } catch (error) {
      console.error(`[Embedding Service] Error generating supplier embedding:`, error);
      throw error;
    }
  }
  
  /**
   * Genera embedding para invoice e armazena no banco
   * Combina: invoiceNumber, supplierName, lineItems, OCR data
   */
  async generateInvoiceEmbedding(
    invoiceId: string,
    tenantId: string,
    environment: Environment
  ): Promise<void> {
    try {
      // 1. Buscar invoice data com supplier info (ENVIRONMENT-SCOPED)
      const [invoice] = await db
        .select({
          invoice: purchasingInvoices,
          supplierName: suppliers.name
        })
        .from(purchasingInvoices)
        .leftJoin(suppliers, eq(purchasingInvoices.supplierId, suppliers.id))
        .where(and(
          eq(purchasingInvoices.id, invoiceId),
          scopedFilter(purchasingInvoices, tenantId, environment)
        ))
        .limit(1);
      
      if (!invoice) {
        throw new Error(`Invoice ${invoiceId} not found in ${environment}`);
      }
      
      // 2. Criar texto descritivo
      const combinedText = [
        `Invoice ${invoice.invoice.invoiceNumber}`,
        `Supplier: ${invoice.supplierName}`,
        `Amount: ${invoice.invoice.totalAmount} ${invoice.invoice.currency}`,
        `Date: ${invoice.invoice.invoiceDate}`,
        `Status: ${invoice.invoice.status}`,
        invoice.invoice.paymentTerms,
        // OCR data se disponível
        invoice.invoice.ocrData ? JSON.stringify(invoice.invoice.ocrData) : null
      ].filter(Boolean).join(' | ');
      
      // 3. Gerar embedding
      const embedding = await this.generateEmbedding(combinedText);
      
      // 4. Armazenar no banco (upsert) WITH ENVIRONMENT
      const embeddingData = withEnvironment({
        invoiceId,
        tenantId,
        embedding,
        embeddingSource: 'combined'
      }, environment);
      
      await db.insert(invoiceEmbeddings).values(embeddingData).onConflictDoUpdate({
        target: [invoiceEmbeddings.invoiceId, invoiceEmbeddings.tenantId, invoiceEmbeddings.embeddingSource, invoiceEmbeddings.environment],
        set: {
          embedding,
          updatedAt: sql`NOW()`
        }
      });
      
      console.log(`[Embedding Service] ✅ Generated embedding for invoice ${invoiceId} (${environment})`);
    } catch (error) {
      console.error(`[Embedding Service] Error generating invoice embedding:`, error);
      throw error;
    }
  }
  
  /**
   * Genera embedding para project e armazena no banco
   * Combina: name, description, clientInfo, notes
   */
  async generateProjectEmbedding(
    projectId: string,
    tenantId: string,
    environment: Environment
  ): Promise<void> {
    try {
      // 1. Buscar project data (ENVIRONMENT-SCOPED)
      const [project] = await db
        .select()
        .from(projects)
        .where(and(
          eq(projects.id, projectId),
          scopedFilter(projects, tenantId, environment)
        ))
        .limit(1);
      
      if (!project) {
        throw new Error(`Project ${projectId} not found in ${environment}`);
      }
      
      // 2. Criar texto descritivo
      const combinedText = [
        `Project: ${project.name}`,
        project.description,
        `Code: ${project.projectCode}`,
        `Client: ${project.clientName}`,
        `Status: ${project.status}`,
        `Type: ${project.projectType}`,
        `Priority: ${project.priority}`,
        project.notes,
        project.tags
      ].filter(Boolean).join(' | ');
      
      // 3. Gerar embedding
      const embedding = await this.generateEmbedding(combinedText);
      
      // 4. Armazenar no banco (upsert) WITH ENVIRONMENT
      const embeddingData = withEnvironment({
        projectId,
        tenantId,
        embedding,
        embeddingSource: 'combined'
      }, environment);
      
      await db.insert(projectEmbeddings).values(embeddingData).onConflictDoUpdate({
        target: [projectEmbeddings.projectId, projectEmbeddings.tenantId, projectEmbeddings.embeddingSource, projectEmbeddings.environment],
        set: {
          embedding,
          updatedAt: sql`NOW()`
        }
      });
      
      console.log(`[Embedding Service] ✅ Generated embedding for project ${projectId} (${environment})`);
    } catch (error) {
      console.error(`[Embedding Service] Error generating project embedding:`, error);
      throw error;
    }
  }
  
  /**
   * Batch generate embeddings para todos suppliers de um tenant (ENVIRONMENT-SCOPED)
   */
  async batchGenerateSupplierEmbeddings(tenantId: string, environment: Environment): Promise<number> {
    try {
      const allSuppliers = await db
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(scopedFilter(suppliers, tenantId, environment));
      
      console.log(`[Embedding Service] 🚀 Batch generating ${allSuppliers.length} supplier embeddings (${environment})`);
      
      let successCount = 0;
      for (const supplier of allSuppliers) {
        try {
          await this.generateSupplierEmbedding(supplier.id, tenantId, environment);
          successCount++;
        } catch (error) {
          console.error(`[Embedding Service] Failed to generate embedding for supplier ${supplier.id}:`, error);
        }
      }
      
      console.log(`[Embedding Service] ✅ Batch complete: ${successCount}/${allSuppliers.length} successful (${environment})`);
      return successCount;
    } catch (error) {
      console.error(`[Embedding Service] Error in batch generation:`, error);
      throw error;
    }
  }
  
  /**
   * Batch generate embeddings para todos invoices de um tenant (ENVIRONMENT-SCOPED)
   */
  async batchGenerateInvoiceEmbeddings(tenantId: string, environment: Environment): Promise<number> {
    try {
      const allInvoices = await db
        .select({ id: purchasingInvoices.id })
        .from(purchasingInvoices)
        .where(scopedFilter(purchasingInvoices, tenantId, environment));
      
      console.log(`[Embedding Service] 🚀 Batch generating ${allInvoices.length} invoice embeddings (${environment})`);
      
      let successCount = 0;
      for (const invoice of allInvoices) {
        try {
          await this.generateInvoiceEmbedding(invoice.id, tenantId, environment);
          successCount++;
        } catch (error) {
          console.error(`[Embedding Service] Failed to generate embedding for invoice ${invoice.id}:`, error);
        }
      }
      
      console.log(`[Embedding Service] ✅ Batch complete: ${successCount}/${allInvoices.length} successful (${environment})`);
      return successCount;
    } catch (error) {
      console.error(`[Embedding Service] Error in batch generation:`, error);
      throw error;
    }
  }
  
  /**
   * Batch generate embeddings para todos projects de um tenant (ENVIRONMENT-SCOPED)
   */
  async batchGenerateProjectEmbeddings(tenantId: string, environment: Environment): Promise<number> {
    try {
      const allProjects = await db
        .select({ id: projects.id })
        .from(projects)
        .where(scopedFilter(projects, tenantId, environment));
      
      console.log(`[Embedding Service] 🚀 Batch generating ${allProjects.length} project embeddings (${environment})`);
      
      let successCount = 0;
      for (const project of allProjects) {
        try {
          await this.generateProjectEmbedding(project.id, tenantId, environment);
          successCount++;
        } catch (error) {
          console.error(`[Embedding Service] Failed to generate embedding for project ${project.id}:`, error);
        }
      }
      
      console.log(`[Embedding Service] ✅ Batch complete: ${successCount}/${allProjects.length} successful (${environment})`);
      return successCount;
    } catch (error) {
      console.error(`[Embedding Service] Error in batch generation:`, error);
      throw error;
    }
  }
  
  // ============================================================================
  // SPRINT 1 - GAP CRÍTICO 1: Client/Product Embeddings
  // ============================================================================
  
  /**
   * Genera embedding para client e armazena no banco
   * Combina: name, legalName, brand, email, phone, address, city, country
   */
  async generateClientEmbedding(
    clientId: string,
    tenantId: string,
    environment: Environment
  ): Promise<void> {
    try {
      // 1. Buscar client data (ENVIRONMENT-SCOPED)
      const [client] = await db
        .select()
        .from(clients)
        .where(and(
          eq(clients.id, clientId),
          scopedFilter(clients, tenantId, environment)
        ))
        .limit(1);
      
      if (!client) {
        throw new Error(`Client ${clientId} not found in ${environment}`);
      }
      
      // 2. Criar texto descritivo combinado
      const combinedText = [
        client.name,
        client.legalName,
        client.brand,
        client.company,
        client.email,
        client.phone,
        client.nif,
        client.address,
        client.city,
        client.postalCode,
        client.country,
        client.district,
        client.website,
        client.status
      ].filter(Boolean).join(' | ');
      
      // 3. Gerar embedding
      const embedding = await this.generateEmbedding(combinedText);
      
      // 4. Armazenar no banco (upsert) WITH ENVIRONMENT
      const embeddingData = withEnvironment({
        clientId,
        tenantId,
        embedding,
        embeddingSource: 'combined'
      }, environment);
      
      await db.insert(clientEmbeddings).values(embeddingData).onConflictDoUpdate({
        target: [clientEmbeddings.clientId, clientEmbeddings.tenantId, clientEmbeddings.embeddingSource, clientEmbeddings.environment],
        set: {
          embedding,
          updatedAt: sql`NOW()`
        }
      });
      
      console.log(`[Embedding Service] ✅ Generated embedding for client ${clientId} (${environment})`);
    } catch (error) {
      console.error(`[Embedding Service] Error generating client embedding:`, error);
      throw error;
    }
  }
  
  /**
   * Genera embedding para product e armazena no banco
   * Combina: code, name, description, category, barcode, conservacao, embalagem
   */
  async generateProductEmbedding(
    productId: string,
    tenantId: string,
    environment: Environment
  ): Promise<void> {
    try {
      // 1. Buscar product data (ENVIRONMENT-SCOPED)
      const [product] = await db
        .select()
        .from(products)
        .where(and(
          eq(products.id, productId),
          scopedFilter(products, tenantId, environment)
        ))
        .limit(1);
      
      if (!product) {
        throw new Error(`Product ${productId} not found in ${environment}`);
      }
      
      // 2. Criar texto descritivo combinado
      const combinedText = [
        product.code,
        product.name,
        product.description,
        product.category,
        product.barcode,
        product.unidFaturacao,
        product.conservacao,
        product.unidVenda,
        product.embalagem,
        `Status: ${product.isActive ? 'Active' : 'Inactive'}`,
        `Stock: ${product.stock}`
      ].filter(Boolean).join(' | ');
      
      // 3. Gerar embedding
      const embedding = await this.generateEmbedding(combinedText);
      
      // 4. Armazenar no banco (upsert) WITH ENVIRONMENT
      const embeddingData = withEnvironment({
        productId,
        tenantId,
        embedding,
        embeddingSource: 'combined'
      }, environment);
      
      await db.insert(productEmbeddings).values(embeddingData).onConflictDoUpdate({
        target: [productEmbeddings.productId, productEmbeddings.tenantId, productEmbeddings.embeddingSource, productEmbeddings.environment],
        set: {
          embedding,
          updatedAt: sql`NOW()`
        }
      });
      
      console.log(`[Embedding Service] ✅ Generated embedding for product ${productId} (${environment})`);
    } catch (error) {
      console.error(`[Embedding Service] Error generating product embedding:`, error);
      throw error;
    }
  }
  
  /**
   * Batch generate embeddings para todos clients de um tenant (ENVIRONMENT-SCOPED)
   */
  async batchGenerateClientEmbeddings(tenantId: string, environment: Environment): Promise<number> {
    try {
      const allClients = await db
        .select({ id: clients.id })
        .from(clients)
        .where(scopedFilter(clients, tenantId, environment));
      
      console.log(`[Embedding Service] 🚀 Batch generating ${allClients.length} client embeddings (${environment})`);
      
      let successCount = 0;
      for (const client of allClients) {
        try {
          await this.generateClientEmbedding(client.id, tenantId, environment);
          successCount++;
        } catch (error) {
          console.error(`[Embedding Service] Failed to generate embedding for client ${client.id}:`, error);
        }
      }
      
      console.log(`[Embedding Service] ✅ Batch complete: ${successCount}/${allClients.length} successful (${environment})`);
      return successCount;
    } catch (error) {
      console.error(`[Embedding Service] Error in batch generation:`, error);
      throw error;
    }
  }
  
  /**
   * Batch generate embeddings para todos products de um tenant (ENVIRONMENT-SCOPED)
   */
  async batchGenerateProductEmbeddings(tenantId: string, environment: Environment): Promise<number> {
    try {
      const allProducts = await db
        .select({ id: products.id })
        .from(products)
        .where(scopedFilter(products, tenantId, environment));
      
      console.log(`[Embedding Service] 🚀 Batch generating ${allProducts.length} product embeddings (${environment})`);
      
      let successCount = 0;
      for (const product of allProducts) {
        try {
          await this.generateProductEmbedding(product.id, tenantId, environment);
          successCount++;
        } catch (error) {
          console.error(`[Embedding Service] Failed to generate embedding for product ${product.id}:`, error);
        }
      }
      
      console.log(`[Embedding Service] ✅ Batch complete: ${successCount}/${allProducts.length} successful (${environment})`);
      return successCount;
    } catch (error) {
      console.error(`[Embedding Service] Error in batch generation:`, error);
      throw error;
    }
  }
}

export const embeddingService = new EmbeddingService();
