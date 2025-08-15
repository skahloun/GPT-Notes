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
    
    // Run migrations to ensure all columns exist
    await this.runMigrations();
  }

  // Convert SQLite-style ? placeholders to PostgreSQL $1, $2, etc.
  private convertToPostgreSQLQuery(query: string): string {
    let index = 1;
    return query.replace(/\?/g, () => `$${index++}`);
  }

  // Unified query interface
  async run(query: string, params: any[] = []): Promise<any> {
    if (this.config.type === 'postgresql') {
      const pgQuery = this.convertToPostgreSQLQuery(query);
      const result = await this.pgPool!.query(pgQuery, params);
      return { lastID: result.rows[0]?.id };
    } else {
      return await this.sqliteDb!.run(query, params);
    }
  }

  async get(query: string, params: any[] = []): Promise<any> {
    if (this.config.type === 'postgresql') {
      const pgQuery = this.convertToPostgreSQLQuery(query);
      const result = await this.pgPool!.query(pgQuery, params);
      return result.rows[0];
    } else {
      return await this.sqliteDb!.get(query, params);
    }
  }

  async all(query: string, params: any[] = []): Promise<any[]> {
    if (this.config.type === 'postgresql') {
      const pgQuery = this.convertToPostgreSQLQuery(query);
      const result = await this.pgPool!.query(pgQuery, params);
      return result.rows;
    } else {
      return await this.sqliteDb!.all(query, params);
    }
  }

  // Execute query without expecting results (for CREATE TABLE, etc.)
  async exec(query: string): Promise<void> {
    if (this.config.type === 'postgresql') {
      await this.pgPool!.query(query);
    } else {
      await this.sqliteDb!.exec(query);
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
        total_openai_cost DECIMAL(10,4) DEFAULT 0.0,
        subscription_plan TEXT,
        subscription_status TEXT,
        paypal_subscription_id TEXT,
        hours_used_this_month DECIMAL(10,2) DEFAULT 0,
        hours_limit INTEGER DEFAULT 0,
        credits_balance DECIMAL(10,2) DEFAULT 0,
        billing_cycle_start TIMESTAMP,
        is_test_account INTEGER DEFAULT 0
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
      
      `CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        userId TEXT,
        type TEXT,
        amount DECIMAL(10,2),
        currency TEXT DEFAULT 'USD',
        paypal_order_id TEXT,
        paypal_subscription_id TEXT,
        status TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        metadata TEXT
      )`,
      
      // Create indexes for better performance
      `CREATE INDEX IF NOT EXISTS idx_sessions_userId ON sessions(userId)`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_createdAt ON sessions(createdAt)`,
      `CREATE INDEX IF NOT EXISTS idx_usage_logs_userId ON usage_logs(userId)`,
      `CREATE INDEX IF NOT EXISTS idx_usage_logs_timestamp ON usage_logs(timestamp)`,
      `CREATE INDEX IF NOT EXISTS idx_payments_userId ON payments(userId)`
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
        total_openai_cost REAL DEFAULT 0.0,
        subscription_plan TEXT,
        subscription_status TEXT,
        paypal_subscription_id TEXT,
        hours_used_this_month REAL DEFAULT 0,
        hours_limit INTEGER DEFAULT 0,
        credits_balance REAL DEFAULT 0,
        billing_cycle_start TEXT,
        is_test_account INTEGER DEFAULT 0
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
    
    await this.sqliteDb!.exec(`
      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        userId TEXT,
        type TEXT,
        amount REAL,
        currency TEXT DEFAULT 'USD',
        paypal_order_id TEXT,
        paypal_subscription_id TEXT,
        status TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        metadata TEXT
      );
    `);
  }

  // Run database migrations
  private async runMigrations() {
    try {
      // Check if migration is needed by trying to query a new column
      const testQuery = this.config.type === 'postgresql' 
        ? "SELECT subscription_plan FROM users LIMIT 1"
        : "SELECT subscription_plan FROM users LIMIT 1";
      
      try {
        await this.all(testQuery);
        console.log('Database schema is up to date');
      } catch (e: any) {
        if (e.message.includes('subscription_plan')) {
          console.log('Running migrations to update database schema...');
          
          // Add missing columns
          const columnsToAdd = this.config.type === 'postgresql' ? [
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_plan TEXT",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS paypal_subscription_id TEXT",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS hours_used_this_month DECIMAL(10,2) DEFAULT 0",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS hours_limit INTEGER DEFAULT 0",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS credits_balance DECIMAL(10,2) DEFAULT 0",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_cycle_start TIMESTAMP",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_test_account INTEGER DEFAULT 0",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_start_date TIMESTAMP",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMP",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_payment_date TIMESTAMP",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_payment_amount DECIMAL(10,2)"
          ] : [
            "ALTER TABLE users ADD COLUMN subscription_plan TEXT",
            "ALTER TABLE users ADD COLUMN subscription_status TEXT",
            "ALTER TABLE users ADD COLUMN paypal_subscription_id TEXT",
            "ALTER TABLE users ADD COLUMN hours_used_this_month REAL DEFAULT 0",
            "ALTER TABLE users ADD COLUMN hours_limit INTEGER DEFAULT 0",
            "ALTER TABLE users ADD COLUMN credits_balance REAL DEFAULT 0",
            "ALTER TABLE users ADD COLUMN billing_cycle_start TEXT",
            "ALTER TABLE users ADD COLUMN is_test_account INTEGER DEFAULT 0",
            "ALTER TABLE users ADD COLUMN subscription_start_date TEXT",
            "ALTER TABLE users ADD COLUMN subscription_end_date TEXT",
            "ALTER TABLE users ADD COLUMN last_payment_date TEXT",
            "ALTER TABLE users ADD COLUMN last_payment_amount REAL"
          ];
          
          for (const query of columnsToAdd) {
            try {
              await this.exec(query);
              console.log('Executed:', query);
            } catch (alterError: any) {
              if (!alterError.message.includes('already exists') && 
                  !alterError.message.includes('duplicate column')) {
                console.error('Migration query failed:', query, alterError.message);
              }
            }
          }
          
          console.log('Migrations completed');
        }
      }
    } catch (error) {
      console.error('Migration check failed:', error);
    }
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