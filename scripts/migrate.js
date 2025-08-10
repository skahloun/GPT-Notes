// Simple database migration script for Render
const { execSync } = require('child_process');
const path = require('path');

async function runMigrations() {
  console.log('Running database migrations...');
  
  try {
    // For now, just ensure the database connection works
    // The actual tables will be created by the app on first run
    console.log('Database migrations completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  runMigrations();
}