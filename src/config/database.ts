import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import pg from 'pg';
import path from 'path';

const { Pool } = pg;

export interface DatabaseConfig {
  type: 'sqlite' | 'postgresql';
  connectionString?: string;
  filename?: string;
}

export class DatabaseAdapter {
  private config: DatabaseConfig;
  private sqliteDb?: Database;
  private pgPool?: pg.Pool;

  constructor() {
    // Determine database type from environment
    if (process.env.DATABASE_URL) {
      this.config = {
        type: 'postgresql',
        connectionString: process.env.DATABASE_URL
      };
    } else {
      this.config = {
        type: 'sqlite',
        filename: path.join(process.cwd(), 'class-notes.db')
      };
    }
  }

  async initialize() {
    if (this.config.type === 'postgresql') {
      this.pgPool = new Pool({
        connectionString: this.config.connectionString,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      });
      await this.createPostgreSQLTables();
    } else {
      this.sqliteDb = await open({
        filename: this.config.filename!,
        driver: sqlite3.Database
      });
      await this.createSQLiteTables();
    }
  }

  // Unified query interface
  async run(query: string, params: any[] = []): Promise<any> {
    if (this.config.type === 'postgresql') {
      const result = await this.pgPool!.query(query, params);
      return { lastID: result.rows[0]?.id };
    } else {
      return await this.sqliteDb!.run(query, params);
    }
  }

  async get(query: string, params: any[] = []): Promise<any> {
    if (this.config.type === 'postgresql') {
      const result = await this.pgPool!.query(query, params);
      return result.rows[0];
    } else {
      return await this.sqliteDb!.get(query, params);
    }
  }

  async all(query: string, params: any[] = []): Promise<any[]> {
    if (this.config.type === 'postgresql') {
      const result = await this.pgPool!.query(query, params);
      return result.rows;
    } else {
      return await this.sqliteDb!.all(query, params);
    }
  }

  // PostgreSQL table creation
  private async createPostgreSQLTables() {
    const queries = [
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        password TEXT,
        tier TEXT DEFAULT 'free',
        google_tokens TEXT,
        is_admin INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP,
        total_sessions INTEGER DEFAULT 0,
        total_aws_cost DECIMAL(10,4) DEFAULT 0.0,
        total_openai_cost DECIMAL(10,4) DEFAULT 0.0
      )`,
      
      `CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        userId TEXT,
        classTitle TEXT,
        dateISO TEXT,
        transcriptPath TEXT,
        docUrl TEXT,
        createdAt TIMESTAMP,
        updatedAt TIMESTAMP,
        duration_minutes DECIMAL(10,2) DEFAULT 0,
        aws_cost DECIMAL(10,4) DEFAULT 0.0,
        openai_cost DECIMAL(10,4) DEFAULT 0.0,
        transcript_length INTEGER DEFAULT 0
      )`,
      
      `CREATE TABLE IF NOT EXISTS usage_logs (
        id TEXT PRIMARY KEY,
        userId TEXT,
        sessionId TEXT,
        service TEXT,
        operation TEXT,
        cost DECIMAL(10,4),
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        details TEXT
      )`,
      
      `CREATE TABLE IF NOT EXISTS cost_reconciliation (
        id TEXT PRIMARY KEY,
        date TEXT,
        service TEXT,
        aws_total_cost DECIMAL(10,4),
        app_estimated_cost DECIMAL(10,4),
        reconciled_at TIMESTAMP,
        details TEXT
      )`,
      
      // Create indexes for better performance
      `CREATE INDEX IF NOT EXISTS idx_sessions_userId ON sessions(userId)`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_createdAt ON sessions(createdAt)`,
      `CREATE INDEX IF NOT EXISTS idx_usage_logs_userId ON usage_logs(userId)`,
      `CREATE INDEX IF NOT EXISTS idx_usage_logs_timestamp ON usage_logs(timestamp)`
    ];

    for (const query of queries) {
      await this.pgPool!.query(query);
    }
  }

  // SQLite table creation (existing)
  private async createSQLiteTables() {
    await this.sqliteDb!.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        password TEXT,
        tier TEXT DEFAULT 'free',
        google_tokens TEXT,
        is_admin INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_login TEXT,
        total_sessions INTEGER DEFAULT 0,
        total_aws_cost REAL DEFAULT 0.0,
        total_openai_cost REAL DEFAULT 0.0
      );
    `);
    
    await this.sqliteDb!.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        userId TEXT,
        classTitle TEXT,
        dateISO TEXT,
        transcriptPath TEXT,
        docUrl TEXT,
        createdAt TEXT,
        updatedAt TEXT,
        duration_minutes REAL DEFAULT 0,
        aws_cost REAL DEFAULT 0.0,
        openai_cost REAL DEFAULT 0.0,
        transcript_length INTEGER DEFAULT 0
      );
    `);
    
    await this.sqliteDb!.exec(`
      CREATE TABLE IF NOT EXISTS usage_logs (
        id TEXT PRIMARY KEY,
        userId TEXT,
        sessionId TEXT,
        service TEXT,
        operation TEXT,
        cost REAL,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
        details TEXT
      );
    `);
    
    await this.sqliteDb!.exec(`
      CREATE TABLE IF NOT EXISTS cost_reconciliation (
        id TEXT PRIMARY KEY,
        date TEXT,
        service TEXT,
        aws_total_cost REAL,
        app_estimated_cost REAL,
        reconciled_at TEXT,
        details TEXT
      );
    `);
  }

  async close() {
    if (this.config.type === 'postgresql') {
      await this.pgPool!.end();
    } else {
      await this.sqliteDb!.close();
    }
  }
}

// Export singleton instance
export const db = new DatabaseAdapter();