/**
 * Tool Embedding Service - AI-powered semantic tool selection
 * 
 * Generates and manages embeddings for AssistME's 153 tools to enable
 * intelligent semantic matching instead of keyword-only filtering.
 * 
 * Features:
 * - Batch embedding generation for all tools
 * - Semantic similarity search using pgvector
 * - Popularity tracking and boosting
 * - Performance monitoring
 */

import { db } from '../../../apps/api/db';
import { toolEmbeddings } from '../../../shared/schema';
import { EmbeddingService } from '../../../apps/api/services/embedding.service';
import { cosineDistance, desc, sql } from 'drizzle-orm';
import { eq, and } from 'drizzle-orm';
import type { ToolManifest } from '../tools/kernel/types';

export interface ToolMatch {
  toolName: string;
  category: string;
  description: string;
  similarity: number;
  popularityScore: number;
  executionCount: number;
  finalScore: number; // Combined score: similarity × log(popularity + 1)
}

export class ToolEmbeddingService {
  private embeddingService: EmbeddingService;

  constructor() {
    this.embeddingService = new EmbeddingService();
  }

  /**
   * Generate embedding for a single tool
   */
  async generateToolEmbedding(manifest: ToolManifest): Promise<number[]> {
    // Combine name, category, and description for rich semantic representation
    const text = `${manifest.name}: ${manifest.description} (category: ${manifest.category})`;
    return await this.embeddingService.generateEmbedding(text);
  }

  /**
   * Generate embeddings for multiple tools in batch (more efficient)
   */
  async generateToolEmbeddingsBatch(manifests: ToolManifest[]): Promise<Map<string, number[]>> {
    const texts = manifests.map(m => 
      `${m.name}: ${m.description} (category: ${m.category})`
    );
    
    const embeddings = await this.embeddingService.generateEmbeddings(texts);
    
    const result = new Map<string, number[]>();
    manifests.forEach((manifest, index) => {
      result.set(manifest.name, embeddings[index]);
    });
    
    return result;
  }

  /**
   * Store tool embedding in database
   */
  async storeToolEmbedding(
    toolName: string,
    category: string,
    description: string,
    embedding: number[],
    metadata?: {
      scope?: 'user' | 'tenant' | 'platform';
      requiresAuth?: boolean;
      estimatedDuration?: number;
      tags?: string[];
    }
  ): Promise<void> {
    try {
      await db.insert(toolEmbeddings).values({
        toolName,
        category,
        description,
        embedding,
        metadata,
      }).onConflictDoUpdate({
        target: toolEmbeddings.toolName,
        set: {
          description,
          embedding,
          metadata,
          updatedAt: new Date(),
        },
      });
      
      console.log(`[ToolEmbeddingService] Stored embedding for tool: ${toolName}`);
    } catch (error) {
      console.error(`[ToolEmbeddingService] Error storing embedding for ${toolName}:`, error);
      throw error;
    }
  }

  /**
   * Find similar tools using semantic search
   * 
   * @param query User's natural language query
   * @param limit Maximum number of tools to return (default: 15)
   * @param minSimilarity Minimum cosine similarity threshold (default: 0.70)
   * @param boostPopularity Whether to boost popular tools in ranking (default: true)
   * @returns Array of matching tools sorted by combined score
   */
  async findSimilarTools(
    query: string,
    limit: number = 15,
    minSimilarity: number = 0.70,
    boostPopularity: boolean = true
  ): Promise<ToolMatch[]> {
    const startTime = Date.now();
    
    try {
      // Generate query embedding
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);
      
      // Semantic search using pgvector cosine distance with HNSW index
      // Using <-> operator directly to trigger HNSW index (crucial for performance)
      // Note: <-> returns distance (0 = identical, 2 = opposite)
      // Convert embedding array to PostgreSQL vector literal: '[x,y,z]'::vector
      const vectorLiteral = `[${queryEmbedding.join(',')}]`;
      
      const results = await db
        .select({
          toolName: toolEmbeddings.toolName,
          category: toolEmbeddings.category,
          description: toolEmbeddings.description,
          popularityScore: toolEmbeddings.popularityScore,
          executionCount: toolEmbeddings.executionCount,
          distance: sql<number>`${toolEmbeddings.embedding} <-> ${vectorLiteral}::vector`,
        })
        .from(toolEmbeddings)
        .orderBy(sql`${toolEmbeddings.embedding} <-> ${vectorLiteral}::vector`)
        .limit(limit * 2); // Get 2x to filter and rank

      // Convert distance to similarity and calculate final scores
      const matches: ToolMatch[] = results
        .map(row => {
          const distance = typeof row.distance === 'number' ? row.distance : 0;
          const similarity = 1 - (distance / 2);
          
          // Skip low similarity matches
          if (similarity < minSimilarity) {
            return null;
          }
          
          // Calculate final score
          // Formula: similarity × log(executionCount + 1)
          // This boosts frequently used tools while preserving semantic ranking
          const popularityBoost = boostPopularity 
            ? Math.log10((row.executionCount || 0) + 1) 
            : 0;
          
          const finalScore = similarity * (1 + popularityBoost * 0.1); // 10% boost per order of magnitude
          
          return {
            toolName: row.toolName,
            category: row.category,
            description: row.description,
            similarity,
            popularityScore: row.popularityScore || 0,
            executionCount: row.executionCount || 0,
            finalScore,
          };
        })
        .filter((m): m is ToolMatch => m !== null)
        .sort((a, b) => b.finalScore - a.finalScore)
        .slice(0, limit);

      const duration = Date.now() - startTime;
      
      console.log(
        `[ToolEmbeddingService] Found ${matches.length} similar tools in ${duration}ms ` +
        `(avg similarity: ${matches.length > 0 ? (matches.reduce((sum, m) => sum + m.similarity, 0) / matches.length).toFixed(3) : 0})`
      );
      
      return matches;
    } catch (error) {
      console.error('[ToolEmbeddingService] Error finding similar tools:', error);
      // Fallback to empty array on error
      return [];
    }
  }

  /**
   * Track tool execution (increment popularity metrics)
   */
  async trackToolExecution(toolName: string): Promise<void> {
    try {
      const result = await db
        .update(toolEmbeddings)
        .set({
          executionCount: sql`${toolEmbeddings.executionCount} + 1`,
          lastUsedAt: new Date(),
          // Recalculate popularity score: log10(executionCount + 1)
          popularityScore: sql`log(${toolEmbeddings.executionCount} + 2)`, // +2 because we just incremented
          updatedAt: new Date(),
        })
        .where(eq(toolEmbeddings.toolName, toolName))
        .returning();
      
      if (result.length === 0) {
        console.warn(`[ToolEmbeddingService] Tool not found in embeddings: ${toolName}`);
      }
    } catch (error) {
      // Don't throw - tracking is non-critical
      console.error(`[ToolEmbeddingService] Error tracking execution for ${toolName}:`, error);
    }
  }

  /**
   * Get tool statistics
   */
  async getToolStats(): Promise<{
    totalTools: number;
    toolsWithExecutions: number;
    totalExecutions: number;
    avgExecutionsPerTool: number;
    topTools: Array<{ toolName: string; executionCount: number; popularityScore: number }>;
  }> {
    const stats = await db
      .select({
        totalTools: sql<number>`COUNT(*)`,
        toolsWithExecutions: sql<number>`COUNT(*) FILTER (WHERE ${toolEmbeddings.executionCount} > 0)`,
        totalExecutions: sql<number>`SUM(${toolEmbeddings.executionCount})`,
      })
      .from(toolEmbeddings);

    const topTools = await db
      .select({
        toolName: toolEmbeddings.toolName,
        executionCount: toolEmbeddings.executionCount,
        popularityScore: toolEmbeddings.popularityScore,
      })
      .from(toolEmbeddings)
      .orderBy(desc(toolEmbeddings.executionCount))
      .limit(10);

    const totalTools = stats[0]?.totalTools || 0;
    const totalExecutions = stats[0]?.totalExecutions || 0;

    return {
      totalTools,
      toolsWithExecutions: stats[0]?.toolsWithExecutions || 0,
      totalExecutions,
      avgExecutionsPerTool: totalTools > 0 ? totalExecutions / totalTools : 0,
      topTools,
    };
  }

  /**
   * Check if embeddings are initialized (for lazy loading)
   */
  async isInitialized(): Promise<boolean> {
    const count = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(toolEmbeddings);
    
    return (count[0]?.count || 0) > 0;
  }
}

// Singleton instance
export const toolEmbeddingService = new ToolEmbeddingService();
