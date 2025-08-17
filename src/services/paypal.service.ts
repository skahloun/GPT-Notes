import { Client, Environment, OrdersController, PaymentsController, SubscriptionsController, ProductsController, PlansController } from '@paypal/paypal-server-sdk';
import { paymentService } from './payment.service';
import { v4 as uuidv4 } from 'uuid';

export class PayPalService {
  private client: Client;
  private ordersController: OrdersController;
  private subscriptionsController: SubscriptionsController;
  private productsController: ProductsController;
  private plansController: PlansController;
  
  // Plan configuration
  private readonly PLANS = {
    student: {
      name: 'Student Plan',
      description: '10 hours of transcription per month',
      price: '29.99',
      hours: 10,
      billingCycles: [{
        frequency: {
          interval_unit: 'MONTH',
          interval_count: 1
        },
        tenure_type: 'REGULAR',
        sequence: 1,
        total_cycles: 0,
        pricing_scheme: {
          fixed_price: {
            value: '29.99',
            currency_code: 'USD'
          }
        }
      }]
    },
    premium: {
      name: 'Premium Plan',
      description: '30 hours of transcription per month',
      price: '69.99',
      hours: 30,
      billingCycles: [{
        frequency: {
          interval_unit: 'MONTH',
          interval_count: 1
        },
        tenure_type: 'REGULAR',
        sequence: 1,
        total_cycles: 0,
        pricing_scheme: {
          fixed_price: {
            value: '69.99',
            currency_code: 'USD'
          }
        }
      }]
    },
    unlimited: {
      name: 'Unlimited Plan',
      description: '50 hours of transcription per month',
      price: '119.99',
      hours: 50,
      billingCycles: [{
        frequency: {
          interval_unit: 'MONTH',
          interval_count: 1
        },
        tenure_type: 'REGULAR',
        sequence: 1,
        total_cycles: 0,
        pricing_scheme: {
          fixed_price: {
            value: '119.99',
            currency_code: 'USD'
          }
        }
      }]
    }
  };

  constructor() {
    const environment = process.env.PAYPAL_ENVIRONMENT === 'live' 
      ? Environment.Production 
      : Environment.Sandbox;

    this.client = new Client({
      clientCredentials: {
        clientId: process.env.PAYPAL_CLIENT_ID || '',
        clientSecret: process.env.PAYPAL_SECRET || ''
      },
      environment: environment,
      logging: {
        logLevel: process.env.NODE_ENV === 'production' ? 'INFO' : 'DEBUG',
        logRequest: process.env.NODE_ENV !== 'production',
        logResponse: process.env.NODE_ENV !== 'production'
      }
    });

    this.ordersController = new OrdersController(this.client);
    this.subscriptionsController = new SubscriptionsController(this.client);
    this.productsController = new ProductsController(this.client);
    this.plansController = new PlansController(this.client);
  }

  /**
   * Create a one-time payment order for pay-as-you-go credits
   */
  async createOrder(amount: string, userId: string) {
    try {
      const order = await this.ordersController.ordersCreate({
        body: {
          intent: 'CAPTURE',
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
            landingPage: 'LOGIN',
            userAction: 'PAY_NOW',
            returnUrl: `${process.env.APP_URL}/billing?success=true`,
            cancelUrl: `${process.env.APP_URL}/billing?cancelled=true`
          }
        }
      });

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
      const capture = await this.ordersController.ordersCapture({
        id: orderId
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
   * Create or get subscription product
   */
  async ensureProductExists() {
    try {
      // Check if product already exists
      const products = await this.productsController.productsList({
        pageSize: 20,
        page: 1
      });

      const existingProduct = products.result.products?.find(
        p => p.name === 'Class Notes Subscription'
      );

      if (existingProduct) {
        return existingProduct.id;
      }

      // Create new product
      const product = await this.productsController.productsCreate({
        body: {
          id: 'CLASS-NOTES-SUB',
          name: 'Class Notes Subscription',
          description: 'Monthly subscription for Class Notes transcription service',
          type: 'SERVICE',
          category: 'SOFTWARE',
          imageUrl: `${process.env.APP_URL}/icon-192x192.png`,
          homeUrl: process.env.APP_URL
        }
      });

      return product.result.id;
    } catch (error) {
      console.error('Error ensuring product exists:', error);
      throw new Error('Failed to create subscription product');
    }
  }

  /**
   * Create subscription plans in PayPal
   */
  async createSubscriptionPlans() {
    const productId = await this.ensureProductExists();
    const createdPlans: Record<string, string> = {};

    for (const [key, planConfig] of Object.entries(this.PLANS)) {
      try {
        // Check if plan already exists
        const plans = await this.plansController.plansList({
          productId: productId,
          pageSize: 20,
          page: 1
        });

        const existingPlan = plans.result.plans?.find(
          p => p.name === planConfig.name
        );

        if (existingPlan) {
          createdPlans[key] = existingPlan.id!;
          continue;
        }

        // Create new plan
        const plan = await this.plansController.plansCreate({
          body: {
            productId: productId,
            name: planConfig.name,
            description: planConfig.description,
            status: 'ACTIVE',
            billingCycles: planConfig.billingCycles,
            paymentPreferences: {
              autoBillOutstanding: true,
              setupFee: {
                value: '0',
                currencyCode: 'USD'
              },
              setupFeeFailureAction: 'CONTINUE',
              paymentFailureThreshold: 3
            }
          }
        });

        createdPlans[key] = plan.result.id!;
      } catch (error) {
        console.error(`Error creating plan ${key}:`, error);
        throw new Error(`Failed to create subscription plan: ${key}`);
      }
    }

    return createdPlans;
  }

  /**
   * Create a subscription
   */
  async createSubscription(planId: string, userId: string, returnUrl: string, cancelUrl: string) {
    try {
      const subscription = await this.subscriptionsController.subscriptionsCreate({
        body: {
          planId: planId,
          customId: userId,
          applicationContext: {
            brandName: 'Class Notes',
            locale: 'en-US',
            userAction: 'SUBSCRIBE_NOW',
            paymentMethod: {
              payeePreferred: 'IMMEDIATE_PAYMENT_REQUIRED'
            },
            returnUrl: returnUrl,
            cancelUrl: cancelUrl
          }
        }
      });

      return {
        id: subscription.result.id,
        status: subscription.result.status,
        approveUrl: subscription.result.links?.find(link => link.rel === 'approve')?.href
      };
    } catch (error) {
      console.error('Error creating subscription:', error);
      throw new Error('Failed to create subscription');
    }
  }

  /**
   * Get subscription details
   */
  async getSubscription(subscriptionId: string) {
    try {
      const subscription = await this.subscriptionsController.subscriptionsGet({
        id: subscriptionId
      });

      return {
        id: subscription.result.id,
        status: subscription.result.status,
        planId: subscription.result.planId,
        userId: subscription.result.customId,
        nextBillingTime: subscription.result.billingInfo?.nextBillingTime
      };
    } catch (error) {
      console.error('Error getting subscription:', error);
      throw new Error('Failed to get subscription details');
    }
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(subscriptionId: string, reason: string) {
    try {
      await this.subscriptionsController.subscriptionsCancel({
        id: subscriptionId,
        body: {
          reason: reason
        }
      });

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