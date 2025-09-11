// Type declarations for dynamic imports
declare module 'pg' {
  export class Pool {
    constructor(config: any);
    connect(): Promise<any>;
    end(): Promise<void>;
    query(text: string, params?: any[]): Promise<any>;
  }
  export interface PoolClient {
    query(text: string, params?: any[]): Promise<any>;
    release(): void;
  }
}

declare module 'openai' {
  export default class OpenAI {
    constructor(config: { apiKey: string });
    embeddings: {
      create(params: any): Promise<any>;
    };
  }
}

declare module '@xenova/transformers' {
  export function pipeline(task: string, model: string): Promise<any>;
}

declare module 'better-sqlite3' {
  class Database {
    constructor(filename: string, options?: any);
    prepare(sql: string): any;
    exec(sql: string): any;
    close(): void;
    transaction(fn: () => void): any;
  }
  export = Database;
}
