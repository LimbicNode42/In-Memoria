/**
 * Enhanced configuration system supporting remote storage
 */

import { RelationalStorageConfig } from '../storage/interfaces/IRelationalStorage.js';
import { VectorStorageConfig } from '../storage/interfaces/IVectorStorage.js';
import { StorageProviderConfig } from '../storage/interfaces/IStorageProvider.js';

export interface InMemoriaConfig {
  // Storage configuration
  storage: StorageProviderConfig;
  
  // Performance configuration
  performance: {
    batchSize: number;
    maxConcurrentFiles: number;
    fileOperationTimeout: number;
    cacheSize: number;
  };
  
  // API configuration
  api: {
    openaiApiKey?: string;
    requestTimeout: number;
    rateLimitRequests: number;
    rateLimitWindow: number; // in milliseconds
  };
  
  // Analysis configuration
  analysis: {
    supportedLanguages: string[];
    maxFileSize: number; // in bytes
    skipDirectories: string[];
    skipFilePatterns: string[];
  };
  
  // Logging configuration
  logging: {
    level: 'error' | 'warn' | 'info' | 'debug';
    enablePerformanceLogging: boolean;
  };

  // Environment detection
  environment: 'development' | 'production' | 'test';
}

const DEFAULT_CONFIG: InMemoriaConfig = {
  storage: {
    mode: 'local', // Will be overridden by environment detection
    
    relational: {
      type: 'sqlite',
      filename: 'in-memoria.db',
      poolSize: 10,
      timeout: 30000
    },
    
    vector: {
      type: 'surrealdb-local',
      collectionName: 'in-memoria',
      vectorSize: 1536,
      distance: 'cosine',
      url: 'http://localhost:6333', // Default Qdrant port
      timeout: 30000,
      retryAttempts: 3,
      embeddingProvider: 'openai'
    },
    
    autoMigrate: true,
    enableBackup: false,
    maxRetries: 3,
    connectionTimeout: 30000
  },
  
  performance: {
    batchSize: 50,
    maxConcurrentFiles: 10,
    fileOperationTimeout: 30000,
    cacheSize: 1000
  },
  
  api: {
    openaiApiKey: undefined, // Will be loaded from env
    requestTimeout: 30000,
    rateLimitRequests: 50,
    rateLimitWindow: 60000 // 1 minute
  },
  
  analysis: {
    supportedLanguages: [
      'javascript', 'typescript', 'python', 'rust', 'go', 'java', 
      'cpp', 'c', 'csharp', 'svelte', 'sql'
    ],
    maxFileSize: 5 * 1024 * 1024, // 5MB
    skipDirectories: [
      'node_modules', '.git', '.vscode', '.idea', 'dist', 'build', 
      'target', '__pycache__', '.next', '.nuxt'
    ],
    skipFilePatterns: [
      '*.log', '*.tmp', '*.cache', '*.lock', '*.map', '*.min.js',
      '*.bundle.js', '*.chunk.js'
    ]
  },
  
  logging: {
    level: 'info',
    enablePerformanceLogging: false
  },

  environment: 'development'
};

export class EnhancedConfigManager {
  private static instance: EnhancedConfigManager;
  private config: InMemoriaConfig;
  
  private constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this.detectEnvironment();
    this.loadFromEnvironment();
    this.configureStorageByEnvironment();
  }
  
  public static getInstance(): EnhancedConfigManager {
    if (!EnhancedConfigManager.instance) {
      EnhancedConfigManager.instance = new EnhancedConfigManager();
    }
    return EnhancedConfigManager.instance;
  }
  
  private detectEnvironment(): void {
    // Detect environment based on various indicators
    if (process.env.NODE_ENV === 'production') {
      this.config.environment = 'production';
    } else if (process.env.NODE_ENV === 'test') {
      this.config.environment = 'test';
    } else if (process.env.DOCKER_ENV || process.env.KUBERNETES_SERVICE_HOST) {
      this.config.environment = 'production'; // Containerized = production
    } else {
      this.config.environment = 'development';
    }
  }

  private configureStorageByEnvironment(): void {
    switch (this.config.environment) {
      case 'production':
        this.configureProductionStorage();
        break;
      case 'development':
        this.configureDevelopmentStorage();
        break;
      case 'test':
        this.configureTestStorage();
        break;
    }
  }

  private configureProductionStorage(): void {
    this.config.storage.mode = 'remote';
    
    // PostgreSQL for production relational storage
    this.config.storage.relational = {
      type: 'postgresql',
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'in_memoria',
      username: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD,
      ssl: process.env.POSTGRES_SSL === 'true',
      sslMode: process.env.POSTGRES_SSL_MODE as 'disable' | 'allow' | 'prefer' | 'require' | 'verify-ca' | 'verify-full' || undefined,
      sslCert: process.env.POSTGRES_SSL_CERT || undefined,
      poolSize: parseInt(process.env.POSTGRES_POOL_SIZE || '10'),
      timeout: parseInt(process.env.POSTGRES_TIMEOUT || '30000')
    };

    // Qdrant for production vector storage
    this.config.storage.vector = {
      type: 'qdrant',
      url: process.env.QDRANT_URL || 'http://localhost:6333',
      apiKey: process.env.QDRANT_API_KEY,
      collectionName: process.env.QDRANT_COLLECTION || 'in-memoria',
      vectorSize: parseInt(process.env.QDRANT_VECTOR_SIZE || '1536'),
      distance: (process.env.QDRANT_DISTANCE as any) || 'cosine',
      timeout: parseInt(process.env.QDRANT_TIMEOUT || '30000'),
      retryAttempts: parseInt(process.env.QDRANT_RETRY_ATTEMPTS || '3'),
      embeddingProvider: (process.env.EMBEDDING_PROVIDER as any) || 'openai'
    };

    // Enable backups in production
    this.config.storage.enableBackup = true;
  }

  private configureDevelopmentStorage(): void {
    this.config.storage.mode = 'local';
    
    // Check if user wants to use remote storage in development
    if (process.env.IN_MEMORIA_STORAGE_MODE === 'remote') {
      this.configureProductionStorage();
      return;
    }

    // SQLite for development relational storage
    this.config.storage.relational = {
      type: 'sqlite',
      filename: 'in-memoria.db',
      poolSize: 5,
      timeout: 15000
    };

    // Local Qdrant or SurrealDB for development vector storage
    if (process.env.IN_MEMORIA_VECTOR_TYPE === 'qdrant') {
      this.config.storage.vector = {
        type: 'qdrant',
        url: process.env.QDRANT_URL || 'http://localhost:6333',
        collectionName: 'in-memoria-dev',
        vectorSize: 384, // Smaller for local embeddings
        distance: 'cosine',
        timeout: 15000,
        retryAttempts: 2,
        embeddingProvider: 'local' // Use local embeddings in development
      };
    } else {
      this.config.storage.vector = {
        type: 'surrealdb-local',
        collectionName: 'in-memoria-dev',
        vectorSize: 384,
        distance: 'cosine',
        embeddingProvider: 'local'
      };
    }
  }

  private configureTestStorage(): void {
    this.config.storage.mode = 'local';
    
    // In-memory SQLite for tests
    this.config.storage.relational = {
      type: 'sqlite',
      filename: ':memory:',
      poolSize: 1,
      timeout: 5000
    };

    // In-memory SurrealDB for tests
    this.config.storage.vector = {
      type: 'surrealdb-local',
      collectionName: 'in-memoria-test',
      vectorSize: 384,
      distance: 'cosine',
      embeddingProvider: 'local'
    };

    // Disable backups and reduce timeouts for tests
    this.config.storage.enableBackup = false;
    this.config.storage.connectionTimeout = 5000;
    this.config.performance.fileOperationTimeout = 5000;
  }
  
  private loadFromEnvironment(): void {
    // API Keys
    this.config.api.openaiApiKey = process.env.OPENAI_API_KEY;
    
    // Performance settings
    if (process.env.IN_MEMORIA_BATCH_SIZE) {
      this.config.performance.batchSize = parseInt(process.env.IN_MEMORIA_BATCH_SIZE);
    }
    
    if (process.env.IN_MEMORIA_MAX_CONCURRENT_FILES) {
      this.config.performance.maxConcurrentFiles = parseInt(process.env.IN_MEMORIA_MAX_CONCURRENT_FILES);
    }
    
    // Logging
    if (process.env.IN_MEMORIA_LOG_LEVEL) {
      this.config.logging.level = process.env.IN_MEMORIA_LOG_LEVEL as any;
    }
    
    if (process.env.IN_MEMORIA_ENABLE_PERFORMANCE_LOGGING === 'true') {
      this.config.logging.enablePerformanceLogging = true;
    }

    // Storage overrides
    if (process.env.IN_MEMORIA_STORAGE_MODE) {
      this.config.storage.mode = process.env.IN_MEMORIA_STORAGE_MODE as any;
    }
  }
  
  public getConfig(): InMemoriaConfig {
    return { ...this.config };
  }
  
  public getStorageConfig(): StorageProviderConfig {
    return { ...this.config.storage };
  }

  public getRelationalConfig(): RelationalStorageConfig {
    return { ...this.config.storage.relational };
  }

  public getVectorConfig(): VectorStorageConfig {
    return { ...this.config.storage.vector };
  }
  
  public getDatabasePath(projectPath?: string): string {
    if (this.config.storage.relational.type === 'sqlite') {
      const config = this.config.storage.relational;
      if (config.filename === ':memory:') {
        return ':memory:';
      }
      
      const basePath = projectPath || process.cwd();
      return config.path ? 
        `${config.path}/${config.filename}` : 
        `${basePath}/${config.filename}`;
    }
    
    // For PostgreSQL, return connection string or identifier
    return 'postgresql-remote';
  }
  
  public updateConfig(updates: Partial<InMemoriaConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  public isProduction(): boolean {
    return this.config.environment === 'production';
  }

  public isDevelopment(): boolean {
    return this.config.environment === 'development';
  }

  public isTest(): boolean {
    return this.config.environment === 'test';
  }

  public shouldUseRemoteStorage(): boolean {
    return this.config.storage.mode === 'remote';
  }

  public printConfiguration(): void {
    console.log('🔧 In-Memoria Configuration:');
    console.log(`   Environment: ${this.config.environment}`);
    console.log(`   Storage Mode: ${this.config.storage.mode}`);
    console.log(`   Relational: ${this.config.storage.relational.type}`);
    console.log(`   Vector: ${this.config.storage.vector.type}`);
    
    if (this.config.storage.relational.type === 'postgresql') {
      console.log(`   PostgreSQL: ${this.config.storage.relational.host}:${this.config.storage.relational.port}/${this.config.storage.relational.database}`);
    }
    
    if (this.config.storage.vector.type === 'qdrant') {
      console.log(`   Qdrant: ${this.config.storage.vector.url}/${this.config.storage.vector.collectionName}`);
    }
  }

  public validateConfiguration(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate relational storage
    if (this.config.storage.relational.type === 'postgresql') {
      const rel = this.config.storage.relational;
      if (!rel.host) errors.push('PostgreSQL host is required');
      if (!rel.database) errors.push('PostgreSQL database name is required');
      if (!rel.username) errors.push('PostgreSQL username is required');
    }

    // Validate vector storage
    if (this.config.storage.vector.type === 'qdrant') {
      const vec = this.config.storage.vector;
      if (!vec.url) errors.push('Qdrant URL is required');
      if (!vec.collectionName) errors.push('Qdrant collection name is required');
    }

    // Validate API keys for production
    if (this.isProduction()) {
      if (this.config.storage.vector.embeddingProvider === 'openai' && !this.config.api.openaiApiKey) {
        errors.push('OpenAI API key is required for production with OpenAI embeddings');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// Export singleton instance
export const enhancedConfig = EnhancedConfigManager.getInstance();
