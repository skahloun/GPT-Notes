export async function renamePayPalColumns(db: any) {
  const queries = [
    // Rename columns in users table
    `ALTER TABLE users RENAME COLUMN paypal_subscription_id TO external_subscription_id`,
    
    // Rename columns in payments table
    `ALTER TABLE payments RENAME COLUMN paypal_subscription_id TO external_subscription_id`,
    `ALTER TABLE payments RENAME COLUMN paypal_order_id TO external_order_id`
  ];

  for (const query of queries) {
    try {
      await db.run(query);
      console.log(`Executed: ${query}`);
    } catch (error: any) {
      // Column might already be renamed
      if (!error.message.includes('no such column')) {
        console.error(`Failed to execute: ${query}`, error);
      }
    }
  }
}