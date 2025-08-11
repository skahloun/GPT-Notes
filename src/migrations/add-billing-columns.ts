import { db } from '../config/database';

export async function addBillingColumns() {
  console.log('Running migration: Adding billing columns to users table...');
  
  try {
    // Check if we're using PostgreSQL or SQLite
    const isPostgreSQL = process.env.DATABASE_URL ? true : false;
    
    if (isPostgreSQL) {
      // PostgreSQL - Add columns if they don't exist
      const columnsToAdd = [
        { name: 'subscription_plan', type: 'TEXT' },
        { name: 'subscription_status', type: 'TEXT' },
        { name: 'paypal_subscription_id', type: 'TEXT' },
        { name: 'hours_used_this_month', type: 'DECIMAL(10,2) DEFAULT 0' },
        { name: 'hours_limit', type: 'INTEGER DEFAULT 0' },
        { name: 'credits_balance', type: 'DECIMAL(10,2) DEFAULT 0' },
        { name: 'billing_cycle_start', type: 'TIMESTAMP' },
        { name: 'is_test_account', type: 'INTEGER DEFAULT 0' }
      ];
      
      for (const column of columnsToAdd) {
        try {
          await db.exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${column.name} ${column.type}`);
          console.log(`Added column ${column.name}`);
        } catch (e: any) {
          if (e.message.includes('already exists')) {
            console.log(`Column ${column.name} already exists`);
          } else {
            throw e;
          }
        }
      }
    } else {
      // SQLite - Check which columns exist and add missing ones
      const existingColumns = await db.all("PRAGMA table_info(users)");
      const columnNames = existingColumns.map((col: any) => col.name);
      
      const columnsToAdd = [
        { name: 'subscription_plan', type: 'TEXT' },
        { name: 'subscription_status', type: 'TEXT' },
        { name: 'paypal_subscription_id', type: 'TEXT' },
        { name: 'hours_used_this_month', type: 'REAL DEFAULT 0' },
        { name: 'hours_limit', type: 'INTEGER DEFAULT 0' },
        { name: 'credits_balance', type: 'REAL DEFAULT 0' },
        { name: 'billing_cycle_start', type: 'TEXT' },
        { name: 'is_test_account', type: 'INTEGER DEFAULT 0' }
      ];
      
      for (const column of columnsToAdd) {
        if (!columnNames.includes(column.name)) {
          try {
            await db.exec(`ALTER TABLE users ADD COLUMN ${column.name} ${column.type}`);
            console.log(`Added column ${column.name}`);
          } catch (e: any) {
            console.error(`Failed to add column ${column.name}:`, e.message);
          }
        } else {
          console.log(`Column ${column.name} already exists`);
        }
      }
    }
    
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  addBillingColumns()
    .then(() => {
      console.log('Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}