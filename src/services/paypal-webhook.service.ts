import crypto from 'crypto';
import { paymentService } from './payment.service';

export class PayPalWebhookService {
  private webhookId: string;
  
  constructor(webhookId: string) {
    this.webhookId = webhookId;
  }

  verifyWebhookSignature(
    authAlgo: string,
    certUrl: string,
    transmissionId: string,
    transmissionSig: string,
    transmissionTime: string,
    webhookEvent: any
  ): boolean {
    // For production, implement PayPal signature verification
    // This is a placeholder - actual implementation requires PayPal SDK
    console.log('PayPal webhook signature verification not implemented');
    return true; // WARNING: Always verify in production!
  }

  async handleWebhookEvent(event: any, db: any) {
    const eventType = event.event_type;
    const resource = event.resource;

    switch (eventType) {
      case 'BILLING.SUBSCRIPTION.CREATED':
        await this.handleSubscriptionCreated(resource, db);
        break;
        
      case 'BILLING.SUBSCRIPTION.ACTIVATED':
        await this.handleSubscriptionActivated(resource, db);
        break;
        
      case 'BILLING.SUBSCRIPTION.CANCELLED':
        await this.handleSubscriptionCancelled(resource, db);
        break;
        
      case 'BILLING.SUBSCRIPTION.EXPIRED':
        await this.handleSubscriptionExpired(resource, db);
        break;
        
      case 'PAYMENT.CAPTURE.COMPLETED':
        await this.handlePaymentCompleted(resource, db);
        break;
        
      default:
        console.log('Unhandled PayPal webhook event:', eventType);
    }
  }

  private async handleSubscriptionCreated(resource: any, db: any) {
    console.log('Subscription created:', resource.id);
    // Initial creation handled by frontend
  }

  private async handleSubscriptionActivated(resource: any, db: any) {
    const subscriptionId = resource.id;
    
    // Update subscription status
    await db.run(`
      UPDATE users 
      SET subscription_status = 'active',
          billing_cycle_start = CURRENT_TIMESTAMP
      WHERE paypal_subscription_id = ?
    `, [subscriptionId]);
    
    console.log('Subscription activated:', subscriptionId);
  }

  private async handleSubscriptionCancelled(resource: any, db: any) {
    const subscriptionId = resource.id;
    
    // Update subscription status
    await db.run(`
      UPDATE users 
      SET subscription_status = 'cancelled'
      WHERE paypal_subscription_id = ?
    `, [subscriptionId]);
    
    console.log('Subscription cancelled:', subscriptionId);
  }

  private async handleSubscriptionExpired(resource: any, db: any) {
    const subscriptionId = resource.id;
    
    // Update subscription status
    await db.run(`
      UPDATE users 
      SET subscription_status = 'expired',
          subscription_plan = NULL,
          hours_limit = 0
      WHERE paypal_subscription_id = ?
    `, [subscriptionId]);
    
    console.log('Subscription expired:', subscriptionId);
  }

  private async handlePaymentCompleted(resource: any, db: any) {
    // Handle one-time payments (credits)
    console.log('Payment completed:', resource.id);
  }
}