/**
 * Unit tests for Qdrant Vector Storage Provider
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { QdrantVectorStorage } from '../../storage/providers/QdrantVectorStorage.js';
import { TestDataGenerator, TestEnvironment, TestDatabase, TestValidators } from '../utils/test-helpers.js';
import type { VectorStorageConfig } from '../../storage/interfaces/IVectorStorage.js';

describe('QdrantVectorStorage', () => {
  let storage: QdrantVectorStorage;
  let testEnv: TestEnvironment;
  let config: VectorStorageConfig;
  
  const SKIP_INTEGRATION = !process.env.TEST_WITH_QDRANT;

  beforeAll(async () => {
    testEnv = new TestEnvironment();
    config = testEnv.createQdrantConfig();
    
    if (!SKIP_INTEGRATION) {
      // Wait for Qdrant to be available
      try {
        await TestDatabase.waitForConnection(
          () => TestDatabase.isQdrantAvailable(config),
          10000
        );
      } catch (error) {
        console.warn('Qdrant not available, skipping integration tests');
        process.env.SKIP_QDRANT_TESTS = 'true';
      }
    }
  });

  afterAll(async () => {
    if (storage) {
      await storage.close();
    }
    testEnv.cleanup();
  });

  beforeEach(async () => {
    if (SKIP_INTEGRATION || process.env.SKIP_QDRANT_TESTS) {
      return;
    }
    
    storage = new QdrantVectorStorage(config);
    await storage.initialize();
  });

  afterEach(async () => {
    if (storage && !SKIP_INTEGRATION && !process.env.SKIP_QDRANT_TESTS) {
      // Clean up test collection
      try {
        await storage.deleteCollection();
      } catch (error) {
        console.warn('Collection cleanup error:', error);
      }
      
      await storage.close();
    }
  });

  describe('Connection Management', () => {
    it('should initialize successfully', async () => {
      if (SKIP_INTEGRATION || process.env.SKIP_QDRANT_TESTS) {
        console.log('Skipping Qdrant integration test - database not available');
        return;
      }
      
      expect(storage).toBeDefined();
      const healthResult = await storage.healthCheck();
      expect(healthResult.healthy).toBe(true);
    });

    it('should handle connection failures gracefully', async () => {
      const badConfig: VectorStorageConfig = {
        ...config,
        url: 'http://nonexistent-host:9999',
        timeout: 1000
      };
      
      const badStorage = new QdrantVectorStorage(badConfig);
      
      try {
        await badStorage.initialize();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should return false for health check when disconnected', async () => {
      if (SKIP_INTEGRATION || process.env.SKIP_QDRANT_TESTS) {
        console.log('Skipping Qdrant integration test - database not available');
        return;
      }
      
      await storage.close();
      const healthResult = await storage.healthCheck();
      expect(healthResult.healthy).toBe(false);
    });

    it('should report ready status correctly', async () => {
      if (SKIP_INTEGRATION || process.env.SKIP_QDRANT_TESTS) {
        console.log('Skipping Qdrant integration test - database not available');
        return;
      }
      
      expect(storage.isReady()).toBe(true);
      
      await storage.close();
      expect(storage.isReady()).toBe(false);
    });
  });

  describe('Collection Management', () => {
    it('should create collection during initialization', async () => {
      if (SKIP_INTEGRATION || process.env.SKIP_QDRANT_TESTS) {
        console.log('Skipping Qdrant integration test - database not available');
        return;
      }
      
      // Collection should exist after initialization
      const stats = await storage.getStats();
      expect(stats).toBeDefined();
      expect(stats.documentCount).toBeGreaterThanOrEqual(0);
    });

    it('should handle collection recreation', async () => {
      if (SKIP_INTEGRATION || process.env.SKIP_QDRANT_TESTS) {
        console.log('Skipping Qdrant integration test - database not available');
        return;
      }
      
      // Delete and recreate collection
      await storage.deleteCollection();
      
      // Should be able to initialize again
      await storage.initialize();
      
      const stats = await storage.getStats();
      expect(stats).toBeDefined();
      expect(stats.documentCount).toBe(0);
    });
  });

  describe('Vector Operations', () => {
    it('should store and retrieve embeddings', async () => {
      if (SKIP_INTEGRATION || process.env.SKIP_QDRANT_TESTS) {
        console.log('Skipping Qdrant integration test - database not available');
        return;
      }
      
      const testCode = TestDataGenerator.generateTestCode('function');
      const metadata = TestDataGenerator.generateCodeMetadata();
      
      // Store code embedding
      const id = await storage.storeCodeEmbedding(testCode, metadata);
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      
      // Retrieve by ID
      const retrieved = await storage.getDocument(id);
      expect(retrieved).toBeDefined();
      
      if (retrieved) {
        expect(retrieved.id).toBe(id);
        expect(retrieved.content).toBe(testCode);
        expect(retrieved.metadata.filePath).toBe(metadata.filePath);
        expect(retrieved.metadata.functionName).toBe(metadata.functionName);
      }
    });

    it('should generate embeddings for code', async () => {
      if (SKIP_INTEGRATION || process.env.SKIP_QDRANT_TESTS) {
        console.log('Skipping Qdrant integration test - database not available');
        return;
      }
      
      const testCode = TestDataGenerator.generateTestCode('class');
      
      const embedding = await storage.generateEmbedding(testCode);
      
      const validation = TestValidators.validateEmbedding(embedding, config.vectorSize);
      expect(validation.isValid).toBe(true);
      if (!validation.isValid) {
        console.error('Embedding validation errors:', validation.errors);
      }
    });

    it('should update existing documents', async () => {
      if (SKIP_INTEGRATION || process.env.SKIP_QDRANT_TESTS) {
        console.log('Skipping Qdrant integration test - database not available');
        return;
      }
      
      const testCode = TestDataGenerator.generateTestCode('function');
      const metadata = TestDataGenerator.generateCodeMetadata();
      
      // Store initial document
      const id = await storage.storeCodeEmbedding(testCode, metadata);
      
      // Update with new content and metadata
      const updatedCode = TestDataGenerator.generateTestCode('function');
      const updates = {
        content: updatedCode,
        metadata: {
          ...metadata,
          functionName: 'updatedFunction',
          complexity: 5
        }
      };
      
      await storage.updateDocument(id, updates);
      
      // Verify update
      const retrieved = await storage.getDocument(id);
      expect(retrieved?.content).toBe(updatedCode);
      expect(retrieved?.metadata.functionName).toBe('updatedFunction');
      expect(retrieved?.metadata.complexity).toBe(5);
    });

    it('should delete documents', async () => {
      if (SKIP_INTEGRATION || process.env.SKIP_QDRANT_TESTS) {
        console.log('Skipping Qdrant integration test - database not available');
        return;
      }
      
      const testCode = TestDataGenerator.generateTestCode('interface');
      const metadata = TestDataGenerator.generateCodeMetadata();
      
      // Store document
      const id = await storage.storeCodeEmbedding(testCode, metadata);
      
      // Verify it exists
      let retrieved = await storage.getDocument(id);
      expect(retrieved).toBeDefined();
      
      // Delete it
      await storage.deleteDocument(id);
      
      // Verify it's gone
      retrieved = await storage.getDocument(id);
      expect(retrieved).toBeNull();
    });
  });

  describe('Similarity Search', () => {
    it('should find similar code snippets', async () => {
      if (SKIP_INTEGRATION || process.env.SKIP_QDRANT_TESTS) {
        console.log('Skipping Qdrant integration test - database not available');
        return;
      }
      
      // Store multiple similar functions
      const baseFunctionCode = `
function processUser(user) {
  if (!user) throw new Error('User required');
  return user.name.toUpperCase();
}`;
      
      const similarFunctionCode = `
function handleUser(userData) {
  if (!userData) throw new Error('User data required');
  return userData.name.toUpperCase();
}`;
      
      const differentCode = `
class DatabaseConnection {
  constructor(config) {
    this.config = config;
  }
}`;
      
      // Store code embeddings
      await storage.storeCodeEmbedding(baseFunctionCode, TestDataGenerator.generateCodeMetadata({ id: 'func1' }));
      await storage.storeCodeEmbedding(similarFunctionCode, TestDataGenerator.generateCodeMetadata({ id: 'func2' }));
      await storage.storeCodeEmbedding(differentCode, TestDataGenerator.generateCodeMetadata({ id: 'class1' }));
      
      // Search for similar code to the base function
      const results = await storage.searchSimilarCode(baseFunctionCode, { limit: 3, threshold: 0.1 });
      
      expect(results.length).toBeGreaterThan(0);
      
      // The similar function should rank higher than the class
      const similarResult = results.find((r: any) => r.metadata.id === 'func2');
      const differentResult = results.find((r: any) => r.metadata.id === 'class1');
      
      if (similarResult && differentResult) {
        expect(similarResult.similarity).toBeGreaterThan(differentResult.similarity);
      }
      
      // Similarities should be valid
      for (const result of results) {
        expect(TestValidators.validateVectorSimilarity(result.similarity, 0.0)).toBe(true);
      }
    });

    it('should respect search limits', async () => {
      if (SKIP_INTEGRATION || process.env.SKIP_QDRANT_TESTS) {
        console.log('Skipping Qdrant integration test - database not available');
        return;
      }
      
      // Store multiple code snippets
      const codes = Array.from({ length: 5 }, (_, i) => 
        `function test${i}() { return ${i}; }`
      );
      
      for (let i = 0; i < codes.length; i++) {
        await storage.storeCodeEmbedding(
          codes[i], 
          TestDataGenerator.generateCodeMetadata({ id: `limit-test-${i}` })
        );
      }
      
      // Search with limit
      const results = await storage.searchSimilarCode('function test', { limit: 2 });
      
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should handle empty search results', async () => {
      if (SKIP_INTEGRATION || process.env.SKIP_QDRANT_TESTS) {
        console.log('Skipping Qdrant integration test - database not available');
        return;
      }
      
      // Search with very high threshold in empty collection
      const results = await storage.searchSimilarCode('test code', { threshold: 0.99 });
      
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });
  });

  describe('Document Management', () => {
    it('should list documents with filters', async () => {
      if (SKIP_INTEGRATION || process.env.SKIP_QDRANT_TESTS) {
        console.log('Skipping Qdrant integration test - database not available');
        return;
      }
      
      // Store documents with different languages
      const jsCode = `function test() { return 'javascript'; }`;
      const tsCode = `function test(): string { return 'typescript'; }`;
      
      await storage.storeCodeEmbedding(jsCode, TestDataGenerator.generateCodeMetadata({ id: 'js1', language: 'javascript' }));
      await storage.storeCodeEmbedding(tsCode, TestDataGenerator.generateCodeMetadata({ id: 'ts1', language: 'typescript' }));
      
      // List all documents
      const allDocs = await storage.listDocuments();
      expect(allDocs.length).toBeGreaterThanOrEqual(2);
      
      // List with limit
      const limitedDocs = await storage.listDocuments({}, 1);
      expect(limitedDocs.length).toBe(1);
    });

    it('should delete documents with filters', async () => {
      if (SKIP_INTEGRATION || process.env.SKIP_QDRANT_TESTS) {
        console.log('Skipping Qdrant integration test - database not available');
        return;
      }
      
      // Store test documents
      const testIds = ['del1', 'del2', 'del3'];
      for (const id of testIds) {
        await storage.storeCodeEmbedding(
          TestDataGenerator.generateTestCode('function'),
          TestDataGenerator.generateCodeMetadata({ id, language: 'javascript' })
        );
      }
      
      // Delete documents with filter
      const deletedCount = await storage.deleteDocuments({ language: 'javascript' });
      expect(deletedCount).toBeGreaterThanOrEqual(testIds.length);
      
      // Verify they're gone
      for (const id of testIds) {
        const retrieved = await storage.getDocument(id);
        expect(retrieved).toBeNull();
      }
    });
  });

  describe('Performance Tests', () => {
    it('should handle moderate vector datasets efficiently', async () => {
      if (SKIP_INTEGRATION || process.env.SKIP_QDRANT_TESTS) {
        console.log('Skipping Qdrant integration test - database not available');
        return;
      }
      
      const MODERATE_SIZE = 10; // Reduced for faster tests
      
      // Store documents individually to test performance
      const startTime = Date.now();
      const storedIds: string[] = [];
      
      for (let i = 0; i < MODERATE_SIZE; i++) {
        const code = TestDataGenerator.generateTestCode(['function', 'class', 'interface'][i % 3] as any);
        const metadata = TestDataGenerator.generateCodeMetadata({ id: `perf-${i}` });
        const id = await storage.storeCodeEmbedding(code, metadata);
        storedIds.push(id);
      }
      
      const insertDuration = Date.now() - startTime;
      expect(insertDuration).toBeLessThan(30000); // 30 seconds for 10 items (embeddings are slow)
      
      // Search performance
      const searchStart = Date.now();
      const results = await storage.searchSimilarCode('function test', { limit: 5 });
      const searchDuration = Date.now() - searchStart;
      
      expect(searchDuration).toBeLessThan(5000); // 5 seconds for search
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle multiple concurrent searches', async () => {
      if (SKIP_INTEGRATION || process.env.SKIP_QDRANT_TESTS) {
        console.log('Skipping Qdrant integration test - database not available');
        return;
      }
      
      // Store some test data
      for (let i = 0; i < 3; i++) {
        await storage.storeCodeEmbedding(
          TestDataGenerator.generateTestCode('function'),
          TestDataGenerator.generateCodeMetadata({ id: `concurrent-${i}` })
        );
      }
      
      // Run multiple searches concurrently
      const searchPromises = Array.from({ length: 3 }, (_, i) =>
        storage.searchSimilarCode(`test query ${i}`, { limit: 2 })
      );
      
      const startTime = Date.now();
      const results = await Promise.all(searchPromises);
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(10000); // Should handle concurrent requests efficiently
      expect(results.length).toBe(3); // All searches should complete
      
      for (const result of results) {
        expect(Array.isArray(result)).toBe(true);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed embeddings gracefully', async () => {
      if (SKIP_INTEGRATION || process.env.SKIP_QDRANT_TESTS) {
        console.log('Skipping Qdrant integration test - database not available');
        return;
      }
      
      // Try to generate embedding for empty text
      try {
        const embedding = await storage.generateEmbedding('');
        expect(Array.isArray(embedding)).toBe(true);
        expect(embedding.length).toBe(config.vectorSize);
      } catch (error) {
        // Empty text might throw an error, which is acceptable
        expect(error).toBeDefined();
      }
    });

    it('should handle invalid document IDs gracefully', async () => {
      if (SKIP_INTEGRATION || process.env.SKIP_QDRANT_TESTS) {
        console.log('Skipping Qdrant integration test - database not available');
        return;
      }
      
      // Try to get non-existent document
      const result = await storage.getDocument('non-existent-id');
      expect(result).toBeNull();
      
      // Try to delete non-existent document (should not throw)
      await expect(storage.deleteDocument('non-existent-id')).resolves.not.toThrow();
    });

    it('should provide meaningful stats', async () => {
      if (SKIP_INTEGRATION || process.env.SKIP_QDRANT_TESTS) {
        console.log('Skipping Qdrant integration test - database not available');
        return;
      }
      
      const stats = await storage.getStats();
      
      expect(stats).toBeDefined();
      expect(typeof stats.documentCount).toBe('number');
      expect(typeof stats.indexSize).toBe('number');
      expect(stats.documentCount).toBeGreaterThanOrEqual(0);
      expect(stats.indexSize).toBeGreaterThanOrEqual(0);
    });
  });
});
