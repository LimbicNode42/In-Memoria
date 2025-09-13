/**
 * Storage Factory - Creates appropriate storage providers based on environment
 * Provides fallback mechanisms for ARM64 compatibility
 */

import { IVectorStorage, VectorStorageConfig } from './interfaces/IVectorStorage.js';
import { QdrantVectorStorage } from './providers/QdrantVectorStorage.js';

/**
 * Storage configuration based on environment variables
 */
export interface StorageConfig {
  // Vector storage configuration
  vectorProvider: 'qdrant' | 'surrealdb';
  
  // Qdrant configuration
  qdrant?: {
    url: string;
    apiKey?: string;
    collectionName?: string;
  };
  
  // OpenAI configuration for embeddings
  openaiApiKey?: string;
}

/**
 * Creates vector storage instance based on configuration
 */
export async function createVectorStorage(config: StorageConfig): Promise<IVectorStorage> {
  const { vectorProvider, openaiApiKey } = config;
  
  console.log(`Initializing vector storage provider: ${vectorProvider}`);
  
  switch (vectorProvider) {
    case 'qdrant':
      if (!config.qdrant?.url) {
        throw new Error('Qdrant URL is required for qdrant vector provider');
      }
      
      return new QdrantVectorStorage({
        type: 'qdrant',
        url: config.qdrant.url,
        apiKey: openaiApiKey, // Pass OpenAI API key for embeddings
        collectionName: config.qdrant.collectionName || 'code_embeddings',
        embeddingProvider: 'openai',
        embeddingModel: 'text-embedding-3-small'
      });
    
    case 'surrealdb':
      // Only load SurrealDB if explicitly requested and available
      try {
        const { SemanticVectorDB } = await import('./vector-db.js');
        console.log('Successfully loaded SurrealDB for vector storage');
        return new SemanticVectorDB(openaiApiKey) as unknown as IVectorStorage;
      } catch (error) {
        console.warn('SurrealDB not available on this platform, falling back to Qdrant');
        if (!config.qdrant?.url) {
          throw new Error('SurrealDB failed to load and no Qdrant fallback configured');
        }
        
        return new QdrantVectorStorage({
          type: 'qdrant',
          url: config.qdrant.url,
          apiKey: openaiApiKey, // Pass OpenAI API key for embeddings
          collectionName: config.qdrant.collectionName || 'code_embeddings',
          embeddingProvider: 'openai',
          embeddingModel: 'text-embedding-3-small'
        });
      }
    
    default:
      throw new Error(`Unknown vector provider: ${vectorProvider}`);
  }
}

/**
 * Gets storage configuration from environment variables
 */
export function getStorageConfigFromEnv(): StorageConfig {
  // Determine vector provider based on environment
  let vectorProvider: StorageConfig['vectorProvider'] = 'qdrant'; // Default to Qdrant for production
  
  // Override if explicitly set
  if (process.env.VECTOR_PROVIDER) {
    vectorProvider = process.env.VECTOR_PROVIDER as StorageConfig['vectorProvider'];
  }
  
  // Auto-detect based on available services
  if (process.env.QDRANT_URL) {
    vectorProvider = 'qdrant';
  }
  
  return {
    vectorProvider,
    
    // Qdrant configuration
    qdrant: process.env.QDRANT_URL ? {
      url: process.env.QDRANT_URL,
      apiKey: process.env.QDRANT_API_KEY,
      collectionName: process.env.QDRANT_COLLECTION_NAME
    } : undefined,
    
    // OpenAI configuration
    openaiApiKey: process.env.OPENAI_API_KEY
  };
}
