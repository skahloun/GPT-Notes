// Migration to add external_order_id column to payments table
export async function addExternalOrderIdColumn(db: any, isPostgres: boolean) {
  try {
    if (isPostgres) {
      // For PostgreSQL
      await db.query(`
        ALTER TABLE payments 
        ADD COLUMN IF NOT EXISTS external_order_id TEXT
      `);
    } else {
      // For SQLite, check if column exists first
      const tableInfo = await db.all("PRAGMA table_info(payments)");
      const hasColumn = tableInfo.some((col: any) => col.name === 'external_order_id');
      
      if (!hasColumn) {
        await db.run(`
          ALTER TABLE payments 
          ADD COLUMN external_order_id TEXT
        `);
      }
    }
    console.log('Successfully added external_order_id column to payments table');
  } catch (error: any) {
    if (error.message.includes('duplicate column') || error.message.includes('already exists')) {
      console.log('external_order_id column already exists');
    } else {
      console.error('Error adding external_order_id column:', error);
      throw error;
    }
  }
}