// Simple migration script to add billing columns
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'class-notes.db');
const db = new sqlite3.Database(dbPath);

const migrations = [
  "ALTER TABLE users ADD COLUMN subscription_plan TEXT",
  "ALTER TABLE users ADD COLUMN subscription_status TEXT", 
  "ALTER TABLE users ADD COLUMN paypal_subscription_id TEXT",
  "ALTER TABLE users ADD COLUMN hours_used_this_month REAL DEFAULT 0",
  "ALTER TABLE users ADD COLUMN hours_limit INTEGER DEFAULT 0",
  "ALTER TABLE users ADD COLUMN credits_balance REAL DEFAULT 0",
  "ALTER TABLE users ADD COLUMN billing_cycle_start TEXT",
  "ALTER TABLE users ADD COLUMN is_test_account INTEGER DEFAULT 0"
];

console.log('Running database migrations...');

let completed = 0;
migrations.forEach((query, index) => {
  db.run(query, (err) => {
    if (err) {
      if (err.message.includes('duplicate column')) {
        console.log(`Column already exists (${index + 1}/${migrations.length})`);
      } else {
        console.error(`Failed migration ${index + 1}:`, err.message);
      }
    } else {
      console.log(`Migration ${index + 1}/${migrations.length} completed`);
    }
    
    completed++;
    if (completed === migrations.length) {
      console.log('All migrations completed');
      db.close();
    }
  });
});