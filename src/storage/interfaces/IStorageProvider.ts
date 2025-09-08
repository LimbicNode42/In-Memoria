/**
 * Main storage provider interface that combines relational and vector storage
 */

import { IRelationalStorage, RelationalStorageConfig } from './IRelationalStorage.js';
import { IVectorStorage, VectorStorageConfig } from './IVectorStorage.js';

export interface StorageProviderConfig {
  // Storage mode selection
  mode: 'local' | 'remote' | 'hybrid';
  
  // Provider configuration
  relational: RelationalStorageConfig;
  vector: VectorStorageConfig;
  
  // Common options
  autoMigrate?: boolean;
  enableBackup?: boolean;
  backupInterval?: number; // minutes
  maxRetries?: number;
  connectionTimeout?: number;
  
  // Development options
  development?: {
    enableDevTools?: boolean;
    logQueries?: boolean;
    seedData?: boolean;
  };
}

export interface StorageHealth {
  relational: {
    healthy: boolean;
    message?: string;
    latency?: number;
  };
  vector: {
    healthy: boolean;
    message?: string;
    latency?: number;
  };
  overall: boolean;
}

export interface StorageStats {
  relational: {
    concepts: number;
    patterns: number;
    files: number;
    insights: number;
  };
  vector: {
    documents: number;
    indexSize: number;
    memoryUsage?: number;
  };
  lastUpdated: Date;
}

export interface IStorageProvider {
  /**
   * Get the relational storage instance
   */
  getRelationalStorage(): IRelationalStorage;

  /**
   * Get the vector storage instance
   */
  getVectorStorage(): IVectorStorage;

  /**
   * Initialize both storage systems
   */
  initialize(): Promise<void>;

  /**
   * Close all storage connections
   */
  close(): Promise<void>;

  /**
   * Check health of all storage systems
   */
  healthCheck(): Promise<StorageHealth>;

  /**
   * Get combined statistics from all storage systems
   */
  getStats(): Promise<StorageStats>;

  /**
   * Run maintenance tasks (migrations, optimization, cleanup)
   */
  runMaintenance(): Promise<void>;

  /**
   * Create a complete backup of all data
   */
  createBackup(): Promise<{
    backupId: string;
    relationalBackup: string;
    vectorBackup: any;
    createdAt: Date;
  }>;

  /**
   * Restore from a complete backup
   */
  restoreBackup(backupId: string): Promise<void>;

  /**
   * Migrate data from another storage provider
   */
  migrateFrom(sourceProvider: IStorageProvider): Promise<void>;
}

export enum StorageEventType {
  INITIALIZED = 'initialized',
  CONNECTION_LOST = 'connection_lost',
  CONNECTION_RESTORED = 'connection_restored',
  BACKUP_CREATED = 'backup_created',
  MIGRATION_STARTED = 'migration_started',
  MIGRATION_COMPLETED = 'migration_completed',
  ERROR = 'error'
}

export interface StorageEvent {
  type: StorageEventType;
  timestamp: Date;
  data?: any;
  error?: Error;
}

export interface IStorageEventListener {
  onStorageEvent(event: StorageEvent): void;
}
