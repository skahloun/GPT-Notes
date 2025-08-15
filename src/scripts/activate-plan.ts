// Manual plan activation script
// Usage: npm run activate-plan <email> <plan>

import { DatabaseAdapter } from '../config/database';

async function activatePlan(email: string, plan: string) {
    const db = new DatabaseAdapter();
    await db.initialize();
    
    const planMapping: any = {
        'student': { hours: 10, price: 29.99 },
        'premium': { hours: 30, price: 69.99 },
        'unlimited': { hours: 50, price: 119.99 }
    };
    
    if (!planMapping[plan]) {
        console.error('Invalid plan. Use: student, premium, or unlimited');
        process.exit(1);
    }
    
    try {
        // Get user by email
        const user = await db.get('SELECT id FROM users WHERE email = ?', [email]);
        
        if (!user) {
            console.error('User not found:', email);
            process.exit(1);
        }
        
        // Update user's subscription
        await db.run(
            `UPDATE users SET 
                subscription_plan = ?, 
                subscription_status = 'active',
                subscription_start_date = datetime('now'),
                subscription_end_date = datetime('now', '+1 month'),
                hours_limit = ?,
                hours_used_this_month = 0,
                last_payment_date = datetime('now'),
                last_payment_amount = ?
            WHERE id = ?`,
            [plan, planMapping[plan].hours, planMapping[plan].price, user.id]
        );
        
        console.log(`✅ Successfully activated ${plan} plan for ${email}`);
        console.log(`   - Hours limit: ${planMapping[plan].hours}`);
        console.log(`   - Valid until: 1 month from now`);
        
    } catch (error) {
        console.error('Error activating plan:', error);
        process.exit(1);
    }
    
    process.exit(0);
}

// Get command line arguments
const email = process.argv[2];
const plan = process.argv[3];

if (!email || !plan) {
    console.log('Usage: npm run activate-plan <email> <plan>');
    console.log('Plans: student, premium, unlimited');
    process.exit(1);
}

activatePlan(email, plan);