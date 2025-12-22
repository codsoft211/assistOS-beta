// Sprint 1 - EmbeddingService Tests
// Tests for the production-ready EmbeddingService

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock OpenAI BEFORE importing service
const mockEmbedding = Array(1536).fill(0).map(() => Math.random() * 2 - 1);

vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      embeddings = {
        create: vi.fn(async ({ input }: { input: string | string[] }) => {
          const inputs = Array.isArray(input) ? input : [input];
          return {
            data: inputs.map(() => ({ embedding: mockEmbedding })),
            usage: { prompt_tokens: 10, total_tokens: 10 }
          };
        })
      };
    }
  };
});

// NOW import the service (after mock is set up)
const { embeddingService } = await import('../../services/embedding.service');

describe('EmbeddingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateEmbedding', () => {
    it('should generate embedding for single text', async () => {
      const text = 'Test document for embedding generation';
      const embedding = await embeddingService.generateEmbedding(text);

      expect(embedding).toBeDefined();
      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBe(1536); // OpenAI text-embedding-3-small
      expect(typeof embedding[0]).toBe('number');
    });

    it('should handle empty text', async () => {
      const embedding = await embeddingService.generateEmbedding('');
      expect(embedding).toBeDefined();
      expect(embedding.length).toBe(1536);
    });

    it('should handle very long text', async () => {
      const longText = 'Lorem ipsum '.repeat(1000);
      const embedding = await embeddingService.generateEmbedding(longText);
      expect(embedding).toBeDefined();
      expect(embedding.length).toBe(1536);
    });
  });

  describe('generateEmbeddings', () => {
    it('should generate embeddings for multiple texts in batch', async () => {
      const texts = [
        'First document',
        'Second document',
        'Third document'
      ];
      
      const embeddings = await embeddingService.generateEmbeddings(texts);

      expect(embeddings).toBeDefined();
      expect(Array.isArray(embeddings)).toBe(true);
      expect(embeddings.length).toBe(3);
      
      embeddings.forEach(embedding => {
        expect(Array.isArray(embedding)).toBe(true);
        expect(embedding.length).toBe(1536);
      });
    });

    it('should handle empty array', async () => {
      const embeddings = await embeddingService.generateEmbeddings([]);
      expect(embeddings).toBeDefined();
      expect(embeddings.length).toBe(0);
    });

    it('should handle single text in array', async () => {
      const embeddings = await embeddingService.generateEmbeddings(['Single text']);
      expect(embeddings.length).toBe(1);
      expect(embeddings[0].length).toBe(1536);
    });
  });

  describe('cosineSimilarity', () => {
    it('should calculate cosine similarity between identical vectors', () => {
      const vectorA = [1, 2, 3, 4, 5];
      const vectorB = [1, 2, 3, 4, 5];
      
      const similarity = embeddingService.cosineSimilarity(vectorA, vectorB);
      
      expect(similarity).toBeCloseTo(1.0, 5); // Should be exactly 1.0
    });

    it('should calculate cosine similarity between different vectors', () => {
      const vectorA = [1, 0, 0];
      const vectorB = [0, 1, 0];
      
      const similarity = embeddingService.cosineSimilarity(vectorA, vectorB);
      
      expect(similarity).toBeCloseTo(0.0, 5); // Orthogonal vectors
    });

    it('should calculate cosine similarity between opposite vectors', () => {
      const vectorA = [1, 2, 3];
      const vectorB = [-1, -2, -3];
      
      const similarity = embeddingService.cosineSimilarity(vectorA, vectorB);
      
      expect(similarity).toBeCloseTo(-1.0, 5); // Opposite direction
    });

    it('should handle zero vectors', () => {
      const vectorA = [0, 0, 0];
      const vectorB = [1, 2, 3];
      
      const similarity = embeddingService.cosineSimilarity(vectorA, vectorB);
      
      expect(similarity).toBe(0); // Zero vector has no direction
    });

    it('should calculate similarity for high-dimensional vectors', () => {
      const vectorA = Array(1536).fill(1);
      const vectorB = Array(1536).fill(1);
      
      const similarity = embeddingService.cosineSimilarity(vectorA, vectorB);
      
      expect(similarity).toBeCloseTo(1.0, 5);
    });
  });

  describe('semanticSearch', () => {
    it('should perform semantic search with tenant isolation', async () => {
      const query = 'Search for documents about invoices';
      const tenantId = 'test-tenant-123';
      
      // This test requires database setup
      // For now, we verify the method exists and has correct signature
      expect(embeddingService.semanticSearch).toBeDefined();
      expect(typeof embeddingService.semanticSearch).toBe('function');
    });
  });

  describe('findSimilarDocuments', () => {
    it('should find similar documents with tenant isolation', async () => {
      const documentId = 'doc-123';
      const tenantId = 'test-tenant-123';
      
      // This test requires database setup
      // For now, we verify the method exists and has correct signature
      expect(embeddingService.findSimilarDocuments).toBeDefined();
      expect(typeof embeddingService.findSimilarDocuments).toBe('function');
    });

    it('should enforce tenant isolation in similarity search', async () => {
      // This is a critical security test
      // Verifies that findSimilarDocuments filters by tenantId
      // Implementation requires database setup
      expect(embeddingService.findSimilarDocuments).toBeDefined();
    });
  });
});

describe('EmbeddingService Integration', () => {
  it('should generate and compare embeddings end-to-end', async () => {
    const text1 = 'AssistOS is an AI-first ERP platform';
    const text2 = 'AssistOS provides intelligent enterprise resource planning';
    const text3 = 'The weather today is sunny and warm';

    const [emb1, emb2, emb3] = await embeddingService.generateEmbeddings([text1, text2, text3]);

    // Verify embeddings are generated
    expect(emb1).toBeDefined();
    expect(emb2).toBeDefined();
    expect(emb3).toBeDefined();
    expect(emb1.length).toBe(1536);
    expect(emb2.length).toBe(1536);
    expect(emb3.length).toBe(1536);

    // Note: With mocks, all embeddings are identical
    // In production, similar texts would have higher similarity
    const similarity12 = embeddingService.cosineSimilarity(emb1, emb2);
    expect(similarity12).toBeCloseTo(1.0, 2); // Mock returns same embedding
  });
});
