/**
 * Test utilities for storage testing
 */

import { randomBytes } from 'crypto';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  SemanticConcept,
  DeveloperPattern,
  FileIntelligence,
  AIInsight,
  RelationalStorageConfig
} from '../../storage/interfaces/IRelationalStorage.js';
import {
  CodeMetadata,
  VectorStorageConfig
} from '../../storage/interfaces/IVectorStorage.js';

export class TestDataGenerator {
  static generateSemanticConcept(overrides?: Partial<SemanticConcept>): Omit<SemanticConcept, 'createdAt' | 'updatedAt'> {
    const id = overrides?.id || `concept-${randomBytes(8).toString('hex')}`;
    return {
      id,
      conceptName: overrides?.conceptName || `TestConcept${id.slice(-4)}`,
      conceptType: overrides?.conceptType || 'class',
      confidenceScore: overrides?.confidenceScore || 0.85,
      relationships: overrides?.relationships || { extends: ['BaseClass'], implements: [] },
      evolutionHistory: overrides?.evolutionHistory || { versions: [] },
      filePath: overrides?.filePath || `/test/path/${id}.ts`,
      lineRange: overrides?.lineRange || { start: 1, end: 50 },
      ...overrides
    };
  }

  static generateDeveloperPattern(overrides?: Partial<DeveloperPattern>): Omit<DeveloperPattern, 'createdAt' | 'lastSeen'> {
    const id = overrides?.patternId || `pattern-${randomBytes(8).toString('hex')}`;
    return {
      patternId: id,
      patternType: overrides?.patternType || 'function-naming',
      patternContent: overrides?.patternContent || {
        description: 'Test pattern for naming functions',
        template: 'camelCase with descriptive names'
      },
      frequency: overrides?.frequency || 15,
      contexts: overrides?.contexts || ['TypeScript', 'React'],
      examples: overrides?.examples || [
        { code: 'function getUserById(id: string)', confidence: 0.9 }
      ],
      confidence: overrides?.confidence || 0.78,
      ...overrides
    };
  }

  static generateFileIntelligence(overrides?: Partial<FileIntelligence>): Omit<FileIntelligence, 'createdAt'> {
    const filePath = overrides?.filePath || `/test/file-${randomBytes(4).toString('hex')}.ts`;
    return {
      filePath,
      fileHash: overrides?.fileHash || randomBytes(32).toString('hex'),
      semanticConcepts: overrides?.semanticConcepts || ['concept1', 'concept2'],
      patternsUsed: overrides?.patternsUsed || ['pattern1', 'pattern2'],
      complexityMetrics: overrides?.complexityMetrics || {
        cyclomaticComplexity: 5,
        linesOfCode: 120,
        maintainabilityIndex: 85
      },
      dependencies: overrides?.dependencies || ['./utils', '../types'],
      lastAnalyzed: overrides?.lastAnalyzed || new Date(),
      ...overrides
    };
  }

  static generateAIInsight(overrides?: Partial<AIInsight>): Omit<AIInsight, 'createdAt'> {
    const id = overrides?.insightId || `insight-${randomBytes(8).toString('hex')}`;
    return {
      insightId: id,
      insightType: overrides?.insightType || 'refactoring-suggestion',
      insightContent: overrides?.insightContent || {
        suggestion: 'Consider extracting this function',
        reasoning: 'Function is doing too many things'
      },
      confidenceScore: overrides?.confidenceScore || 0.82,
      sourceAgent: overrides?.sourceAgent || 'test-agent',
      validationStatus: overrides?.validationStatus || 'pending',
      impactPrediction: overrides?.impactPrediction || {
        difficulty: 'medium',
        timeEstimate: '30 minutes'
      },
      ...overrides
    };
  }

  static generateCodeMetadata(overrides?: Partial<CodeMetadata>): CodeMetadata {
    const id = overrides?.id || `code-${randomBytes(8).toString('hex')}`;
    return {
      id,
      filePath: overrides?.filePath || `/test/code-${id}.ts`,
      functionName: overrides?.functionName || `testFunction${id.slice(-4)}`,
      className: overrides?.className || `TestClass${id.slice(-4)}`,
      language: overrides?.language || 'typescript',
      complexity: overrides?.complexity || 3,
      lineCount: overrides?.lineCount || 25,
      lastModified: overrides?.lastModified || new Date(),
      ...overrides
    };
  }

  static generateTestCode(type: 'function' | 'class' | 'interface' = 'function'): string {
    const id = randomBytes(4).toString('hex');
    
    switch (type) {
      case 'function':
        return `
export function testFunction${id}(param: string): string {
  // Test function generated for testing
  if (!param) {
    throw new Error('Parameter is required');
  }
  
  return \`Processed: \${param}\`;
}`;

      case 'class':
        return `
export class TestClass${id} {
  private value: string;
  
  constructor(initialValue: string) {
    this.value = initialValue;
  }
  
  public getValue(): string {
    return this.value;
  }
  
  public setValue(newValue: string): void {
    this.value = newValue;
  }
}`;

      case 'interface':
        return `
export interface TestInterface${id} {
  id: string;
  name: string;
  value: number;
  optional?: boolean;
}`;

      default:
        return `// Test code block ${id}`;
    }
  }

  static generateBulkData(count: number) {
    return {
      concepts: Array.from({ length: count }, () => this.generateSemanticConcept()),
      patterns: Array.from({ length: count }, () => this.generateDeveloperPattern()),
      files: Array.from({ length: count }, () => this.generateFileIntelligence()),
      insights: Array.from({ length: count }, () => this.generateAIInsight()),
      codes: Array.from({ length: count }, () => ({
        code: this.generateTestCode(['function', 'class', 'interface'][Math.floor(Math.random() * 3)] as any),
        metadata: this.generateCodeMetadata()
      }))
    };
  }
}

export class TestEnvironment {
  private tempDirs: string[] = [];

  createTempDir(prefix: string = 'inmemoria-test'): string {
    const tempDir = mkdtempSync(join(tmpdir(), `${prefix}-`));
    this.tempDirs.push(tempDir);
    return tempDir;
  }

  cleanup(): void {
    for (const dir of this.tempDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch (error) {
        console.warn(`Failed to cleanup temp dir ${dir}:`, error);
      }
    }
    this.tempDirs = [];
  }

  createSQLiteConfig(filename?: string): RelationalStorageConfig {
    const tempDir = this.createTempDir('sqlite-test');
    return {
      type: 'sqlite',
      filename: filename || 'test.db',
      path: tempDir,
      poolSize: 1,
      timeout: 5000
    };
  }

  createPostgreSQLConfig(): RelationalStorageConfig {
    return {
      type: 'postgresql',
      host: process.env.TEST_POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.TEST_POSTGRES_PORT || '5432'),
      database: process.env.TEST_POSTGRES_DB || 'inmemoria_test',
      username: process.env.TEST_POSTGRES_USER || 'test_user',
      password: process.env.TEST_POSTGRES_PASSWORD || 'test_password',
      ssl: false,
      poolSize: 2,
      timeout: 5000
    };
  }

  createQdrantConfig(): VectorStorageConfig {
    return {
      type: 'qdrant',
      url: process.env.TEST_QDRANT_URL || 'http://localhost:6333',
      collectionName: `test-collection-${randomBytes(4).toString('hex')}`,
      vectorSize: 384, // Smaller for tests
      distance: 'cosine',
      timeout: 5000,
      retryAttempts: 1,
      embeddingProvider: 'local'
    };
  }

  createSurrealDBConfig(): VectorStorageConfig {
    return {
      type: 'surrealdb-local',
      collectionName: `test-collection-${randomBytes(4).toString('hex')}`,
      vectorSize: 384,
      distance: 'cosine',
      embeddingProvider: 'local'
    };
  }
}

export class TestDatabase {
  static async waitForConnection(
    testFn: () => Promise<boolean>,
    timeoutMs: number = 10000,
    intervalMs: number = 100
  ): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        if (await testFn()) {
          return;
        }
      } catch (error) {
        // Continue waiting
      }
      
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    
    throw new Error(`Database connection timeout after ${timeoutMs}ms`);
  }

  static async isPostgreSQLAvailable(config: RelationalStorageConfig): Promise<boolean> {
    try {
      // Dynamic import to avoid dependency issues
      const { Pool } = await import('pg');
      const pool = new Pool({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.username,
        password: config.password,
        connectionTimeoutMillis: 2000
      });
      
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      await pool.end();
      
      return true;
    } catch (error) {
      return false;
    }
  }

  static async isQdrantAvailable(config: VectorStorageConfig): Promise<boolean> {
    try {
      const response = await fetch(`${config.url}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000)
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }
}

export class TestValidators {
  static validateSemanticConcept(
    actual: SemanticConcept,
    expected: Partial<SemanticConcept>,
    checkDates: boolean = false
  ): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (actual.id !== expected.id) errors.push(`ID mismatch: ${actual.id} !== ${expected.id}`);
    if (actual.conceptName !== expected.conceptName) errors.push(`conceptName mismatch`);
    if (actual.conceptType !== expected.conceptType) errors.push(`conceptType mismatch`);
    if (expected.confidenceScore && Math.abs(actual.confidenceScore - expected.confidenceScore) > 0.01) {
      errors.push(`confidenceScore difference too large`);
    }
    if (expected.relationships && JSON.stringify(actual.relationships) !== JSON.stringify(expected.relationships)) {
      errors.push(`relationships mismatch`);
    }
    if (expected.evolutionHistory && JSON.stringify(actual.evolutionHistory) !== JSON.stringify(expected.evolutionHistory)) {
      errors.push(`evolutionHistory mismatch`);
    }
    if (actual.filePath !== expected.filePath) errors.push(`filePath mismatch`);
    if (expected.lineRange && JSON.stringify(actual.lineRange) !== JSON.stringify(expected.lineRange)) {
      errors.push(`lineRange mismatch`);
    }
    
    if (checkDates) {
      if (!(actual.createdAt instanceof Date)) errors.push(`createdAt is not a Date`);
      if (!(actual.updatedAt instanceof Date)) errors.push(`updatedAt is not a Date`);
    }
    
    return { isValid: errors.length === 0, errors };
  }

  static validateDeveloperPattern(
    actual: DeveloperPattern,
    expected: Partial<DeveloperPattern>,
    checkDates: boolean = false
  ): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (actual.patternId !== expected.patternId) errors.push(`patternId mismatch`);
    if (actual.patternType !== expected.patternType) errors.push(`patternType mismatch`);
    if (expected.patternContent && JSON.stringify(actual.patternContent) !== JSON.stringify(expected.patternContent)) {
      errors.push(`patternContent mismatch`);
    }
    if (actual.frequency !== expected.frequency) errors.push(`frequency mismatch`);
    if (expected.contexts && JSON.stringify(actual.contexts) !== JSON.stringify(expected.contexts)) {
      errors.push(`contexts mismatch`);
    }
    if (expected.examples && JSON.stringify(actual.examples) !== JSON.stringify(expected.examples)) {
      errors.push(`examples mismatch`);
    }
    if (expected.confidence && Math.abs(actual.confidence - expected.confidence) > 0.01) {
      errors.push(`confidence difference too large`);
    }
    
    if (checkDates) {
      if (!(actual.createdAt instanceof Date)) errors.push(`createdAt is not a Date`);
      if (!(actual.lastSeen instanceof Date)) errors.push(`lastSeen is not a Date`);
    }
    
    return { isValid: errors.length === 0, errors };
  }

  static validateVectorSimilarity(similarity: number, expectedMin: number = 0.7): boolean {
    return similarity >= 0 && similarity <= 1 && similarity >= expectedMin;
  }

  static validateEmbedding(embedding: number[], expectedDimension?: number): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!Array.isArray(embedding)) errors.push(`embedding is not an array`);
    if (embedding.length === 0) errors.push(`embedding is empty`);
    
    if (expectedDimension && embedding.length !== expectedDimension) {
      errors.push(`embedding dimension ${embedding.length} !== expected ${expectedDimension}`);
    }
    
    // Check that it's not all zeros (should have some variation)
    const nonZeroCount = embedding.filter(val => Math.abs(val) > 0.001).length;
    if (nonZeroCount <= embedding.length * 0.1) {
      errors.push(`embedding appears to be mostly zeros (${nonZeroCount}/${embedding.length} non-zero)`);
    }
    
    return { isValid: errors.length === 0, errors };
  }
}

export { randomBytes };
export default {
  TestDataGenerator,
  TestEnvironment,
  TestDatabase,
  TestValidators
};
