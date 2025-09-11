/**
 * Relational Storage Factory - Creates appropriate storage providers based on environment
 * Provides fallback mechanisms between PostgreSQL (production) and SQLite (local)
 */

import { IRelationalStorage, RelationalStorageConfig } from './interfaces/IRelationalStorage.js';
import { PostgreSQLStorage } from './providers/PostgreSQLStorage.js';
import { SQLiteDatabase } from './sqlite-db.js';

/**
 * Relational storage configuration based on environment variables
 */
export interface RelationalConfig {
  // Storage provider selection
  storageProvider: 'postgresql' | 'sqlite';
  
  // PostgreSQL configuration
  postgresql?: {
    host: string;
    port?: number;
    database: string;
    username: string;
    password: string;
    ssl?: boolean;
    sslMode?: 'disable' | 'allow' | 'prefer' | 'require' | 'verify-ca' | 'verify-full';
    sslCert?: string;
    poolSize?: number;
  };
  
  // SQLite configuration
  sqlite?: {
    filename: string;
    path?: string;
  };
}

/**
 * Creates relational storage instance based on configuration
 */
export async function createRelationalStorage(config: RelationalConfig): Promise<IRelationalStorage> {
  const { storageProvider } = config;
  
  console.log(`Initializing relational storage provider: ${storageProvider}`);
  
  switch (storageProvider) {
    case 'postgresql':
      if (!config.postgresql) {
        throw new Error('PostgreSQL configuration is required for postgresql storage provider');
      }
      
      const pgConfig: RelationalStorageConfig = {
        type: 'postgresql',
        host: config.postgresql.host,
        port: config.postgresql.port || 5432,
        database: config.postgresql.database,
        username: config.postgresql.username,
        password: config.postgresql.password,
        ssl: config.postgresql.ssl,
        sslMode: config.postgresql.sslMode,
        sslCert: config.postgresql.sslCert,
        poolSize: config.postgresql.poolSize || 10
      };
      
      return new PostgreSQLStorage(pgConfig);
    
    case 'sqlite':
      if (!config.sqlite) {
        throw new Error('SQLite configuration is required for sqlite storage provider');
      }
      
      // SQLiteDatabase implements IRelationalStorage interface
      const dbPath = config.sqlite.path ? 
        `${config.sqlite.path}/${config.sqlite.filename}` : 
        config.sqlite.filename;
      return new SQLiteDatabase(dbPath) as unknown as IRelationalStorage;
    
    default:
      throw new Error(`Unknown relational storage provider: ${storageProvider}`);
  }
}

/**
 * Gets relational storage configuration from environment variables
 */
export function getRelationalConfigFromEnv(): RelationalConfig {
  // Determine storage provider based on environment
  let storageProvider: RelationalConfig['storageProvider'] = 'sqlite'; // Default to SQLite for local development
  
  // Auto-detect based on available PostgreSQL configuration
  if (process.env.POSTGRES_HOST && process.env.POSTGRES_DB && 
      process.env.POSTGRES_USER && process.env.POSTGRES_PASSWORD) {
    storageProvider = 'postgresql';
    console.log('🐘 PostgreSQL configuration detected, using PostgreSQL storage');
  } else {
    console.log('📁 No PostgreSQL configuration found, using SQLite storage');
  }
  
  // Override if explicitly set
  if (process.env.RELATIONAL_PROVIDER) {
    storageProvider = process.env.RELATIONAL_PROVIDER as RelationalConfig['storageProvider'];
  }
  
  return {
    storageProvider,
    
    // PostgreSQL configuration
    postgresql: (storageProvider === 'postgresql' && process.env.POSTGRES_HOST) ? {
      host: process.env.POSTGRES_HOST,
      port: process.env.POSTGRES_PORT ? parseInt(process.env.POSTGRES_PORT) : 5432,
      database: process.env.POSTGRES_DB!,
      username: process.env.POSTGRES_USER!,
      password: process.env.POSTGRES_PASSWORD!,
      ssl: process.env.POSTGRES_SSL === 'true',
      sslMode: process.env.POSTGRES_SSL_MODE as any || 'prefer',
      sslCert: process.env.POSTGRES_SSL_CERT,
      poolSize: process.env.POSTGRES_POOL_SIZE ? parseInt(process.env.POSTGRES_POOL_SIZE) : 10
    } : undefined,
    
    // SQLite configuration (fallback or explicit)
    sqlite: (storageProvider === 'sqlite') ? {
      filename: process.env.SQLITE_FILENAME || '/app/data/in-memoria.db', // Use persistent volume path
      path: process.env.SQLITE_PATH
    } : undefined
  };
}
