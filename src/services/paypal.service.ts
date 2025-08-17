import { 
  Client, 
  Environment, 
  OrdersController,
  CheckoutPaymentIntent,
  OrderApplicationContextLandingPage,
  OrderApplicationContextUserAction
} from '@paypal/paypal-server-sdk';
import { v4 as uuidv4 } from 'uuid';

export class PayPalService {
  private client: Client;
  private ordersController: OrdersController;
  
  // Plan configuration
  private readonly PLANS = {
    student: {
      name: 'Student Plan',
      description: '10 hours of transcription per month',
      price: '29.99',
      hours: 10,
      planId: 'STUDENT_PLAN_ID' // Will be set from environment
    },
    premium: {
      name: 'Premium Plan',
      description: '30 hours of transcription per month',
      price: '69.99',
      hours: 30,
      planId: 'PREMIUM_PLAN_ID' // Will be set from environment
    },
    unlimited: {
      name: 'Unlimited Plan',
      description: '50 hours of transcription per month',
      price: '119.99',
      hours: 50,
      planId: 'UNLIMITED_PLAN_ID' // Will be set from environment
    }
  };

  constructor() {
    const environment = process.env.PAYPAL_ENVIRONMENT === 'live' 
      ? Environment.Production 
      : Environment.Sandbox;

    this.client = new Client({
      clientCredentialsAuthCredentials: {
        oAuthClientId: process.env.PAYPAL_CLIENT_ID || '',
        oAuthClientSecret: process.env.PAYPAL_SECRET || ''
      },
      environment: environment,
      timeout: 30000
    });

    this.ordersController = new OrdersController(this.client);
  }

  /**
   * Create a one-time payment order for pay-as-you-go credits
   */
  async createOrder(amount: string, userId: string) {
    try {
      const order = await this.ordersController.createOrder({
        prefer: 'return=representation',
        body: {
          intent: CheckoutPaymentIntent.Capture,
          purchaseUnits: [{
            amount: {
              currencyCode: 'USD',
              value: amount
            },
            description: `Class Notes - ${parseFloat(amount) / 2} hours of transcription credits`,
            customId: userId,
            referenceId: uuidv4()
          }],
          applicationContext: {
            brandName: 'Class Notes',
            landingPage: OrderApplicationContextLandingPage.Login,
            userAction: OrderApplicationContextUserAction.PayNow,
            returnUrl: `${process.env.APP_URL}/billing?success=true`,
            cancelUrl: `${process.env.APP_URL}/billing?cancelled=true`
          }
        }
      });

      if (!order.result.id) {
        throw new Error('Order ID not returned');
      }

      return {
        id: order.result.id,
        status: order.result.status
      };
    } catch (error) {
      console.error('Error creating PayPal order:', error);
      throw new Error('Failed to create payment order');
    }
  }

  /**
   * Capture a payment after approval
   */
  async captureOrder(orderId: string) {
    try {
      const capture = await this.ordersController.captureOrder({
        id: orderId,
        prefer: 'return=representation'
      });

      return {
        id: capture.result.id,
        status: capture.result.status,
        amount: capture.result.purchaseUnits?.[0]?.payments?.captures?.[0]?.amount?.value,
        userId: capture.result.purchaseUnits?.[0]?.customId
      };
    } catch (error) {
      console.error('Error capturing PayPal order:', error);
      throw new Error('Failed to capture payment');
    }
  }

  /**
   * Get subscription plan IDs (for now, return hardcoded values)
   * In production, these should be created via PayPal API or dashboard
   */
  async createSubscriptionPlans() {
    // Return plan IDs from environment or use defaults
    return {
      student: process.env.PAYPAL_STUDENT_PLAN_ID || 'P-STUDENT-SANDBOX',
      premium: process.env.PAYPAL_PREMIUM_PLAN_ID || 'P-PREMIUM-SANDBOX',
      unlimited: process.env.PAYPAL_UNLIMITED_PLAN_ID || 'P-UNLIMITED-SANDBOX'
    };
  }

  /**
   * Create a subscription (simplified for now)
   * Note: Full subscription management requires additional SDK features
   */
  async createSubscription(planId: string, userId: string, returnUrl: string, cancelUrl: string) {
    try {
      // For now, return a mock subscription
      // In production, use PayPal's subscription API
      return {
        id: `SUB-${uuidv4()}`,
        status: 'APPROVAL_PENDING',
        approveUrl: `https://www.sandbox.paypal.com/checkoutnow?token=TEST-${uuidv4()}`
      };
    } catch (error) {
      console.error('Error creating subscription:', error);
      throw new Error('Failed to create subscription');
    }
  }

  /**
   * Get subscription details (simplified)
   */
  async getSubscription(subscriptionId: string) {
    try {
      // Mock response for now
      return {
        id: subscriptionId,
        status: 'ACTIVE',
        planId: 'PLAN-ID',
        userId: 'USER-ID',
        nextBillingTime: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting subscription:', error);
      throw new Error('Failed to get subscription details');
    }
  }

  /**
   * Cancel a subscription (simplified)
   */
  async cancelSubscription(subscriptionId: string, reason: string) {
    try {
      // Mock cancellation for now
      console.log(`Cancelling subscription ${subscriptionId}: ${reason}`);
      return { success: true };
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      throw new Error('Failed to cancel subscription');
    }
  }

  /**
   * Verify webhook signature
   */
  async verifyWebhookSignature(
    headers: any,
    body: any,
    webhookId: string
  ): Promise<boolean> {
    try {
      // PayPal webhook verification requires specific headers
      const authAlgo = headers['paypal-auth-algo'];
      const certUrl = headers['paypal-cert-url'];
      const transmissionId = headers['paypal-transmission-id'];
      const transmissionSig = headers['paypal-transmission-sig'];
      const transmissionTime = headers['paypal-transmission-time'];

      if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
        console.error('Missing required PayPal webhook headers');
        return false;
      }

      // For now, return true in sandbox mode
      // TODO: Implement proper signature verification
      if (process.env.PAYPAL_ENVIRONMENT !== 'live') {
        console.warn('Webhook signature verification skipped in sandbox mode');
        return true;
      }

      // In production, implement proper verification
      // This would involve fetching the cert from certUrl and verifying the signature
      return false;
    } catch (error) {
      console.error('Error verifying webhook signature:', error);
      return false;
    }
  }
}

export const paypalService = new PayPalService();