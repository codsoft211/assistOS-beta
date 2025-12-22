/**
 * Universal Search Service
 * 
 * Semantic search across all modules and data sources.
 * Provides unified search interface for the entire platform.
 */

import { db } from '@api/db';
import { ModuleRegistryService } from '@modules/base/module-registry.service';
import { documentEmbeddings, documents } from '@shared/schema';
import { eq, sql, cosineDistance, ilike, or } from 'drizzle-orm';
import { embeddingService } from '@api/services/embedding.service';

export interface SearchResult {
  module: string;
  entity: string;
  id: string;
  title: string;
  description?: string;
  score: number;
  metadata?: any;
  url?: string;
}

export interface SearchOptions {
  modules?: string[];
  entities?: string[];
  limit?: number;
  offset?: number;
}

export interface SemanticSearchResult extends SearchResult {
  distance?: number;
  embeddingSource?: string;
}

/**
 * Universal Search Service
 * 
 * Provides cross-module semantic and textual search
 */
export class UniversalSearchService {
  /**
   * Search across all modules (textual search)
   */
  async search(
    query: string,
    tenantId: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const { modules, entities, limit = 20, offset = 0 } = options;
    const registry = await ModuleRegistryService.getInstance(tenantId);
    const activeModules = modules || registry.list();

    const results: SearchResult[] = [];

    // Search in each module
    for (const moduleId of activeModules) {
      const module = registry.get(moduleId);
      if (!module) continue;

      // Filter entities if specified
      const moduleEntities = entities
        ? module.entities.filter(e => entities.includes(e.name))
        : module.entities;

      // Search in each entity
      for (const entity of moduleEntities) {
        const entityResults = await this.searchEntity(
          moduleId,
          entity.name,
          query,
          tenantId,
          limit
        );
        results.push(...entityResults);
      }
    }

    // Sort by score and apply limit/offset
    return results
      .sort((a, b) => b.score - a.score)
      .slice(offset, offset + limit);
  }

  /**
   * Semantic search using embeddings
   */
  async semanticSearch(
    query: string,
    tenantId: string,
    options: SearchOptions = {}
  ): Promise<SemanticSearchResult[]> {
    const { limit = 20, offset = 0 } = options;

    // 1. Generate embedding for query
    const queryEmbedding = await embeddingService.generateEmbedding(query);

    // 2. Search in document_embeddings using cosine distance with join to documents table
    // Convert queryEmbedding array to vector format for pgvector
    const queryEmbeddingVector = sql`${JSON.stringify(queryEmbedding)}::vector`;
    
    const semanticResults = await db
      .select({
        id: documentEmbeddings.id,
        documentId: documentEmbeddings.documentId,
        tenantId: documentEmbeddings.tenantId,
        embeddingSource: documentEmbeddings.embeddingSource,
        similarity: sql<number>`1 - (${cosineDistance(documentEmbeddings.embedding, queryEmbeddingVector)})`,
        // Join with documents table
        documentTitle: documents.title,
        documentFilename: documents.filename,
        documentDescription: documents.description,
        documentType: documents.documentType,
      })
      .from(documentEmbeddings)
      .leftJoin(documents, eq(documentEmbeddings.documentId, documents.id))
      .where(eq(documentEmbeddings.tenantId, tenantId))
      .orderBy(sql`${documentEmbeddings.embedding} <=> ${queryEmbeddingVector}`)
      .limit(limit)
      .offset(offset);

    // 3. Map results with document details
    return semanticResults.map((result) => ({
      module: 'document-management',
      entity: 'document',
      id: result.documentId,
      title: result.documentTitle || result.documentFilename || 'Document',
      description: result.documentDescription || undefined,
      score: result.similarity || 0,
      metadata: {
        filename: result.documentFilename,
        documentType: result.documentType,
        embeddingSource: result.embeddingSource,
      },
      distance: 1 - (result.similarity || 0),
      embeddingSource: result.embeddingSource,
    }));
  }

  /**
   * Intelligent search (combines textual and semantic)
   */
  async intelligentSearch(
    query: string,
    tenantId: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    // Combine textual and semantic search
    const [textualResults, semanticResults] = await Promise.all([
      this.search(query, tenantId, { ...options, limit: options.limit || 10 }),
      this.semanticSearch(query, tenantId, { ...options, limit: options.limit || 10 }),
    ]);

    // Merge and deduplicate results
    const merged = new Map<string, SearchResult>();

    // Add textual results
    for (const result of textualResults) {
      const key = `${result.module}:${result.entity}:${result.id}`;
      if (!merged.has(key)) {
        merged.set(key, result);
      }
    }

    // Add semantic results (may override textual with better score)
    for (const result of semanticResults) {
      const key = `${result.module}:${result.entity}:${result.id}`;
      const existing = merged.get(key);
      if (!existing || result.score > existing.score) {
        merged.set(key, result);
      }
    }

    // Sort by score
    return Array.from(merged.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, options.limit || 20);
  }

  /**
   * Search in a specific entity (textual search)
   * 
   * Uses ModuleDataInterface to query entities from modules.
   * Falls back to basic text matching if module doesn't support search.
   */
  private async searchEntity(
    moduleId: string,
    entityName: string,
    query: string,
    tenantId: string,
    limit: number
  ): Promise<SearchResult[]> {
    try {
      const registry = await ModuleRegistryService.getInstance(tenantId);
      const module = registry.get(moduleId);
      
      if (!module) {
        return [];
      }

      // Try to use module's data interface for search
      const dataInterface = module.exposeData();
      if (!dataInterface) {
        return [];
      }

      // Build search query using module's query builder
      // Search in fields that might contain the query text
      const searchFilters = [
        { field: 'name', operator: 'ilike' as const, value: `%${query}%` },
        { field: 'title', operator: 'ilike' as const, value: `%${query}%` },
        { field: 'description', operator: 'ilike' as const, value: `%${query}%` },
      ];

      // Try to list entities with search filters
      const entities = await dataInterface.listEntities(entityName, searchFilters);

      // Map to SearchResult format
      return entities.slice(0, limit).map((entity: any) => {
        // Try to extract title and description from entity
        const title = entity.name || entity.title || entity.filename || `${entityName} ${entity.id}`;
        const description = entity.description || entity.notes || undefined;

        // Calculate basic relevance score (simplified)
        const titleMatch = title.toLowerCase().includes(query.toLowerCase()) ? 0.8 : 0.5;
        const descriptionMatch = description?.toLowerCase().includes(query.toLowerCase()) ? 0.3 : 0;
        const score = titleMatch + descriptionMatch;

        return {
          module: moduleId,
          entity: entityName,
          id: entity.id,
          title: String(title),
          description: description ? String(description) : undefined,
          score,
          metadata: {
            ...entity,
            _moduleSource: moduleId,
          },
        };
      });
    } catch (error) {
      // If module doesn't support search or query fails, return empty
      console.warn(`[UniversalSearch] Error searching entity ${entityName} in module ${moduleId}:`, error);
      return [];
    }
  }
}

// Export singleton instance
export const universalSearchService = new UniversalSearchService();

