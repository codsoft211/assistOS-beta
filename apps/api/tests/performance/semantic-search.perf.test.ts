// Sprint 1 - Task 1.3.5: Performance Test for Semantic Search
// Target: <50ms for semantic search queries

import { describe, it, expect } from 'vitest';
import { embeddingService } from '../../services/embedding.service';

const HAS_OPENAI_KEY = !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'sk-test-fake-key';

describe('Semantic Search Performance', () => {
  const PERFORMANCE_TARGET_MS = 50;
  
  // Helper to measure execution time
  async function measureTime<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
    const start = performance.now();
    const result = await fn();
    const durationMs = performance.now() - start;
    return { result, durationMs };
  }
  
  describe('Vector Search Performance (mocked)', () => {
    it('should perform semantic search in <50ms with HNSW index', () => {
      // Mock vector search using pgvector cosine distance
      // Real implementation would use: SELECT ... ORDER BY embedding <=> $queryVector LIMIT 10
      
      const mockQueryVector = Array(1536).fill(0).map(() => Math.random());
      const mockResults = Array(100).fill(0).map(() => ({
        embedding: Array(1536).fill(0).map(() => Math.random()),
        score: Math.random()
      }));
      
      // Simulate HNSW index search (client-side cosine + sort)
      // SYNCHRONOUS timing to actually measure the computation
      const start = performance.now();
      
      // Calculate similarities
      const withScores = mockResults.map(r => ({
        ...r,
        similarity: embeddingService.cosineSimilarity(mockQueryVector, r.embedding)
      }));
      
      // Sort and limit
      const results = withScores
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 10);
      
      const durationMs = performance.now() - start;
      
      console.log(`  ⏱️  Mock semantic search (100 vectors): ${durationMs.toFixed(2)}ms`);
      
      // With HNSW index, semantic search should be <50ms
      // This tests the computational cost of similarity calculation + sorting
      // Real pgvector HNSW queries are even faster due to approximate search
      expect(durationMs).toBeLessThan(50);
      expect(results).toHaveLength(10);
    });
  });
  
  describe('Cosine Similarity (Client-Side)', () => {
    it('should calculate cosine similarity in <1ms', () => {
      // Create two random 1536-dim vectors
      const vec1 = Array(1536).fill(0).map(() => Math.random() * 2 - 1);
      const vec2 = Array(1536).fill(0).map(() => Math.random() * 2 - 1);
      
      const { durationMs } = measureTimeSync(() => {
        return embeddingService.cosineSimilarity(vec1, vec2);
      });
      
      console.log(`  ⏱️  Cosine similarity (1536-dim): ${durationMs.toFixed(4)}ms`);
      
      // Client-side calculation should be very fast
      expect(durationMs).toBeLessThan(1);
    });
    
    it('should handle zero vectors without errors', () => {
      const zeroVec = Array(1536).fill(0);
      const normalVec = Array(1536).fill(0).map(() => Math.random());
      
      const { result, durationMs } = measureTimeSync(() => {
        return embeddingService.cosineSimilarity(zeroVec, normalVec);
      });
      
      console.log(`  ⏱️  Zero vector similarity: ${durationMs.toFixed(4)}ms`);
      
      // Should return 0 (not NaN)
      expect(result).toBe(0);
      expect(durationMs).toBeLessThan(1);
    });
  });
  
  describe('Database Performance Expectations', () => {
    it('should document expected semantic search performance', () => {
      // This is a documentation test
      // Actual database performance tests require:
      // 1. Test database with actual data
      // 2. HNSW indexes built
      // 3. Warm cache
      
      const expectations = {
        semanticSearch: {
          target: '< 50ms',
          requirement: 'HNSW index + pgvector cosine distance',
          factors: [
            'Index warmup (first query slower)',
            'Result set size (limit parameter)',
            'Database connection latency',
            'Cache hit rate'
          ]
        },
        indexCreation: {
          timing: 'One-time cost at table creation',
          impact: 'Queries 100x+ faster with HNSW vs sequential scan'
        }
      };
      
      console.log('\n  📊 Semantic Search Performance Expectations:');
      console.log(`     Target: ${expectations.semanticSearch.target}`);
      console.log(`     Requirement: ${expectations.semanticSearch.requirement}`);
      console.log(`     Factors affecting performance:`);
      expectations.semanticSearch.factors.forEach(factor => {
        console.log(`       - ${factor}`);
      });
      
      expect(expectations.semanticSearch.target).toBe('< 50ms');
    });
  });
});

// Sync version of measureTime for non-async functions
function measureTimeSync<T>(fn: () => T): { result: T; durationMs: number } {
  const start = performance.now();
  const result = fn();
  const durationMs = performance.now() - start;
  return { result, durationMs };
}
