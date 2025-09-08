/**
 * Interface for vector storage operations
 * Supports SurrealDB (local), Qdrant (remote), and other vector databases
 */

export interface CodeMetadata {
  id: string;
  filePath: string;
  functionName?: string;
  className?: string;
  language: string;
  complexity: number;
  lineCount: number;
  lastModified: Date;
}

export interface SemanticSearchResult {
  id: string;
  code: string;
  metadata: CodeMetadata;
  similarity: number;
}

export interface VectorDocument {
  id: string;
  content: string;
  embedding: number[];
  metadata: CodeMetadata;
  created: Date;
  updated: Date;
}

export interface SearchOptions {
  limit?: number;
  threshold?: number;
  filter?: Record<string, any>;
  includeMetadata?: boolean;
  includeContent?: boolean;
}

export interface VectorStorageConfig {
  type: 'surrealdb-local' | 'surrealdb-remote' | 'qdrant';
  
  // Qdrant specific
  url?: string;
  apiKey?: string;
  collectionName?: string;
  vectorSize?: number;
  distance?: 'cosine' | 'euclidean' | 'dot';
  
  // SurrealDB specific
  endpoint?: string;
  namespace?: string;
  database?: string;
  username?: string;
  password?: string;
  
  // Common options
  timeout?: number;
  retryAttempts?: number;
  embeddingProvider?: 'openai' | 'local' | 'custom';
  embeddingModel?: string;
}

export interface EmbeddingProgress {
  processed: number;
  total: number;
  currentFile?: string;
  estimatedTimeRemaining?: number;
}

export interface IVectorStorage {
  /**
   * Initialize the vector storage connection
   */
  initialize(): Promise<void>;

  /**
   * Close the vector storage connection
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

  /**
   * Generate embedding for given text
   */
  generateEmbedding(text: string): Promise<number[]>;

  /**
   * Store a single code embedding
   */
  storeCodeEmbedding(code: string, metadata: CodeMetadata): Promise<string>;

  /**
   * Store multiple code embeddings in batch
   */
  storeMultipleEmbeddings(
    codeChunks: string[],
    metadataList: CodeMetadata[],
    onProgress?: (progress: EmbeddingProgress) => void
  ): Promise<string[]>;

  /**
   * Search for similar code using vector similarity
   */
  searchSimilarCode(
    query: string,
    options?: SearchOptions
  ): Promise<SemanticSearchResult[]>;

  /**
   * Search using pre-computed embedding
   */
  searchByEmbedding(
    embedding: number[],
    options?: SearchOptions
  ): Promise<SemanticSearchResult[]>;

  /**
   * Update an existing document
   */
  updateDocument(id: string, updates: Partial<VectorDocument>): Promise<void>;

  /**
   * Delete a document by ID
   */
  deleteDocument(id: string): Promise<void>;

  /**
   * Delete documents by filter
   */
  deleteDocuments(filter: Record<string, any>): Promise<number>;

  /**
   * Get document by ID
   */
  getDocument(id: string): Promise<VectorDocument | null>;

  /**
   * List all documents with optional filtering
   */
  listDocuments(filter?: Record<string, any>, limit?: number): Promise<VectorDocument[]>;

  /**
   * Get collection/database statistics
   */
  getStats(): Promise<{
    documentCount: number;
    indexSize: number;
    memoryUsage?: number;
  }>;

  /**
   * Create or update collection schema
   */
  ensureCollection(config?: Partial<VectorStorageConfig>): Promise<void>;

  /**
   * Delete entire collection
   */
  deleteCollection(): Promise<void>;

  /**
   * Export data for backup/migration
   */
  exportData(): Promise<{
    documents: VectorDocument[];
    metadata: {
      collectionName: string;
      vectorSize: number;
      documentCount: number;
      exportedAt: Date;
    };
  }>;

  /**
   * Import data from backup/migration
   */
  importData(data: {
    documents: VectorDocument[];
    metadata: any;
  }): Promise<void>;

  /**
   * Optimize the vector index
   */
  optimizeIndex(): Promise<void>;
}
