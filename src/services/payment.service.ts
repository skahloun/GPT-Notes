import { v4 as uuidv4 } from 'uuid';

interface PlanDetails {
  name: string;
  price: number;
  hours: number;
  type: 'subscription' | 'payg';
}

export class PaymentService {
  private plans: Record<string, PlanDetails> = {
    student: { name: 'Student', price: 29.99, hours: 10, type: 'subscription' },
    premium: { name: 'Premium', price: 69.99, hours: 30, type: 'subscription' },
    unlimited: { name: 'Unlimited', price: 119.99, hours: 50, type: 'subscription' },
    payg: { name: 'Pay-as-you-go', price: 2.00, hours: 0, type: 'payg' }
  };

  async createSubscription(userId: string, plan: string, paypalSubscriptionId: string, db: any) {
    const planDetails = this.plans[plan];
    if (!planDetails) throw new Error('Invalid plan');

    const paymentId = uuidv4();
    
    // Record payment
    await db.run(`
      INSERT INTO payments (id, userId, type, amount, paypal_subscription_id, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [paymentId, userId, 'subscription', planDetails.price, paypalSubscriptionId, 'active']);

    // Update user subscription
    await db.run(`
      UPDATE users SET 
        subscription_plan = ?,
        subscription_status = 'active',
        paypal_subscription_id = ?,
        hours_limit = ?,
        hours_used_this_month = 0,
        billing_cycle_start = CURRENT_TIMESTAMP,
        tier = 'premium'
      WHERE id = ?
    `, [plan, paypalSubscriptionId, planDetails.hours, userId]);

    return { success: true, plan: planDetails };
  }

  async addCredits(userId: string, amount: number, orderId: string, db: any) {
    const paymentId = uuidv4();
    
    // Record payment
    await db.run(`
      INSERT INTO payments (id, userId, type, amount, paypal_order_id, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [paymentId, userId, 'credit', amount, orderId, 'completed']);

    // Add credits to user (amount / hourly rate)
    const hours = amount / 2.00; // $2 per hour
    await db.run(`
      UPDATE users SET 
        credits_balance = credits_balance + ?,
        tier = 'payg'
      WHERE id = ?
    `, [hours, userId]);

    return { success: true, creditsAdded: hours };
  }

  async checkUsage(userId: string, durationMinutes: number, db: any): Promise<boolean> {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    
    if (!user) return false;
    
    const hoursToCharge = durationMinutes / 60;
    
    // Check based on user type
    if (user.subscription_plan && user.subscription_status === 'active') {
      // Subscription user - check monthly limit
      if (user.hours_used_this_month + hoursToCharge > user.hours_limit) {
        return false; // Over limit
      }
    } else if (user.tier === 'payg') {
      // Pay-as-you-go - check credits
      if (user.credits_balance < hoursToCharge) {
        return false; // Insufficient credits
      }
    } else {
      // No active plan
      return false;
    }
    
    return true;
  }

  async chargeUsage(userId: string, durationMinutes: number, sessionId: string, db: any) {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    const hoursUsed = durationMinutes / 60;
    const cost = hoursUsed * 2.00; // $2 per hour

    if (user.subscription_plan && user.subscription_status === 'active') {
      // Update monthly usage
      await db.run(`
        UPDATE users SET 
          hours_used_this_month = hours_used_this_month + ?
        WHERE id = ?
      `, [hoursUsed, userId]);
    } else if (user.tier === 'payg') {
      // Deduct from credits
      await db.run(`
        UPDATE users SET 
          credits_balance = credits_balance - ?
        WHERE id = ?
      `, [hoursUsed, userId]);
    }

    // Log the charge
    await db.run(`
      INSERT INTO usage_logs (id, userId, sessionId, service, operation, cost, details)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      uuidv4(),
      userId,
      sessionId,
      'ClassNotes',
      'Transcription',
      cost,
      JSON.stringify({ duration_minutes: durationMinutes, hours_charged: hoursUsed })
    ]);
  }

  async resetMonthlyUsage(db: any) {
    // Reset usage for users whose billing cycle has ended
    await db.run(`
      UPDATE users 
      SET hours_used_this_month = 0,
          billing_cycle_start = CURRENT_TIMESTAMP
      WHERE subscription_status = 'active' 
      AND DATE(billing_cycle_start) <= DATE('now', '-1 month')
    `);
  }
}

export const paymentService = new PaymentService();