# PayPal Integration Setup

## Prerequisites

1. Create a PayPal Business account at https://www.paypal.com/business
2. Go to PayPal Developer Dashboard: https://developer.paypal.com/

## Setup Steps

### 1. Create PayPal App

1. In PayPal Developer Dashboard, go to **Apps & Credentials**
2. Click **Create App**
3. Name it "Class Notes PWA"
4. Select **Merchant** as the app type
5. Click **Create App**

### 2. Get Your Credentials

After creating the app, you'll get:
- **Client ID** (public)
- **Secret** (keep private)

### 3. Update Your Code

In `public/pricing.html`, replace:
```javascript
<script src="https://www.paypal.com/sdk/js?client-id=YOUR_PAYPAL_CLIENT_ID&currency=USD"></script>
```

With:
```javascript
<script src="https://www.paypal.com/sdk/js?client-id=YOUR_ACTUAL_CLIENT_ID&currency=USD"></script>
```

### 4. Create Subscription Plans in PayPal

For subscription plans, you need to create them in PayPal:

1. Go to PayPal Business Dashboard
2. Navigate to **Subscriptions** → **Plans**
3. Create three plans:

#### Student Plan
- Name: Student Plan
- Price: $29.99/month
- Plan ID: Copy this ID

#### Premium Plan
- Name: Premium Plan  
- Price: $69.99/month
- Plan ID: Copy this ID

#### Unlimited Plan
- Name: Unlimited Plan
- Price: $119.99/month
- Plan ID: Copy this ID

### 5. Update Plan IDs

In `public/pricing.html`, update the plan details:

```javascript
const planDetails = {
  payg: { name: 'Pay-as-you-go', price: '2.00', type: 'payg' },
  student: { name: 'Student Plan', price: '29.99', type: 'subscription', planId: 'YOUR_STUDENT_PLAN_ID' },
  premium: { name: 'Premium Plan', price: '69.99', type: 'subscription', planId: 'YOUR_PREMIUM_PLAN_ID' },
  unlimited: { name: 'Unlimited Plan', price: '119.99', type: 'subscription', planId: 'YOUR_UNLIMITED_PLAN_ID' }
};
```

### 6. Add Environment Variables

Add to your Render environment:
- `PAYPAL_CLIENT_ID` = Your PayPal Client ID
- `PAYPAL_SECRET` = Your PayPal Secret

### 7. Configure Webhooks (Optional)

For better reliability, set up webhooks:

1. In PayPal Developer Dashboard, go to **Webhooks**
2. Add webhook URL: `https://gpt-notes-gbtn.onrender.com/api/paypal-webhook`
3. Subscribe to events:
   - BILLING.SUBSCRIPTION.CREATED
   - BILLING.SUBSCRIPTION.CANCELLED
   - PAYMENT.CAPTURE.COMPLETED

## Testing

### Sandbox Testing

1. Use PayPal Sandbox for testing
2. Create test buyer accounts in Developer Dashboard
3. Use test credit cards

### Test Credentials
- Email: sb-buyer@business.example.com
- Password: Use sandbox password

## Security Notes

1. Never expose your PayPal Secret
2. Always validate webhooks
3. Store subscription IDs securely
4. Implement proper error handling

## Troubleshooting

### "Invalid Client ID"
- Check you're using the correct environment (sandbox vs live)
- Verify Client ID is copied correctly

### Subscription Not Working
- Ensure plans are created and active in PayPal
- Check plan IDs match

### Payment Failed
- Check buyer has sufficient funds
- Verify currency matches (USD)