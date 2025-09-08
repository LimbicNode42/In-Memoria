/**
 * Unit tests for PostgreSQL Storage Provider
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { PostgreSQLStorage } from '../../storage/providers/PostgreSQLStorage.js';
import { TestDataGenerator, TestEnvironment, TestDatabase, TestValidators } from '../utils/test-helpers.js';
import type { RelationalStorageConfig } from '../../storage/interfaces/IRelationalStorage.js';

describe('PostgreSQLStorage', () => {
  let storage: PostgreSQLStorage;
  let testEnv: TestEnvironment;
  let config: RelationalStorageConfig;
  
  const SKIP_INTEGRATION = !process.env.TEST_WITH_POSTGRES;

  beforeAll(async () => {
    testEnv = new TestEnvironment();
    config = testEnv.createPostgreSQLConfig();
    
    if (!SKIP_INTEGRATION) {
      // Wait for PostgreSQL to be available
      try {
        await TestDatabase.waitForConnection(
          () => TestDatabase.isPostgreSQLAvailable(config),
          10000
        );
      } catch (error) {
        console.warn('PostgreSQL not available, skipping integration tests');
        process.env.SKIP_POSTGRES_TESTS = 'true';
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
    if (SKIP_INTEGRATION || process.env.SKIP_POSTGRES_TESTS) {
      return;
    }
    
    storage = new PostgreSQLStorage(config);
    await storage.initialize();
  });

  afterEach(async () => {
    if (storage && !SKIP_INTEGRATION && !process.env.SKIP_POSTGRES_TESTS) {
      await storage.close();
    }
  });

  describe('Connection Management', () => {
    it('should initialize successfully', async () => {
      if (SKIP_INTEGRATION || process.env.SKIP_POSTGRES_TESTS) {
        console.log('Skipping PostgreSQL integration test - database not available');
        return;
      }
      
      expect(storage).toBeDefined();
      const healthResult = await storage.healthCheck();
      expect(healthResult.healthy).toBe(true);
    });

    it('should handle connection failures gracefully', async () => {
      const badConfig: RelationalStorageConfig = {
        ...config,
        host: 'nonexistent-host',
        timeout: 1000
      };
      
      const badStorage = new PostgreSQLStorage(badConfig);
      
      try {
        await badStorage.initialize();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should return false for health check when disconnected', async () => {
      if (SKIP_INTEGRATION || process.env.SKIP_POSTGRES_TESTS) {
        console.log('Skipping PostgreSQL integration test - database not available');
        return;
      }
      
      await storage.close();
      const healthResult = await storage.healthCheck();
      expect(healthResult.healthy).toBe(false);
    });

    it('should report ready status correctly', async () => {
      if (SKIP_INTEGRATION || process.env.SKIP_POSTGRES_TESTS) {
        console.log('Skipping PostgreSQL integration test - database not available');
        return;
      }
      
      expect(storage.isReady()).toBe(true);
      
      await storage.close();
      expect(storage.isReady()).toBe(false);
    });
  });

  describe('Semantic Concepts CRUD', () => {
    it('should store and retrieve semantic concepts', async () => {
      if (SKIP_INTEGRATION || process.env.SKIP_POSTGRES_TESTS) {
        console.log('Skipping PostgreSQL integration test - database not available');
        return;
      }
      
      const testConcept = TestDataGenerator.generateSemanticConcept();
      
      // Store concept
      await storage.insertSemanticConcept(testConcept);
      
      // Retrieve concept by file path (since there's no getById method)
      const retrieved = await storage.getSemanticConcepts(testConcept.filePath);
      expect(retrieved).toBeDefined();
      expect(retrieved.length).toBeGreaterThan(0);
      
      const found = retrieved.find(c => c.id === testConcept.id);
      expect(found).toBeDefined();
      
      if (found) {
        const validation = TestValidators.validateSemanticConcept(found, testConcept, true);
        expect(validation.isValid).toBe(true);
        if (!validation.isValid) {
          console.error('Validation errors:', validation.errors);
        }
      }
    });

    it('should update existing semantic concepts', async () => {
      if (SKIP_INTEGRATION || process.env.SKIP_POSTGRES_TESTS) {
        console.log('Skipping PostgreSQL integration test - database not available');
        return;
      }
      
      const testConcept = TestDataGenerator.generateSemanticConcept();
      await storage.insertSemanticConcept(testConcept);
      
      // Update concept
      const updates = {
        confidenceScore: 0.95,
        relationships: { extends: ['UpdatedBaseClass'], implements: ['NewInterface'] }
      };
      
      await storage.updateSemanticConcept(testConcept.id, updates);
      
      // Verify update
      const retrieved = await storage.getSemanticConcepts(testConcept.filePath);
      const found = retrieved.find(c => c.id === testConcept.id);
      
      expect(found?.confidenceScore).toBe(0.95);
      expect(found?.relationships.extends).toContain('UpdatedBaseClass');
    });

    it('should delete semantic concepts', async () => {
      if (SKIP_INTEGRATION || process.env.SKIP_POSTGRES_TESTS) {
        console.log('Skipping PostgreSQL integration test - database not available');
        return;
      }
      
      const testConcept = TestDataGenerator.generateSemanticConcept();
      await storage.insertSemanticConcept(testConcept);
      
      // Verify it exists
      let retrieved = await storage.getSemanticConcepts(testConcept.filePath);
      let found = retrieved.find(c => c.id === testConcept.id);
      expect(found).toBeDefined();
      
      // Delete it
      await storage.deleteSemanticConcept(testConcept.id);
      
      // Verify it's gone
      retrieved = await storage.getSemanticConcepts(testConcept.filePath);
      found = retrieved.find(c => c.id === testConcept.id);
      expect(found).toBeUndefined();
    });

    it('should handle duplicate concept IDs with upsert', async () => {
      if (SKIP_INTEGRATION || process.env.SKIP_POSTGRES_TESTS) {
        console.log('Skipping PostgreSQL integration test - database not available');
        return;
      }
      
      const testConcept = TestDataGenerator.generateSemanticConcept();
      
      // Insert first time
      await storage.insertSemanticConcept(testConcept);
      
      // Insert again with same ID (should upsert)
      const updatedConcept = {
        ...testConcept,
        confidenceScore: 0.99
      };
      
      await storage.insertSemanticConcept(updatedConcept);
      
      // Should only be one concept with updated score
      const retrieved = await storage.getSemanticConcepts(testConcept.filePath);
      const matches = retrieved.filter(c => c.id === testConcept.id);
      
      expect(matches.length).toBe(1);
      expect(matches[0].confidenceScore).toBe(0.99);
    });
  });

  describe('Developer Patterns CRUD', () => {
    it('should store and retrieve developer patterns', async () => {
      if (SKIP_INTEGRATION || process.env.SKIP_POSTGRES_TESTS) {
        console.log('Skipping PostgreSQL integration test - database not available');
        return;
      }
      
      const testPattern = TestDataGenerator.generateDeveloperPattern();
      
      // Store pattern
      await storage.insertDeveloperPattern(testPattern);
      
      // Retrieve patterns by type
      const retrieved = await storage.getDeveloperPatterns(testPattern.patternType);
      expect(retrieved).toBeDefined();
      expect(retrieved.length).toBeGreaterThan(0);
      
      const found = retrieved.find(p => p.patternId === testPattern.patternId);
      expect(found).toBeDefined();
      
      if (found) {
        const validation = TestValidators.validateDeveloperPattern(found, testPattern, true);
        expect(validation.isValid).toBe(true);
        if (!validation.isValid) {
          console.error('Validation errors:', validation.errors);
        }
      }
    });

    it('should search patterns by type', async () => {
      if (SKIP_INTEGRATION || process.env.SKIP_POSTGRES_TESTS) {
        console.log('Skipping PostgreSQL integration test - database not available');
        return;
      }
      
      const patterns = [
        TestDataGenerator.generateDeveloperPattern({ patternType: 'function-naming' }),
        TestDataGenerator.generateDeveloperPattern({ patternType: 'error-handling' }),
        TestDataGenerator.generateDeveloperPattern({ patternType: 'function-naming' })
      ];
      
      // Store all patterns
      for (const pattern of patterns) {
        await storage.insertDeveloperPattern(pattern);
      }
      
      // Search for function-naming patterns
      const namingResults = await storage.getDeveloperPatterns('function-naming');
      expect(namingResults.length).toBeGreaterThanOrEqual(2);
      
      // Verify all results are function-naming patterns
      for (const result of namingResults) {
        expect(result.patternType).toBe('function-naming');
      }
    });

    it('should update developer patterns', async () => {
      if (SKIP_INTEGRATION || process.env.SKIP_POSTGRES_TESTS) {
        console.log('Skipping PostgreSQL integration test - database not available');
        return;
      }
      
      const testPattern = TestDataGenerator.generateDeveloperPattern();
      await storage.insertDeveloperPattern(testPattern);
      
      // Update pattern
      const updates = {
        frequency: 25,
        confidence: 0.95
      };
      
      await storage.updateDeveloperPattern(testPattern.patternId, updates);
      
      // Verify update
      const retrieved = await storage.getDeveloperPatterns(testPattern.patternType);
      const found = retrieved.find(p => p.patternId === testPattern.patternId);
      
      expect(found?.frequency).toBe(25);
      expect(found?.confidence).toBe(0.95);
    });

    it('should delete developer patterns', async () => {
      if (SKIP_INTEGRATION || process.env.SKIP_POSTGRES_TESTS) {
        console.log('Skipping PostgreSQL integration test - database not available');
        return;
      }
      
      const testPattern = TestDataGenerator.generateDeveloperPattern();
      await storage.insertDeveloperPattern(testPattern);
      
      // Verify it exists
      let retrieved = await storage.getDeveloperPatterns(testPattern.patternType);
      let found = retrieved.find(p => p.patternId === testPattern.patternId);
      expect(found).toBeDefined();
      
      // Delete it
      await storage.deleteDeveloperPattern(testPattern.patternId);
      
      // Verify it's gone
      retrieved = await storage.getDeveloperPatterns(testPattern.patternType);
      found = retrieved.find(p => p.patternId === testPattern.patternId);
      expect(found).toBeUndefined();
    });
  });

  describe('File Intelligence CRUD', () => {
    it('should store and retrieve file intelligence', async () => {
      if (SKIP_INTEGRATION || process.env.SKIP_POSTGRES_TESTS) {
        console.log('Skipping PostgreSQL integration test - database not available');
        return;
      }
      
      const testFile = TestDataGenerator.generateFileIntelligence();
      
      // Store file intelligence
      await storage.insertFileIntelligence(testFile);
      
      // Retrieve by file path
      const retrieved = await storage.getFileIntelligence(testFile.filePath);
      expect(retrieved).toBeDefined();
      
      if (retrieved) {
        expect(retrieved.filePath).toBe(testFile.filePath);
        expect(retrieved.fileHash).toBe(testFile.fileHash);
        expect(retrieved.semanticConcepts).toEqual(testFile.semanticConcepts);
        expect(retrieved.patternsUsed).toEqual(testFile.patternsUsed);
      }
    });

    it('should update file intelligence', async () => {
      if (SKIP_INTEGRATION || process.env.SKIP_POSTGRES_TESTS) {
        console.log('Skipping PostgreSQL integration test - database not available');
        return;
      }
      
      const testFile = TestDataGenerator.generateFileIntelligence();
      await storage.insertFileIntelligence(testFile);
      
      // Update file
      const updates = {
        fileHash: 'new-hash-value',
        complexityMetrics: {
          cyclomaticComplexity: 10,
          linesOfCode: 200,
          maintainabilityIndex: 75
        }
      };
      
      await storage.updateFileIntelligence(testFile.filePath, updates);
      
      // Verify update
      const retrieved = await storage.getFileIntelligence(testFile.filePath);
      expect(retrieved?.fileHash).toBe('new-hash-value');
      expect(retrieved?.complexityMetrics.cyclomaticComplexity).toBe(10);
    });

    it('should delete file intelligence', async () => {
      if (SKIP_INTEGRATION || process.env.SKIP_POSTGRES_TESTS) {
        console.log('Skipping PostgreSQL integration test - database not available');
        return;
      }
      
      const testFile = TestDataGenerator.generateFileIntelligence();
      await storage.insertFileIntelligence(testFile);
      
      // Verify it exists
      let retrieved = await storage.getFileIntelligence(testFile.filePath);
      expect(retrieved).toBeDefined();
      
      // Delete it
      await storage.deleteFileIntelligence(testFile.filePath);
      
      // Verify it's gone
      retrieved = await storage.getFileIntelligence(testFile.filePath);
      expect(retrieved).toBeNull();
    });
  });

  describe('AI Insights CRUD', () => {
    it('should store and retrieve AI insights', async () => {
      if (SKIP_INTEGRATION || process.env.SKIP_POSTGRES_TESTS) {
        console.log('Skipping PostgreSQL integration test - database not available');
        return;
      }
      
      const testInsight = TestDataGenerator.generateAIInsight();
      
      // Store insight
      await storage.insertAIInsight(testInsight);
      
      // Retrieve by type
      const retrieved = await storage.getAIInsights(testInsight.insightType);
      expect(retrieved).toBeDefined();
      expect(retrieved.length).toBeGreaterThan(0);
      
      const found = retrieved.find(i => i.insightId === testInsight.insightId);
      expect(found).toBeDefined();
      
      if (found) {
        expect(found.insightType).toBe(testInsight.insightType);
        expect(found.confidenceScore).toBe(testInsight.confidenceScore);
        expect(found.sourceAgent).toBe(testInsight.sourceAgent);
      }
    });

    it('should update AI insights', async () => {
      if (SKIP_INTEGRATION || process.env.SKIP_POSTGRES_TESTS) {
        console.log('Skipping PostgreSQL integration test - database not available');
        return;
      }
      
      const testInsight = TestDataGenerator.generateAIInsight();
      await storage.insertAIInsight(testInsight);
      
      // Update insight
      const updates = {
        validationStatus: 'validated' as const,
        confidenceScore: 0.98
      };
      
      await storage.updateAIInsight(testInsight.insightId, updates);
      
      // Verify update
      const retrieved = await storage.getAIInsights(testInsight.insightType);
      const found = retrieved.find(i => i.insightId === testInsight.insightId);
      
      expect(found?.validationStatus).toBe('validated');
      expect(found?.confidenceScore).toBe(0.98);
    });

    it('should delete AI insights', async () => {
      if (SKIP_INTEGRATION || process.env.SKIP_POSTGRES_TESTS) {
        console.log('Skipping PostgreSQL integration test - database not available');
        return;
      }
      
      const testInsight = TestDataGenerator.generateAIInsight();
      await storage.insertAIInsight(testInsight);
      
      // Verify it exists
      let retrieved = await storage.getAIInsights(testInsight.insightType);
      let found = retrieved.find(i => i.insightId === testInsight.insightId);
      expect(found).toBeDefined();
      
      // Delete it
      await storage.deleteAIInsight(testInsight.insightId);
      
      // Verify it's gone
      retrieved = await storage.getAIInsights(testInsight.insightType);
      found = retrieved.find(i => i.insightId === testInsight.insightId);
      expect(found).toBeUndefined();
    });
  });

  describe('Batch Operations', () => {
    it('should handle batch inserts efficiently', async () => {
      if (SKIP_INTEGRATION || process.env.SKIP_POSTGRES_TESTS) {
        console.log('Skipping PostgreSQL integration test - database not available');
        return;
      }
      
      const concepts = Array.from({ length: 10 }, () => TestDataGenerator.generateSemanticConcept());
      
      const startTime = Date.now();
      await storage.insertSemanticConceptsBatch(concepts);
      const duration = Date.now() - startTime;
      
      // Should complete in reasonable time (less than 5 seconds for 10 items)
      expect(duration).toBeLessThan(5000);
      
      // Verify all were stored
      for (const concept of concepts) {
        const retrieved = await storage.getSemanticConcepts(concept.filePath);
        const found = retrieved.find(c => c.id === concept.id);
        expect(found).toBeDefined();
      }
    });

    it('should handle batch pattern inserts', async () => {
      if (SKIP_INTEGRATION || process.env.SKIP_POSTGRES_TESTS) {
        console.log('Skipping PostgreSQL integration test - database not available');
        return;
      }
      
      const patterns = Array.from({ length: 5 }, () => TestDataGenerator.generateDeveloperPattern());
      
      const startTime = Date.now();
      await storage.insertDeveloperPatternsBatch(patterns);
      const duration = Date.now() - startTime;
      
      // Should complete in reasonable time
      expect(duration).toBeLessThan(3000);
      
      // Verify all were stored
      for (const pattern of patterns) {
        const retrieved = await storage.getDeveloperPatterns(pattern.patternType);
        const found = retrieved.find(p => p.patternId === pattern.patternId);
        expect(found).toBeDefined();
      }
    });
  });

  describe('Performance Tests', () => {
    it('should handle moderate datasets efficiently', async () => {
      if (SKIP_INTEGRATION || process.env.SKIP_POSTGRES_TESTS) {
        console.log('Skipping PostgreSQL integration test - database not available');
        return;
      }
      
      const MODERATE_SIZE = 50; // Reduced from 100 for faster tests
      const concepts = Array.from({ length: MODERATE_SIZE }, () => 
        TestDataGenerator.generateSemanticConcept()
      );
      
      // Batch insert should be faster than individual inserts
      const startTime = Date.now();
      await storage.insertSemanticConceptsBatch(concepts);
      const batchDuration = Date.now() - startTime;
      
      // Should complete in reasonable time (less than 5 seconds for 50 items)
      expect(batchDuration).toBeLessThan(5000);
      
      // Search should also be fast
      const searchStart = Date.now();
      const results = await storage.getSemanticConcepts();
      const searchDuration = Date.now() - searchStart;
      
      expect(results.length).toBeGreaterThanOrEqual(MODERATE_SIZE);
      expect(searchDuration).toBeLessThan(3000);
    });
  });
});
