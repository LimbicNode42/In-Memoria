/**
 * Integration tests for storage providers
 * These tests require actual database connections
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { StorageProvider } from '../../storage/providers/StorageProvider.js';
import { TestDataGenerator, TestEnvironment } from '../utils/test-helpers.js';

describe('Storage Integration Tests', () => {
  let testEnv: TestEnvironment;

  beforeAll(async () => {
    testEnv = new TestEnvironment();
  });

  afterAll(async () => {
    testEnv.cleanup();
  });

  describe('Storage Provider Factory', () => {
    it('should create storage providers from configuration', async () => {
      // Test SQLite configuration (always available)
      const sqliteConfig = testEnv.createSQLiteConfig();
      const provider = new StorageProvider({
        relational: sqliteConfig,
        vector: testEnv.createSurrealDBConfig()
      });

      await provider.initialize();
      expect(provider.isReady()).toBe(true);
      
      await provider.close();
    });

    it('should handle mixed environment configurations', async () => {
      // Test environment detection
      const originalEnv = process.env.NODE_ENV;
      
      try {
        // Test development environment
        process.env.NODE_ENV = 'development';
        const devProvider = new StorageProvider();
        expect(devProvider).toBeDefined();
        
        // Test production environment
        process.env.NODE_ENV = 'production';
        const prodProvider = new StorageProvider();
        expect(prodProvider).toBeDefined();
        
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  describe('Data Persistence', () => {
    it('should persist data across provider restarts', async () => {
      const config = {
        relational: testEnv.createSQLiteConfig('persistence-test.db'),
        vector: testEnv.createSurrealDBConfig()
      };

      // First provider instance
      const provider1 = new StorageProvider(config);
      await provider1.initialize();

      const testConcept = TestDataGenerator.generateSemanticConcept();
      await provider1.relationalStorage.insertSemanticConcept(testConcept);
      
      await provider1.close();

      // Second provider instance with same config
      const provider2 = new StorageProvider(config);
      await provider2.initialize();

      const retrieved = await provider2.relationalStorage.getSemanticConcepts(testConcept.filePath);
      const found = retrieved.find(c => c.id === testConcept.id);
      
      expect(found).toBeDefined();
      expect(found?.conceptName).toBe(testConcept.conceptName);
      
      await provider2.close();
    });
  });

  describe('Health Monitoring', () => {
    it('should provide comprehensive health status', async () => {
      const provider = new StorageProvider({
        relational: testEnv.createSQLiteConfig(),
        vector: testEnv.createSurrealDBConfig()
      });

      await provider.initialize();

      const health = await provider.healthCheck();
      expect(health.healthy).toBe(true);
      expect(health.components).toBeDefined();
      expect(health.components.relational).toBeDefined();
      expect(health.components.vector).toBeDefined();

      await provider.close();
    });

    it('should detect partial system failures', async () => {
      const provider = new StorageProvider({
        relational: testEnv.createSQLiteConfig(),
        vector: {
          type: 'qdrant',
          url: 'http://nonexistent:9999',
          collectionName: 'test',
          vectorSize: 384,
          distance: 'cosine',
          timeout: 1000,
          embeddingProvider: 'local'
        }
      });

      await provider.initialize();

      const health = await provider.healthCheck();
      expect(health.healthy).toBe(false);
      expect(health.components.relational.healthy).toBe(true);
      expect(health.components.vector.healthy).toBe(false);

      await provider.close();
    });
  });
});
