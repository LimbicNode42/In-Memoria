import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { CodeCartographerMCP } from './server.js';

export interface HttpServerConfig {
  port: number;
  host?: string;
  cors?: {
    origin: string | string[];
    credentials?: boolean;
  };
  enableDnsRebindingProtection?: boolean;
  allowedHosts?: string[];
  allowedOrigins?: string[];
}

export class McpHttpServer {
  private app: express.Application;
  private config: HttpServerConfig;
  private transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};
  private mcpServers: { [sessionId: string]: CodeCartographerMCP } = {};

  constructor(config: HttpServerConfig) {
    this.config = config;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Parse JSON bodies
    this.app.use(express.json());

    // CORS configuration for browser-based clients
    if (this.config.cors) {
      this.app.use(cors({
        origin: this.config.cors.origin,
        credentials: this.config.cors.credentials,
        exposedHeaders: ['Mcp-Session-Id'],
        allowedHeaders: ['Content-Type', 'mcp-session-id'],
      }));
    }
  }

  private setupRoutes(): void {
    // Main MCP endpoint for client-to-server communication
    this.app.post('/mcp', async (req, res) => {
      try {
        await this.handleMcpRequest(req, res);
      } catch (error) {
        console.error('Error handling MCP request:', error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal server error',
            },
            id: null,
          });
        }
      }
    });

    // GET endpoint for server-to-client notifications via SSE
    this.app.get('/mcp', async (req, res) => {
      await this.handleSessionRequest(req, res);
    });

    // DELETE endpoint for session termination
    this.app.delete('/mcp', async (req, res) => {
      await this.handleSessionRequest(req, res);
    });

    // Health check endpoint
    this.app.get('/health', async (req, res) => {
      try {
        const health = {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          version: '0.4.4',
          activeSessions: Object.keys(this.transports).length,
          uptime: process.uptime()
        };
        res.json(health);
      } catch (error) {
        res.status(503).json({
          status: 'unhealthy',
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString()
        });
      }
    });

    // Root endpoint with server info
    this.app.get('/', (req, res) => {
      res.json({
        name: 'In-Memoria MCP Server',
        version: '0.4.4',
        description: 'Model Context Protocol server for In-Memoria',
        endpoints: {
          mcp: '/mcp',
          health: '/health'
        },
        transport: 'streamable-http',
        documentation: 'https://github.com/LimbicNode42/In-Memoria'
      });
    });
  }

  private async handleMcpRequest(req: express.Request, res: express.Response): Promise<void> {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;
    let mcpServer: CodeCartographerMCP;

    if (sessionId && this.transports[sessionId]) {
      // Reuse existing transport and server
      transport = this.transports[sessionId];
      mcpServer = this.mcpServers[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // New initialization request
      console.log('🔗 Creating new MCP session...');
      
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
          console.log(`✅ MCP session initialized: ${sessionId}`);
          this.transports[sessionId] = transport;
        },
        enableDnsRebindingProtection: this.config.enableDnsRebindingProtection,
        allowedHosts: this.config.allowedHosts,
        allowedOrigins: this.config.allowedOrigins,
      });

      // Clean up transport and server when closed
      transport.onclose = () => {
        console.log(`🔌 MCP session closed: ${transport.sessionId}`);
        if (transport.sessionId) {
          delete this.transports[transport.sessionId];
          if (this.mcpServers[transport.sessionId]) {
            this.mcpServers[transport.sessionId].stop().catch(console.error);
            delete this.mcpServers[transport.sessionId];
          }
        }
      };

      // Create new MCP server instance
      mcpServer = new CodeCartographerMCP();
      
      // Initialize components but don't connect transport yet
      await mcpServer.initializeForTesting();
      
      // Store server instance
      if (transport.sessionId) {
        this.mcpServers[transport.sessionId] = mcpServer;
      }

      // Connect to the MCP server
      await mcpServer.connectTransport(transport);
    } else {
      // Invalid request
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No valid session ID provided',
        },
        id: null,
      });
      return;
    }

    // Handle the request
    await transport.handleRequest(req, res, req.body);
  }

  private async handleSessionRequest(req: express.Request, res: express.Response): Promise<void> {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !this.transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    
    const transport = this.transports[sessionId];
    await transport.handleRequest(req, res);
  }

  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const host = this.config.host || 'localhost';
      const server = this.app.listen(this.config.port, host, (error?: Error) => {
        if (error) {
          reject(error);
        } else {
          console.log(`🌐 In-Memoria MCP HTTP Server listening on ${host}:${this.config.port}`);
          console.log(`📡 MCP endpoint: http://${host}:${this.config.port}/mcp`);
          console.log(`💚 Health check: http://${host}:${this.config.port}/health`);
          resolve();
        }
      });

      // Graceful shutdown
      process.on('SIGINT', () => {
        console.log('\n🛑 Shutting down HTTP server...');
        server.close(() => {
          console.log('✅ HTTP server closed');
          process.exit(0);
        });
      });

      process.on('SIGTERM', () => {
        console.log('\n🛑 Shutting down HTTP server...');
        server.close(() => {
          console.log('✅ HTTP server closed');
          process.exit(0);
        });
      });
    });
  }

  public getApp(): express.Application {
    return this.app;
  }
}

// Export function for CLI usage
export async function runHttpServer(): Promise<void> {
  const port = parseInt(process.env.MCP_SERVER_PORT || '3000');
  const host = process.env.HOST || 'localhost';
  const corsOrigin = process.env.CORS_ORIGIN || '*';
  
  const config: HttpServerConfig = {
    port,
    host,
    cors: {
      origin: corsOrigin,
      credentials: false
    },
    enableDnsRebindingProtection: process.env.NODE_ENV === 'production',
    allowedHosts: process.env.ALLOWED_HOSTS?.split(',') || ['127.0.0.1', 'localhost'],
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || []
  };

  console.log('🔧 HTTP Server Configuration:');
  console.log(`   NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`   DNS Rebinding Protection: ${config.enableDnsRebindingProtection}`);
  console.log(`   Allowed Hosts: ${JSON.stringify(config.allowedHosts)}`);
  console.log(`   CORS Origin: ${corsOrigin}`);

  const httpServer = new McpHttpServer(config);
  await httpServer.start();
}
