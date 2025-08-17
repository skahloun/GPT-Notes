# PayPal Sandbox Setup Guide

This guide will help you set up PayPal integration using the sandbox environment for testing.

## Prerequisites

1. PayPal Developer Account (free)
2. Access to PayPal Developer Dashboard

## Step 1: Create Sandbox App

1. Go to [PayPal Developer Dashboard](https://developer.paypal.com/)
2. Navigate to **Apps & Credentials**
3. Click **Create App**
4. Fill in:
   - App Name: "Class Notes Sandbox"
   - Select **Sandbox** environment
   - App Type: **Merchant**
5. Click **Create App**

## Step 2: Get Sandbox Credentials

After creating the app, you'll see:
- **Client ID**: Copy this (starts with `Abqc...` or similar)
- **Secret**: Click "Show" and copy this

## Step 3: Create Sandbox Test Accounts

1. In Developer Dashboard, go to **Testing Tools** > **Sandbox Accounts**
2. You should see two default accounts:
   - Business account (ends with @business.example.com)
   - Personal account (ends with @personal.example.com)
3. If not, create them:
   - Click **Create Account**
   - Account Type: **Personal** (for buyer)
   - Country: Your country
   - Click **Create**

## Step 4: Configure Environment Variables

Create a `.env` file in your project root:

```bash
# Copy from .env.example
cp .env.example .env
```

Update these values:

```env
# PayPal Configuration
PAYPAL_CLIENT_ID=your-sandbox-client-id
PAYPAL_SECRET=your-sandbox-secret
PAYPAL_WEBHOOK_ID=leave-empty-for-now
PAYPAL_ENVIRONMENT=sandbox
APP_URL=http://localhost:6001
```

## Step 5: Run Database Migrations

```bash
npm run migrate
```

## Step 6: Start the Application

```bash
npm run dev
```

## Step 7: Test the Integration

1. Navigate to `http://localhost:6001/pricing-sandbox.html`
2. Select a plan or add credits
3. When PayPal window opens, use sandbox test accounts:
   - Email: Your sandbox personal account email
   - Password: The sandbox password (found in Developer Dashboard)

## Step 8: Create Webhook (Optional but Recommended)

1. In PayPal Developer Dashboard, go to your app
2. Scroll to **Webhooks**
3. Add webhook URL: `http://your-domain.com/api/paypal/webhook`
4. Select events:
   - BILLING.SUBSCRIPTION.CREATED
   - BILLING.SUBSCRIPTION.ACTIVATED
   - BILLING.SUBSCRIPTION.CANCELLED
   - BILLING.SUBSCRIPTION.EXPIRED
   - PAYMENT.CAPTURE.COMPLETED
5. Copy the Webhook ID and add to `.env`

## Testing Different Scenarios

### Test Credit Purchase
1. Select "Pay as you go"
2. Complete payment with test account
3. Check user's credit balance updated

### Test Subscription
1. Select any subscription plan
2. Complete payment with test account
3. Check user's subscription status

### Test Failed Payment
Use these test card numbers for specific responses:
- `4000000000000002` - Card declined
- `4000000000009995` - Insufficient funds

## Common Issues

### "Account not found"
- Make sure you're using sandbox credentials
- Use sandbox test accounts, not real PayPal accounts

### Payment buttons don't appear
- Check browser console for errors
- Verify Client ID is correct
- Ensure no ad blockers are interfering

### Webhook not receiving events
- For local testing, use ngrok: `ngrok http 6001`
- Update webhook URL to ngrok URL
- Ensure webhook signature verification is disabled for sandbox

## Moving to Production

When ready for production:

1. Create a live PayPal app
2. Update `.env`:
   ```env
   PAYPAL_CLIENT_ID=your-live-client-id
   PAYPAL_SECRET=your-live-secret
   PAYPAL_ENVIRONMENT=live
   ```
3. Update `pricing.html` to use live client ID
4. Create production webhook
5. Test with small real payment first

## Security Notes

- Never commit `.env` file
- Keep PayPal Secret secure
- Enable webhook verification in production
- Use HTTPS in production
- Validate all payments server-side