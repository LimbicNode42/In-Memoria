/**
 * Qdrant Vector Storage Implementation
 * Supports both Docker deployment (production) and local binary (development)
 */

import {
  IVectorStorage,
  VectorStorageConfig,
  CodeMetadata,
  SemanticSearchResult,
  VectorDocument,
  SearchOptions,
  EmbeddingProgress
} from '../interfaces/IVectorStorage.js';
import { CircuitBreaker, createOpenAICircuitBreaker } from '../../utils/circuit-breaker.js';

// Type definitions for dynamically imported modules
type OpenAI = any;
type Pipeline = any;

interface QdrantPoint {
  id: string | number;
  vector: number[];
  payload: {
    content: string;
    metadata: CodeMetadata;
    created: string;
    updated: string;
  };
}

interface QdrantSearchResult {
  id: string | number;
  score: number;
  payload: {
    content: string;
    metadata: CodeMetadata;
    created: string;
    updated: string;
  };
}

interface QdrantCollectionInfo {
  status: string;
  vectors_count: number;
  indexed_vectors_count: number;
  points_count: number;
  segments_count: number;
  disk_data_size: number;
  ram_data_size: number;
}

export class QdrantVectorStorage implements IVectorStorage {
  private baseUrl: string;
  private apiKey?: string;
  private collectionName: string;
  private vectorSize: number;
  private distance: 'cosine' | 'euclidean' | 'dot';
  private initialized: boolean = false;
  private openaiCircuitBreaker: CircuitBreaker;
  private openaiClient: OpenAI | undefined;
  private localEmbeddingPipeline: any;
  private embeddingCache = new Map<string, number[]>();
  private readonly EMBEDDING_CACHE_SIZE = 1000;
  private readonly EMBEDDING_DIMENSION = 1536; // OpenAI ada-002 dimension
  private readonly LOCAL_EMBEDDING_DIMENSION = 384; // All-MiniLM-L6-v2 dimension

  constructor(config: VectorStorageConfig) {
    this.baseUrl = config.url || 'http://localhost:6333';
    this.apiKey = config.apiKey;
    this.collectionName = config.collectionName || 'in-memoria';
    this.vectorSize = config.vectorSize || this.EMBEDDING_DIMENSION;
    this.distance = config.distance || 'cosine';

    // Initialize OpenAI circuit breaker
    this.openaiCircuitBreaker = createOpenAICircuitBreaker();
  }

  private async initializeOpenAI(): Promise<void> {
    // Initialize OpenAI client if API key is provided via constructor or environment
    const openaiApiKey = this.apiKey || process.env.OPENAI_API_KEY;
    
    if (openaiApiKey) {
      try {
        const OpenAI = (await import('openai')).default;
        this.openaiClient = new OpenAI({
          apiKey: openaiApiKey
        });
        console.log('✅ OpenAI client initialized for embeddings');
      } catch (error) {
        console.warn('⚠️  Failed to import OpenAI, using local embeddings only:', error);
      }
    } else {
      console.log('📝 No OpenAI API key provided, will use local embeddings');
    }
  }

  private async initializeLocalEmbeddings(): Promise<void> {
    try {
      const { pipeline } = await import('@xenova/transformers') as any;
      this.localEmbeddingPipeline = await pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2'
      );
      console.log('✅ Local embedding pipeline ready');
    } catch (error: unknown) {
      console.warn('⚠️  Failed to initialize local embeddings:', error instanceof Error ? error.message : String(error));
      console.log('📝 Will use fallback local embedding method');
      // Don't re-throw the error, just continue without local embeddings
      this.localEmbeddingPipeline = null;
    }
  }

  async initialize(): Promise<void> {
    try {
      // Initialize OpenAI and local embeddings
      await this.initializeOpenAI();
      
      // Initialize local embeddings but don't fail if it doesn't work
      try {
        await this.initializeLocalEmbeddings();
      } catch (localEmbeddingError) {
        console.warn('⚠️  Local embeddings initialization failed, will use fallback:', localEmbeddingError);
        this.localEmbeddingPipeline = null;
      }

      // Check if Qdrant is accessible
      const response = await this.makeRequest('GET', '/');
      if (!response.ok) {
        throw new Error(`Qdrant not accessible: ${response.status} ${response.statusText}`);
      }

      // Create collection if it doesn't exist
      await this.ensureCollection();
      
      this.initialized = true;
      
      // Log initialization status
      const embeddingMethod = this.openaiClient ? 'OpenAI API' : 'Local/Fallback';
      console.log(`✅ Qdrant vector storage initialized: ${this.baseUrl}/${this.collectionName} (embeddings: ${embeddingMethod})`);
      
    } catch (error) {
      console.error('Failed to initialize Qdrant:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    this.initialized = false;
    this.embeddingCache.clear();
    console.log('🔌 Qdrant vector storage connection closed');
  }

  isReady(): boolean {
    return this.initialized;
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    try {
      const response = await this.makeRequest('GET', '/');
      if (response.ok) {
        const collectionResponse = await this.makeRequest('GET', `/collections/${this.collectionName}`);
        if (collectionResponse.ok) {
          return { healthy: true, message: 'Qdrant and collection are accessible' };
        } else {
          return { healthy: false, message: 'Collection not accessible' };
        }
      } else {
        return { healthy: false, message: 'Qdrant not accessible' };
      }
    } catch (error) {
      return { 
        healthy: false, 
        message: `Health check failed: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    // Check cache first
    if (this.embeddingCache.has(text)) {
      return this.embeddingCache.get(text)!;
    }

    let embedding: number[];

    try {
      // Try OpenAI first if available
      if (this.openaiClient) {
        embedding = await this.openaiCircuitBreaker.execute(async () => {
          const response = await this.openaiClient!.embeddings.create({
            model: 'text-embedding-ada-002',
            input: text
          });
          return response.data[0].embedding;
        });
      } else {
        // Fallback to local embeddings
        embedding = await this.generateLocalEmbedding(text);
      }

      // Cache the result
      if (this.embeddingCache.size >= this.EMBEDDING_CACHE_SIZE) {
        const firstKey = this.embeddingCache.keys().next().value;
        if (firstKey) {
          this.embeddingCache.delete(firstKey);
        }
      }
      this.embeddingCache.set(text, embedding);

      return embedding;
    } catch (error) {
      console.error('Failed to generate embedding:', error);
      // Return zero vector as fallback
      return new Array(this.vectorSize).fill(0);
    }
  }

  private async generateLocalEmbedding(text: string): Promise<number[]> {
    try {
      if (this.localEmbeddingPipeline) {
        const output = await this.localEmbeddingPipeline(text, {
          pooling: 'mean',
          normalize: true
        });
        return Array.from(output.data);
      } else {
        // Fallback: Simple hash-based pseudo-embedding
        return this.generateFallbackEmbedding(text);
      }
    } catch (error) {
      console.warn('Local embedding failed, using fallback:', error);
      return this.generateFallbackEmbedding(text);
    }
  }

  private generateFallbackEmbedding(text: string): number[] {
    const hash = this.simpleHash(text);
    const embedding = new Array(this.LOCAL_EMBEDDING_DIMENSION).fill(0);
    
    for (let i = 0; i < this.LOCAL_EMBEDDING_DIMENSION; i++) {
      embedding[i] = Math.sin(hash * (i + 1)) * 0.1;
    }
    
    return embedding;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }

  async storeCodeEmbedding(code: string, metadata: CodeMetadata): Promise<string> {
    if (!this.initialized) {
      throw new Error('Vector storage not initialized. Call initialize() first.');
    }

    const embedding = await this.generateEmbedding(code);
    const id = metadata.id;
    const now = new Date().toISOString();

    const point: QdrantPoint = {
      id,
      vector: embedding,
      payload: {
        content: code,
        metadata,
        created: now,
        updated: now
      }
    };

    await this.makeRequest('PUT', `/collections/${this.collectionName}/points`, {
      points: [point]
    });

    return id;
  }

  async storeMultipleEmbeddings(
    codeChunks: string[],
    metadataList: CodeMetadata[],
    onProgress?: (progress: EmbeddingProgress) => void
  ): Promise<string[]> {
    if (!this.initialized) {
      throw new Error('Vector storage not initialized. Call initialize() first.');
    }

    if (codeChunks.length !== metadataList.length) {
      throw new Error('Code chunks and metadata arrays must have the same length');
    }

    const points: QdrantPoint[] = [];
    const ids: string[] = [];
    const total = codeChunks.length;

    for (let i = 0; i < codeChunks.length; i++) {
      const code = codeChunks[i];
      const metadata = metadataList[i];
      const id = metadata.id;
      
      onProgress?.({
        processed: i,
        total,
        currentFile: metadata.filePath
      });

      const embedding = await this.generateEmbedding(code);
      const now = new Date().toISOString();

      points.push({
        id,
        vector: embedding,
        payload: {
          content: code,
          metadata,
          created: now,
          updated: now
        }
      });

      ids.push(id);
    }

    // Send in batches of 100
    const batchSize = 100;
    for (let i = 0; i < points.length; i += batchSize) {
      const batch = points.slice(i, i + batchSize);
      await this.makeRequest('PUT', `/collections/${this.collectionName}/points`, {
        points: batch
      });
    }

    onProgress?.({
      processed: total,
      total
    });

    return ids;
  }

  async searchSimilarCode(
    query: string,
    options: SearchOptions = {}
  ): Promise<SemanticSearchResult[]> {
    const embedding = await this.generateEmbedding(query);
    return this.searchByEmbedding(embedding, options);
  }

  async searchByEmbedding(
    embedding: number[],
    options: SearchOptions = {}
  ): Promise<SemanticSearchResult[]> {
    if (!this.initialized) {
      throw new Error('Vector storage not initialized. Call initialize() first.');
    }

    const searchRequest = {
      vector: embedding,
      limit: options.limit || 10,
      score_threshold: options.threshold || 0.7,
      with_payload: true
    };

    const response = await this.makeRequest('POST', `/collections/${this.collectionName}/points/search`, searchRequest);
    const data = await response.json();

    return data.result.map((result: QdrantSearchResult) => ({
      id: String(result.id),
      code: result.payload.content,
      metadata: result.payload.metadata,
      similarity: result.score
    }));
  }

  async updateDocument(id: string, updates: Partial<VectorDocument>): Promise<void> {
    if (!this.initialized) {
      throw new Error('Vector storage not initialized. Call initialize() first.');
    }

    // Get existing document
    const existing = await this.getDocument(id);
    if (!existing) {
      throw new Error(`Document with id ${id} not found`);
    }

    const updatedPayload = {
      content: updates.content || existing.content,
      metadata: { ...existing.metadata, ...updates.metadata },
      created: existing.created.toISOString(),
      updated: new Date().toISOString()
    };

    let vector = existing.embedding;
    if (updates.content) {
      vector = await this.generateEmbedding(updates.content);
    }

    const point: QdrantPoint = {
      id,
      vector,
      payload: updatedPayload
    };

    await this.makeRequest('PUT', `/collections/${this.collectionName}/points`, {
      points: [point]
    });
  }

  async deleteDocument(id: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('Vector storage not initialized. Call initialize() first.');
    }

    await this.makeRequest('POST', `/collections/${this.collectionName}/points/delete`, {
      points: [id]
    });
  }

  async deleteDocuments(filter: Record<string, any>): Promise<number> {
    if (!this.initialized) {
      throw new Error('Vector storage not initialized. Call initialize() first.');
    }

    // Note: This is a simplified implementation
    // In production, you'd want to implement proper filtering
    const response = await this.makeRequest('POST', `/collections/${this.collectionName}/points/delete`, {
      filter
    });

    const data = await response.json();
    return data.operation_id || 0;
  }

  async getDocument(id: string): Promise<VectorDocument | null> {
    if (!this.initialized) {
      throw new Error('Vector storage not initialized. Call initialize() first.');
    }

    try {
      const response = await this.makeRequest('GET', `/collections/${this.collectionName}/points/${id}`);
      const data = await response.json();

      if (!data.result) {
        return null;
      }

      const point = data.result;
      return {
        id: String(point.id),
        content: point.payload.content,
        embedding: point.vector,
        metadata: point.payload.metadata,
        created: new Date(point.payload.created),
        updated: new Date(point.payload.updated)
      };
    } catch (error) {
      return null;
    }
  }

  async listDocuments(filter?: Record<string, any>, limit?: number): Promise<VectorDocument[]> {
    if (!this.initialized) {
      throw new Error('Vector storage not initialized. Call initialize() first.');
    }

    const scrollRequest: any = {
      limit: limit || 100,
      with_payload: true,
      with_vector: true
    };

    if (filter) {
      scrollRequest.filter = filter;
    }

    const response = await this.makeRequest('POST', `/collections/${this.collectionName}/points/scroll`, scrollRequest);
    const data = await response.json();

    return data.result.points.map((point: any) => ({
      id: String(point.id),
      content: point.payload.content,
      embedding: point.vector,
      metadata: point.payload.metadata,
      created: new Date(point.payload.created),
      updated: new Date(point.payload.updated)
    }));
  }

  async getStats(): Promise<{
    documentCount: number;
    indexSize: number;
    memoryUsage?: number;
  }> {
    if (!this.initialized) {
      throw new Error('Vector storage not initialized. Call initialize() first.');
    }

    const response = await this.makeRequest('GET', `/collections/${this.collectionName}`);
    const data = await response.json();
    const info: QdrantCollectionInfo = data.result;

    return {
      documentCount: info.points_count,
      indexSize: info.disk_data_size,
      memoryUsage: info.ram_data_size
    };
  }

  async ensureCollection(config?: Partial<VectorStorageConfig>): Promise<void> {
    try {
      // Check if collection exists
      const response = await this.makeRequest('GET', `/collections/${this.collectionName}`);
      if (response.ok) {
        console.log(`Collection '${this.collectionName}' already exists`);
        return;
      }
    } catch (error) {
      // Collection doesn't exist, create it
    }

    const vectorConfig = {
      size: config?.vectorSize || this.vectorSize,
      distance: config?.distance || this.distance
    };

    const createRequest = {
      vectors: vectorConfig
    };

    await this.makeRequest('PUT', `/collections/${this.collectionName}`, createRequest);
    console.log(`Created collection '${this.collectionName}' with vector config:`, vectorConfig);
  }

  async deleteCollection(): Promise<void> {
    if (!this.initialized) {
      throw new Error('Vector storage not initialized. Call initialize() first.');
    }

    await this.makeRequest('DELETE', `/collections/${this.collectionName}`);
    this.initialized = false;
  }

  async exportData(): Promise<{
    documents: VectorDocument[];
    metadata: {
      collectionName: string;
      vectorSize: number;
      documentCount: number;
      exportedAt: Date;
    };
  }> {
    const documents = await this.listDocuments();
    const stats = await this.getStats();

    return {
      documents,
      metadata: {
        collectionName: this.collectionName,
        vectorSize: this.vectorSize,
        documentCount: stats.documentCount,
        exportedAt: new Date()
      }
    };
  }

  async importData(data: {
    documents: VectorDocument[];
    metadata: any;
  }): Promise<void> {
    if (!this.initialized) {
      throw new Error('Vector storage not initialized. Call initialize() first.');
    }

    const points: QdrantPoint[] = data.documents.map(doc => ({
      id: doc.id,
      vector: doc.embedding,
      payload: {
        content: doc.content,
        metadata: doc.metadata,
        created: doc.created.toISOString(),
        updated: doc.updated.toISOString()
      }
    }));

    // Send in batches
    const batchSize = 100;
    for (let i = 0; i < points.length; i += batchSize) {
      const batch = points.slice(i, i + batchSize);
      await this.makeRequest('PUT', `/collections/${this.collectionName}/points`, {
        points: batch
      });
    }
  }

  async optimizeIndex(): Promise<void> {
    if (!this.initialized) {
      throw new Error('Vector storage not initialized. Call initialize() first.');
    }

    // Qdrant automatically optimizes, but we can trigger it manually
    await this.makeRequest('POST', `/collections/${this.collectionName}/index`, {});
  }

  private async makeRequest(method: string, endpoint: string, body?: any): Promise<Response> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.apiKey) {
      headers['api-key'] = this.apiKey;
    }

    const options: RequestInit = {
      method,
      headers
    };

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Qdrant request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return response;
  }
}
