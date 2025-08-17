import { Router, Request, Response } from 'express';
import { paypalService } from '../services/paypal.service';
import { paymentService } from '../services/payment.service';
import { PayPalWebhookService } from '../services/paypal-webhook.service';
import { db } from '../config/database';

// Define request interface with user
interface AuthRequest extends Request {
  user?: { uid: string };
}

const router = Router();
const webhookService = new PayPalWebhookService(process.env.PAYPAL_WEBHOOK_ID || '');

// Initialize PayPal plans on startup
let plansInitialized = false;
let planIds: Record<string, string> = {};

async function ensurePlansExist() {
  if (!plansInitialized) {
    try {
      planIds = await paypalService.createSubscriptionPlans();
      plansInitialized = true;
      console.log('PayPal plans initialized:', planIds);
    } catch (error) {
      console.error('Failed to initialize PayPal plans:', error);
    }
  }
  return planIds;
}

// Create order for one-time payment
router.post('/create-order', async (req: AuthRequest, res: Response) => {
  try {
    const { amount } = req.body;
    
    console.log('Create order request:', { 
      amount, 
      userId: req.user?.uid,
      hasUser: !!req.user 
    });
    
    if (!req.user?.uid) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (!amount || parseFloat(amount) < 10) {
      return res.status(400).json({ error: 'Minimum payment is $10' });
    }

    const order = await paypalService.createOrder(amount, req.user.uid);
    res.json(order);
  } catch (error: any) {
    console.error('Route error creating order:', {
      message: error.message,
      stack: error.stack
    });
    
    // Return appropriate status code based on error
    if (error.message.includes('authentication')) {
      res.status(401).json({ error: error.message });
    } else if (error.message.includes('Invalid')) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message || 'Failed to create order' });
    }
  }
});

// Capture order after approval
router.post('/capture-order', async (req: AuthRequest, res: Response) => {
  try {
    const { orderId } = req.body;
    
    if (!orderId) {
      return res.status(400).json({ error: 'Order ID required' });
    }

    const capture = await paypalService.captureOrder(orderId);
    
    // Add credits to user account
    if (capture.status === 'COMPLETED' && capture.amount) {
      await paymentService.addCredits(
        req.user!.uid,
        parseFloat(capture.amount),
        orderId,
        db
      );
    }

    res.json(capture);
  } catch (error: any) {
    console.error('Error capturing order:', error);
    res.status(500).json({ error: error.message || 'Failed to capture order' });
  }
});

// Create subscription
router.post('/create-subscription', async (req: AuthRequest, res: Response) => {
  try {
    const { plan } = req.body;
    const plans = await ensurePlansExist();
    
    if (!plan || !plans[plan]) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    const returnUrl = `${process.env.APP_URL}/billing?subscription=success&plan=${plan}`;
    const cancelUrl = `${process.env.APP_URL}/billing?subscription=cancelled`;

    const subscription = await paypalService.createSubscription(
      plans[plan],
      req.user!.uid,
      returnUrl,
      cancelUrl
    );

    res.json(subscription);
  } catch (error: any) {
    console.error('Error creating subscription:', error);
    res.status(500).json({ error: error.message || 'Failed to create subscription' });
  }
});

// Activate subscription after approval
router.post('/activate-subscription', async (req: AuthRequest, res: Response) => {
  try {
    const { subscriptionId, plan } = req.body;
    
    if (!subscriptionId || !plan) {
      return res.status(400).json({ error: 'Subscription ID and plan required' });
    }

    // Verify subscription with PayPal
    const subscription = await paypalService.getSubscription(subscriptionId);
    
    if (subscription.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Subscription not active' });
    }

    // Activate in our system
    const result = await paymentService.activateSubscription(
      req.user!.uid,
      plan,
      subscriptionId,
      db
    );

    res.json(result);
  } catch (error: any) {
    console.error('Error activating subscription:', error);
    res.status(500).json({ error: error.message || 'Failed to activate subscription' });
  }
});

// Cancel subscription
router.post('/cancel-subscription', async (req: AuthRequest, res: Response) => {
  try {
    const user = await db.get(
      'SELECT external_subscription_id FROM users WHERE id = ?',
      [req.user!.uid]
    );

    if (!user?.external_subscription_id) {
      return res.status(400).json({ error: 'No active subscription found' });
    }

    await paypalService.cancelSubscription(
      user.external_subscription_id,
      'User requested cancellation'
    );

    // Update local status
    await db.run(
      'UPDATE users SET subscription_status = ? WHERE id = ?',
      ['cancelled', req.user!.uid]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({ error: error.message || 'Failed to cancel subscription' });
  }
});

// Webhook endpoint
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const headers = req.headers;
    const event = req.body;

    // Verify webhook signature
    const isValid = await webhookService.verifyWebhookSignature(headers, event);
    
    if (!isValid && process.env.PAYPAL_ENVIRONMENT === 'live') {
      console.error('Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Process webhook event
    await webhookService.handleWebhookEvent(event, db);
    
    res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Get available plans
router.get('/plans', async (_req: Request, res: Response) => {
  try {
    const plans = await ensurePlansExist();
    res.json({
      plans: {
        student: { 
          id: plans.student, 
          name: 'Student Plan', 
          price: '29.99', 
          hours: 10 
        },
        premium: { 
          id: plans.premium, 
          name: 'Premium Plan', 
          price: '69.99', 
          hours: 30 
        },
        unlimited: { 
          id: plans.unlimited, 
          name: 'Unlimited Plan', 
          price: '119.99', 
          hours: 50 
        }
      }
    });
  } catch (error: any) {
    console.error('Error fetching plans:', error);
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
});

export default router;