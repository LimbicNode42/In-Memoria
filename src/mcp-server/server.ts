import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { CoreAnalysisTools } from './tools/core-analysis.js';
import { IntelligenceTools } from './tools/intelligence-tools.js';
import { AutomationTools } from './tools/automation-tools.js';
import { MonitoringTools } from './tools/monitoring-tools.js';
import { SemanticEngine } from '../engines/semantic-engine.js';
import { PatternEngine } from '../engines/pattern-engine.js';
import { SQLiteDatabase } from '../storage/sqlite-db.js';
import { createRelationalStorage, getRelationalConfigFromEnv } from '../storage/relational-storage-factory.js';
import { createVectorStorage, getStorageConfigFromEnv } from '../storage/storage-factory.js';
import { IVectorStorage } from '../storage/interfaces/IVectorStorage.js';
import { validateInput, VALIDATION_SCHEMAS } from './validation.js';
import { config } from '../config/config.js';

export class CodeCartographerMCP {
  private server: Server;
  private database!: SQLiteDatabase;
  private vectorDB!: IVectorStorage;
  private semanticEngine!: SemanticEngine;
  private patternEngine!: PatternEngine;
  private coreTools!: CoreAnalysisTools;
  private intelligenceTools!: IntelligenceTools;
  private automationTools!: AutomationTools;
  private monitoringTools!: MonitoringTools;

  constructor() {
    this.server = new Server(
      {
        name: 'in-memoria',
        version: '0.4.4',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private async initializeComponents(): Promise<void> {
    try {
      console.error('Initializing In Memoria components...');

      // Initialize storage using configuration management
      // Initialize relational storage (prefer PostgreSQL if available, fallback to SQLite)
      try {
        const relationalConfig = getRelationalConfigFromEnv();
        
        if (relationalConfig.storageProvider === 'postgresql') {
          console.error('PostgreSQL configuration detected, but SQLite will be used for compatibility');
          console.error('Full PostgreSQL support will be available in a future update');
        }
        
        // For now, always use SQLite but in a persistent location when PostgreSQL would be used
        const dbPath = relationalConfig.storageProvider === 'postgresql' 
          ? '/app/data/in-memoria.db'  // Persistent path for production
          : config.getDatabasePath(); // Standard config path for development
          
        console.error(`Attempting to initialize SQLite database at: ${dbPath}`);
        
        this.database = new SQLiteDatabase(dbPath);
        console.error('Relational database initialized successfully');
      } catch (dbError: unknown) {
        console.error('Failed to initialize relational database:', dbError);
        console.error('The MCP server will continue with limited functionality');
        throw new Error(`Database initialization failed: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
      }

      this.vectorDB = await createVectorStorage(getStorageConfigFromEnv());
      await this.vectorDB.initialize();
      console.error('Vector database initialized');

      // Initialize engines
      this.semanticEngine = new SemanticEngine(this.database, this.vectorDB);
      this.patternEngine = new PatternEngine(this.database);
      console.error('Analysis engines initialized');

      // Initialize tool collections
      this.coreTools = new CoreAnalysisTools(this.semanticEngine, this.patternEngine, this.database);
      this.intelligenceTools = new IntelligenceTools(
        this.semanticEngine,
        this.patternEngine,
        this.database,
        this.vectorDB // Pass shared vectorDB instance
      );
      this.automationTools = new AutomationTools(
        this.semanticEngine,
        this.patternEngine,
        this.database
      );
      this.monitoringTools = new MonitoringTools(
        this.semanticEngine,
        this.patternEngine,
        this.database
      );
      console.error('Tool collections initialized');

      console.error('In Memoria components initialized successfully');
    } catch (error: unknown) {
      console.error('Failed to initialize In Memoria components:', error);
      console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
      throw error;
    }
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          ...this.coreTools.tools,
          ...this.intelligenceTools.tools,
          ...this.automationTools.tools,
          ...this.monitoringTools.tools
        ]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Route to appropriate tool handler
        const result = await this.routeToolCall(name, args);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }

        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
  }

  public async routeToolCall(name: string, args: any): Promise<any> {
    // Validate input using Zod schemas
    const schema = VALIDATION_SCHEMAS[name as keyof typeof VALIDATION_SCHEMAS];
    if (schema) {
      args = validateInput(schema, args, name);
    }

    // Core Analysis Tools
    switch (name) {
      case 'analyze_codebase':
        return await this.coreTools.analyzeCodebase(args);

      case 'get_file_content':
        return await this.coreTools.getFileContent(args);

      case 'get_project_structure':
        return await this.coreTools.getProjectStructure(args);

      case 'search_codebase':
        return await this.coreTools.searchCodebase(args);

      case 'generate_documentation':
        return await this.coreTools.generateDocumentation(args);

      // Intelligence Tools
      case 'learn_codebase_intelligence':
        return await this.intelligenceTools.learnCodebaseIntelligence(args);

      case 'get_semantic_insights':
        return await this.intelligenceTools.getSemanticInsights(args);

      case 'get_pattern_recommendations':
        return await this.intelligenceTools.getPatternRecommendations(args);

      case 'predict_coding_approach':
        return await this.intelligenceTools.predictCodingApproach(args);

      case 'get_developer_profile':
        return await this.intelligenceTools.getDeveloperProfile(args);

      case 'contribute_insights':
        return await this.intelligenceTools.contributeInsights(args);

      // Automation Tools
      case 'auto_learn_if_needed':
        return await this.automationTools.autoLearnIfNeeded(args);

      case 'get_learning_status':
        return await this.automationTools.getLearningStatus(args);

      case 'quick_setup':
        return await this.automationTools.quickSetup(args);

      // Monitoring Tools
      case 'get_system_status':
        return await this.monitoringTools.getSystemStatus(args);

      case 'get_intelligence_metrics':
        return await this.monitoringTools.getIntelligenceMetrics(args);

      case 'get_performance_status':
        return await this.monitoringTools.getPerformanceStatus(args);

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}`
        );
    }
  }

  async start(): Promise<void> {
    // Set environment variable to indicate MCP server mode
    process.env.MCP_SERVER = 'true';
    
    await this.initializeComponents();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    console.error('In Memoria MCP Server started');
  }

  /**
   * Initialize components for testing without starting transport
   */
  async initializeForTesting(): Promise<void> {
    await this.initializeComponents();
  }

  async stop(): Promise<void> {
    // Clean up semantic engine resources
    if (this.semanticEngine) {
      this.semanticEngine.cleanup();
    }

    // Close vector database
    if (this.vectorDB) {
      try {
        await this.vectorDB.close();
      } catch (error) {
        console.warn('Warning: Failed to close vector database:', error);
      }
    }

    // Close SQLite database
    if (this.database) {
      this.database.close();
    }

    // Close MCP server
    await this.server.close();
  }
}

// Export for CLI usage
export async function runServer(): Promise<void> {
  const server = new CodeCartographerMCP();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await server.stop();
    process.exit(0);
  });

  await server.start();
}