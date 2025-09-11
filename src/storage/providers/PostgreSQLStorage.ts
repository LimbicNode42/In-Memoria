/**
 * PostgreSQL implementation of relational storage
 * Supports connection pooling, migrations, and async operations
 */

import {
  IRelationalStorage,
  RelationalStorageConfig,
  SemanticConcept,
  DeveloperPattern,
  FileIntelligence,
  AIInsight
} from '../interfaces/IRelationalStorage.js';

// Type definitions for pg client (will be dynamically imported)
interface PgClient {
  connect(): Promise<void>;
  end(): Promise<void>;
  query(text: string, params?: any[]): Promise<any>;
  release(): void;
}

interface PgPool {
  connect(): Promise<PgClient>;
  end(): Promise<void>;
  query(text: string, params?: any[]): Promise<any>;
}

export class PostgreSQLStorage implements IRelationalStorage {
  private config: RelationalStorageConfig;
  private pool: PgPool | null = null;
  private initialized: boolean = false;

  constructor(config: RelationalStorageConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    try {
      // Dynamic import to avoid dependency issues
      const pg = await import('pg').catch(() => {
        throw new Error('PostgreSQL package (pg) is required but not installed. Run: npm install pg');
      });
      const { Pool } = pg as any;
      
      const poolConfig = {
        connectionString: this.config.connectionString || this.buildConnectionString(),
        max: this.config.poolSize || 10,
        idleTimeoutMillis: this.config.timeout || 30000,
        connectionTimeoutMillis: this.config.timeout || 30000,
      };

      this.pool = new Pool(poolConfig);
      
      // Test connection
      const client = await this.pool!.connect();
      await client.query('SELECT NOW()');
      client.release();

      this.initialized = true;
      console.log('✅ PostgreSQL storage initialized');
    } catch (error) {
      console.error('Failed to initialize PostgreSQL:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
    this.initialized = false;
    console.log('🔌 PostgreSQL storage connection closed');
  }

  isReady(): boolean {
    return this.initialized && this.pool !== null;
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    try {
      if (!this.pool) {
        return { healthy: false, message: 'No connection pool available' };
      }

      const result = await this.pool.query('SELECT 1 as health_check');
      if (result.rows[0]?.health_check === 1) {
        return { healthy: true, message: 'PostgreSQL connection healthy' };
      } else {
        return { healthy: false, message: 'Unexpected response from health check' };
      }
    } catch (error) {
      return {
        healthy: false,
        message: `Health check failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  // Semantic Concepts
  async insertSemanticConcept(concept: Omit<SemanticConcept, 'createdAt' | 'updatedAt'>): Promise<void> {
    const query = `
      INSERT INTO semantic_concepts (
        id, concept_name, concept_type, confidence_score,
        relationships, evolution_history, file_path, line_range
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET
        concept_name = EXCLUDED.concept_name,
        concept_type = EXCLUDED.concept_type,
        confidence_score = EXCLUDED.confidence_score,
        relationships = EXCLUDED.relationships,
        evolution_history = EXCLUDED.evolution_history,
        file_path = EXCLUDED.file_path,
        line_range = EXCLUDED.line_range,
        updated_at = CURRENT_TIMESTAMP
    `;

    await this.pool!.query(query, [
      concept.id,
      concept.conceptName,
      concept.conceptType,
      concept.confidenceScore,
      JSON.stringify(concept.relationships),
      JSON.stringify(concept.evolutionHistory),
      concept.filePath,
      JSON.stringify(concept.lineRange)
    ]);
  }

  async getSemanticConcepts(filePath?: string): Promise<SemanticConcept[]> {
    let query = 'SELECT * FROM semantic_concepts';
    let params: any[] = [];

    if (filePath) {
      query += ' WHERE file_path = $1';
      params = [filePath];
    }

    query += ' ORDER BY created_at DESC';

    const result = await this.pool!.query(query, params);
    
    return result.rows.map((row: any) => ({
      id: row.id,
      conceptName: row.concept_name,
      conceptType: row.concept_type,
      confidenceScore: row.confidence_score,
      relationships: JSON.parse(row.relationships || '{}'),
      evolutionHistory: JSON.parse(row.evolution_history || '{}'),
      filePath: row.file_path,
      lineRange: JSON.parse(row.line_range || '{"start": 0, "end": 0}'),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }));
  }

  async updateSemanticConcept(id: string, updates: Partial<SemanticConcept>): Promise<void> {
    const setClause: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (updates.conceptName !== undefined) {
      setClause.push(`concept_name = $${paramIndex++}`);
      params.push(updates.conceptName);
    }
    if (updates.conceptType !== undefined) {
      setClause.push(`concept_type = $${paramIndex++}`);
      params.push(updates.conceptType);
    }
    if (updates.confidenceScore !== undefined) {
      setClause.push(`confidence_score = $${paramIndex++}`);
      params.push(updates.confidenceScore);
    }
    if (updates.relationships !== undefined) {
      setClause.push(`relationships = $${paramIndex++}`);
      params.push(JSON.stringify(updates.relationships));
    }
    if (updates.evolutionHistory !== undefined) {
      setClause.push(`evolution_history = $${paramIndex++}`);
      params.push(JSON.stringify(updates.evolutionHistory));
    }
    if (updates.filePath !== undefined) {
      setClause.push(`file_path = $${paramIndex++}`);
      params.push(updates.filePath);
    }
    if (updates.lineRange !== undefined) {
      setClause.push(`line_range = $${paramIndex++}`);
      params.push(JSON.stringify(updates.lineRange));
    }

    if (setClause.length === 0) {
      return; // No updates to perform
    }

    setClause.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(id);

    const query = `UPDATE semantic_concepts SET ${setClause.join(', ')} WHERE id = $${paramIndex}`;
    await this.pool!.query(query, params);
  }

  async deleteSemanticConcept(id: string): Promise<void> {
    await this.pool!.query('DELETE FROM semantic_concepts WHERE id = $1', [id]);
  }

  // Developer Patterns
  async insertDeveloperPattern(pattern: Omit<DeveloperPattern, 'createdAt' | 'lastSeen'>): Promise<void> {
    const query = `
      INSERT INTO developer_patterns (
        pattern_id, pattern_type, pattern_content, frequency,
        contexts, examples, confidence
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (pattern_id) DO UPDATE SET
        pattern_type = EXCLUDED.pattern_type,
        pattern_content = EXCLUDED.pattern_content,
        frequency = EXCLUDED.frequency,
        contexts = EXCLUDED.contexts,
        examples = EXCLUDED.examples,
        confidence = EXCLUDED.confidence,
        last_seen = CURRENT_TIMESTAMP
    `;

    await this.pool!.query(query, [
      pattern.patternId,
      pattern.patternType,
      JSON.stringify(pattern.patternContent),
      pattern.frequency,
      JSON.stringify(pattern.contexts),
      JSON.stringify(pattern.examples),
      pattern.confidence
    ]);
  }

  async getDeveloperPatterns(patternType?: string): Promise<DeveloperPattern[]> {
    let query = 'SELECT * FROM developer_patterns';
    let params: any[] = [];

    if (patternType) {
      query += ' WHERE pattern_type = $1';
      params = [patternType];
    }

    query += ' ORDER BY frequency DESC, last_seen DESC';

    const result = await this.pool!.query(query, params);
    
    return result.rows.map((row: any) => ({
      patternId: row.pattern_id,
      patternType: row.pattern_type,
      patternContent: JSON.parse(row.pattern_content || '{}'),
      frequency: row.frequency,
      contexts: JSON.parse(row.contexts || '[]'),
      examples: JSON.parse(row.examples || '[]'),
      confidence: row.confidence,
      createdAt: new Date(row.created_at),
      lastSeen: new Date(row.last_seen)
    }));
  }

  async updateDeveloperPattern(patternId: string, updates: Partial<DeveloperPattern>): Promise<void> {
    const setClause: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (updates.patternType !== undefined) {
      setClause.push(`pattern_type = $${paramIndex++}`);
      params.push(updates.patternType);
    }
    if (updates.patternContent !== undefined) {
      setClause.push(`pattern_content = $${paramIndex++}`);
      params.push(JSON.stringify(updates.patternContent));
    }
    if (updates.frequency !== undefined) {
      setClause.push(`frequency = $${paramIndex++}`);
      params.push(updates.frequency);
    }
    if (updates.contexts !== undefined) {
      setClause.push(`contexts = $${paramIndex++}`);
      params.push(JSON.stringify(updates.contexts));
    }
    if (updates.examples !== undefined) {
      setClause.push(`examples = $${paramIndex++}`);
      params.push(JSON.stringify(updates.examples));
    }
    if (updates.confidence !== undefined) {
      setClause.push(`confidence = $${paramIndex++}`);
      params.push(updates.confidence);
    }

    if (setClause.length === 0) {
      return;
    }

    setClause.push(`last_seen = CURRENT_TIMESTAMP`);
    params.push(patternId);

    const query = `UPDATE developer_patterns SET ${setClause.join(', ')} WHERE pattern_id = $${paramIndex}`;
    await this.pool!.query(query, params);
  }

  async deleteDeveloperPattern(patternId: string): Promise<void> {
    await this.pool!.query('DELETE FROM developer_patterns WHERE pattern_id = $1', [patternId]);
  }

  // File Intelligence
  async insertFileIntelligence(fileIntel: Omit<FileIntelligence, 'createdAt'>): Promise<void> {
    const query = `
      INSERT INTO file_intelligence (
        file_path, file_hash, semantic_concepts, patterns_used,
        complexity_metrics, dependencies, last_analyzed
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (file_path) DO UPDATE SET
        file_hash = EXCLUDED.file_hash,
        semantic_concepts = EXCLUDED.semantic_concepts,
        patterns_used = EXCLUDED.patterns_used,
        complexity_metrics = EXCLUDED.complexity_metrics,
        dependencies = EXCLUDED.dependencies,
        last_analyzed = EXCLUDED.last_analyzed
    `;

    await this.pool!.query(query, [
      fileIntel.filePath,
      fileIntel.fileHash,
      JSON.stringify(fileIntel.semanticConcepts),
      JSON.stringify(fileIntel.patternsUsed),
      JSON.stringify(fileIntel.complexityMetrics),
      JSON.stringify(fileIntel.dependencies),
      fileIntel.lastAnalyzed
    ]);
  }

  async getFileIntelligence(filePath: string): Promise<FileIntelligence | null> {
    const result = await this.pool!.query('SELECT * FROM file_intelligence WHERE file_path = $1', [filePath]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      filePath: row.file_path,
      fileHash: row.file_hash,
      semanticConcepts: JSON.parse(row.semantic_concepts || '[]'),
      patternsUsed: JSON.parse(row.patterns_used || '[]'),
      complexityMetrics: JSON.parse(row.complexity_metrics || '{}'),
      dependencies: JSON.parse(row.dependencies || '[]'),
      lastAnalyzed: new Date(row.last_analyzed),
      createdAt: new Date(row.created_at)
    };
  }

  async updateFileIntelligence(filePath: string, updates: Partial<FileIntelligence>): Promise<void> {
    const setClause: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (updates.fileHash !== undefined) {
      setClause.push(`file_hash = $${paramIndex++}`);
      params.push(updates.fileHash);
    }
    if (updates.semanticConcepts !== undefined) {
      setClause.push(`semantic_concepts = $${paramIndex++}`);
      params.push(JSON.stringify(updates.semanticConcepts));
    }
    if (updates.patternsUsed !== undefined) {
      setClause.push(`patterns_used = $${paramIndex++}`);
      params.push(JSON.stringify(updates.patternsUsed));
    }
    if (updates.complexityMetrics !== undefined) {
      setClause.push(`complexity_metrics = $${paramIndex++}`);
      params.push(JSON.stringify(updates.complexityMetrics));
    }
    if (updates.dependencies !== undefined) {
      setClause.push(`dependencies = $${paramIndex++}`);
      params.push(JSON.stringify(updates.dependencies));
    }
    if (updates.lastAnalyzed !== undefined) {
      setClause.push(`last_analyzed = $${paramIndex++}`);
      params.push(updates.lastAnalyzed);
    }

    if (setClause.length === 0) {
      return;
    }

    params.push(filePath);
    const query = `UPDATE file_intelligence SET ${setClause.join(', ')} WHERE file_path = $${paramIndex}`;
    await this.pool!.query(query, params);
  }

  async deleteFileIntelligence(filePath: string): Promise<void> {
    await this.pool!.query('DELETE FROM file_intelligence WHERE file_path = $1', [filePath]);
  }

  // AI Insights
  async insertAIInsight(insight: Omit<AIInsight, 'createdAt'>): Promise<void> {
    const query = `
      INSERT INTO ai_insights (
        insight_id, insight_type, insight_content, confidence_score,
        source_agent, validation_status, impact_prediction
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;

    await this.pool!.query(query, [
      insight.insightId,
      insight.insightType,
      JSON.stringify(insight.insightContent),
      insight.confidenceScore,
      insight.sourceAgent,
      insight.validationStatus,
      JSON.stringify(insight.impactPrediction)
    ]);
  }

  async getAIInsights(insightType?: string): Promise<AIInsight[]> {
    let query = 'SELECT * FROM ai_insights';
    let params: any[] = [];

    if (insightType) {
      query += ' WHERE insight_type = $1';
      params = [insightType];
    }

    query += ' ORDER BY created_at DESC';

    const result = await this.pool!.query(query, params);
    
    return result.rows.map((row: any) => ({
      insightId: row.insight_id,
      insightType: row.insight_type,
      insightContent: JSON.parse(row.insight_content || '{}'),
      confidenceScore: row.confidence_score,
      sourceAgent: row.source_agent,
      validationStatus: row.validation_status,
      impactPrediction: JSON.parse(row.impact_prediction || '{}'),
      createdAt: new Date(row.created_at)
    }));
  }

  async updateAIInsight(insightId: string, updates: Partial<AIInsight>): Promise<void> {
    const setClause: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (updates.insightType !== undefined) {
      setClause.push(`insight_type = $${paramIndex++}`);
      params.push(updates.insightType);
    }
    if (updates.insightContent !== undefined) {
      setClause.push(`insight_content = $${paramIndex++}`);
      params.push(JSON.stringify(updates.insightContent));
    }
    if (updates.confidenceScore !== undefined) {
      setClause.push(`confidence_score = $${paramIndex++}`);
      params.push(updates.confidenceScore);
    }
    if (updates.sourceAgent !== undefined) {
      setClause.push(`source_agent = $${paramIndex++}`);
      params.push(updates.sourceAgent);
    }
    if (updates.validationStatus !== undefined) {
      setClause.push(`validation_status = $${paramIndex++}`);
      params.push(updates.validationStatus);
    }
    if (updates.impactPrediction !== undefined) {
      setClause.push(`impact_prediction = $${paramIndex++}`);
      params.push(JSON.stringify(updates.impactPrediction));
    }

    if (setClause.length === 0) {
      return;
    }

    params.push(insightId);
    const query = `UPDATE ai_insights SET ${setClause.join(', ')} WHERE insight_id = $${paramIndex}`;
    await this.pool!.query(query, params);
  }

  async deleteAIInsight(insightId: string): Promise<void> {
    await this.pool!.query('DELETE FROM ai_insights WHERE insight_id = $1', [insightId]);
  }

  // Batch operations
  async insertSemanticConceptsBatch(concepts: Omit<SemanticConcept, 'createdAt' | 'updatedAt'>[]): Promise<void> {
    if (concepts.length === 0) return;

    const client = await this.pool!.connect();
    try {
      await client.query('BEGIN');
      
      for (const concept of concepts) {
        await this.insertSemanticConcept(concept);
      }
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async insertDeveloperPatternsBatch(patterns: Omit<DeveloperPattern, 'createdAt' | 'lastSeen'>[]): Promise<void> {
    if (patterns.length === 0) return;

    const client = await this.pool!.connect();
    try {
      await client.query('BEGIN');
      
      for (const pattern of patterns) {
        await this.insertDeveloperPattern(pattern);
      }
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Migration and maintenance
  async runMigrations(): Promise<void> {
    // Create migrations table if it doesn't exist
    await this.pool!.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Run initial schema creation
    await this.createSchema();
    
    console.log('✅ PostgreSQL migrations completed');
  }

  async getCurrentSchemaVersion(): Promise<number> {
    try {
      const result = await this.pool!.query('SELECT MAX(version) as version FROM migrations');
      return result.rows[0]?.version || 0;
    } catch (error) {
      return 0;
    }
  }

  async backupData(): Promise<string> {
    // This would typically use pg_dump or similar
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupId = `postgresql-backup-${timestamp}`;
    
    // Placeholder for actual backup implementation
    console.log(`Creating backup: ${backupId}`);
    
    return backupId;
  }

  async restoreData(backupId: string): Promise<void> {
    // Placeholder for actual restore implementation
    console.log(`Restoring from backup: ${backupId}`);
  }

  private buildConnectionString(): string {
    const { host, port, database, username, password, ssl, sslMode, sslCert } = this.config;
    
    if (!host || !database || !username) {
      throw new Error('PostgreSQL connection requires host, database, and username');
    }

    let connectionString = `postgresql://${username}`;
    
    if (password) {
      connectionString += `:${password}`;
    }
    
    connectionString += `@${host}`;
    
    if (port) {
      connectionString += `:${port}`;
    }
    
    connectionString += `/${database}`;
    
    // Handle SSL configuration
    const sslParams: string[] = [];
    
    if (ssl || sslMode) {
      if (sslMode) {
        sslParams.push(`sslmode=${sslMode}`);
      } else if (ssl) {
        sslParams.push('ssl=true');
      }
      
      if (sslCert && sslMode === 'verify-full') {
        sslParams.push(`sslrootcert=${sslCert}`);
      }
    }
    
    if (sslParams.length > 0) {
      connectionString += '?' + sslParams.join('&');
    }
    
    return connectionString;
  }

  private async createSchema(): Promise<void> {
    const schemas = [
      // Semantic concepts table
      `CREATE TABLE IF NOT EXISTS semantic_concepts (
        id TEXT PRIMARY KEY,
        concept_name TEXT NOT NULL,
        concept_type TEXT NOT NULL,
        confidence_score REAL DEFAULT 0.0,
        relationships JSONB,
        evolution_history JSONB,
        file_path TEXT,
        line_range JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // Developer patterns table
      `CREATE TABLE IF NOT EXISTS developer_patterns (
        pattern_id TEXT PRIMARY KEY,
        pattern_type TEXT NOT NULL,
        pattern_content JSONB NOT NULL,
        frequency INTEGER DEFAULT 0,
        contexts JSONB,
        examples JSONB,
        confidence REAL DEFAULT 0.0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // File intelligence table
      `CREATE TABLE IF NOT EXISTS file_intelligence (
        file_path TEXT PRIMARY KEY,
        file_hash TEXT NOT NULL,
        semantic_concepts JSONB,
        patterns_used JSONB,
        complexity_metrics JSONB,
        dependencies JSONB,
        last_analyzed TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // AI insights table
      `CREATE TABLE IF NOT EXISTS ai_insights (
        insight_id TEXT PRIMARY KEY,
        insight_type TEXT NOT NULL,
        insight_content JSONB NOT NULL,
        confidence_score REAL DEFAULT 0.0,
        source_agent TEXT,
        validation_status TEXT DEFAULT 'pending',
        impact_prediction JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // Indexes for performance
      `CREATE INDEX IF NOT EXISTS idx_semantic_concepts_file_path ON semantic_concepts(file_path)`,
      `CREATE INDEX IF NOT EXISTS idx_semantic_concepts_concept_type ON semantic_concepts(concept_type)`,
      `CREATE INDEX IF NOT EXISTS idx_developer_patterns_pattern_type ON developer_patterns(pattern_type)`,
      `CREATE INDEX IF NOT EXISTS idx_file_intelligence_last_analyzed ON file_intelligence(last_analyzed)`,
      `CREATE INDEX IF NOT EXISTS idx_ai_insights_type ON ai_insights(insight_type)`,
      `CREATE INDEX IF NOT EXISTS idx_ai_insights_confidence ON ai_insights(confidence_score DESC)`
    ];

    for (const schema of schemas) {
      await this.pool!.query(schema);
    }
  }
}
