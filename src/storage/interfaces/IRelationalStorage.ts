/**
 * Interface for relational storage operations
 * Supports both SQLite (local) and PostgreSQL (remote) implementations
 */

export interface SemanticConcept {
  id: string;
  conceptName: string;
  conceptType: string;
  confidenceScore: number;
  relationships: Record<string, any>;
  evolutionHistory: Record<string, any>;
  filePath: string;
  lineRange: { start: number; end: number };
  createdAt: Date;
  updatedAt: Date;
}

export interface DeveloperPattern {
  patternId: string;
  patternType: string;
  patternContent: Record<string, any>;
  frequency: number;
  contexts: string[];
  examples: Record<string, any>[];
  confidence: number;
  createdAt: Date;
  lastSeen: Date;
}

export interface FileIntelligence {
  filePath: string;
  fileHash: string;
  semanticConcepts: string[];
  patternsUsed: string[];
  complexityMetrics: Record<string, number>;
  dependencies: string[];
  lastAnalyzed: Date;
  createdAt: Date;
}

export interface AIInsight {
  insightId: string;
  insightType: string;
  insightContent: Record<string, any>;
  confidenceScore: number;
  sourceAgent: string;
  validationStatus: 'pending' | 'validated' | 'rejected';
  impactPrediction: Record<string, any>;
  createdAt: Date;
}

export interface RelationalStorageConfig {
  type: 'sqlite' | 'postgresql';
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  ssl?: boolean;
  poolSize?: number;
  timeout?: number;
  // SQLite specific
  filename?: string;
  path?: string;
}

export interface IRelationalStorage {
  /**
   * Initialize the storage connection and run migrations
   */
  initialize(): Promise<void>;

  /**
   * Close the storage connection
   */
  close(): Promise<void>;

  /**
   * Check if the storage is connected and ready
   */
  isReady(): boolean;

  /**
   * Run health check on the storage
   */
  healthCheck(): Promise<{ healthy: boolean; message?: string }>;

  // Semantic Concepts
  insertSemanticConcept(concept: Omit<SemanticConcept, 'createdAt' | 'updatedAt'>): Promise<void>;
  getSemanticConcepts(filePath?: string): Promise<SemanticConcept[]>;
  updateSemanticConcept(id: string, updates: Partial<SemanticConcept>): Promise<void>;
  deleteSemanticConcept(id: string): Promise<void>;

  // Developer Patterns
  insertDeveloperPattern(pattern: Omit<DeveloperPattern, 'createdAt' | 'lastSeen'>): Promise<void>;
  getDeveloperPatterns(patternType?: string): Promise<DeveloperPattern[]>;
  updateDeveloperPattern(patternId: string, updates: Partial<DeveloperPattern>): Promise<void>;
  deleteDeveloperPattern(patternId: string): Promise<void>;

  // File Intelligence
  insertFileIntelligence(fileIntel: Omit<FileIntelligence, 'createdAt'>): Promise<void>;
  getFileIntelligence(filePath: string): Promise<FileIntelligence | null>;
  updateFileIntelligence(filePath: string, updates: Partial<FileIntelligence>): Promise<void>;
  deleteFileIntelligence(filePath: string): Promise<void>;

  // AI Insights
  insertAIInsight(insight: Omit<AIInsight, 'createdAt'>): Promise<void>;
  getAIInsights(insightType?: string): Promise<AIInsight[]>;
  updateAIInsight(insightId: string, updates: Partial<AIInsight>): Promise<void>;
  deleteAIInsight(insightId: string): Promise<void>;

  // Batch operations for performance
  insertSemanticConceptsBatch(concepts: Omit<SemanticConcept, 'createdAt' | 'updatedAt'>[]): Promise<void>;
  insertDeveloperPatternsBatch(patterns: Omit<DeveloperPattern, 'createdAt' | 'lastSeen'>[]): Promise<void>;

  // Migration and maintenance
  runMigrations(): Promise<void>;
  getCurrentSchemaVersion(): Promise<number>;
  backupData(): Promise<string>; // Returns backup identifier/path
  restoreData(backupId: string): Promise<void>;
}
