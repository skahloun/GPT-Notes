# PayPal Integration Quick Setup

## 1. Update PayPal Client ID in pricing.html

Replace line 341 in `/public/pricing.html`:
```html
<script src="https://www.paypal.com/sdk/js?client-id=YOUR_PAYPAL_CLIENT_ID&currency=USD"></script>
```

With your actual PayPal Client ID:
```html
<script src="https://www.paypal.com/sdk/js?client-id=AcVFoooBar123456789&currency=USD"></script>
```

## 2. Create Subscription Plans in PayPal

Log into PayPal Developer Dashboard and create these subscription plans:

1. **Student Plan**: $29.99/month
2. **Premium Plan**: $69.99/month  
3. **Unlimited Plan**: $119.99/month

## 3. Update Plan IDs in pricing.html

Replace lines 379-383 with your actual plan IDs:
```javascript
const planDetails = {
  payg: { name: 'Pay-as-you-go', price: '2.00', type: 'payg' },
  student: { name: 'Student Plan', price: '29.99', type: 'subscription', planId: 'P-ABC123STUDENT' },
  premium: { name: 'Premium Plan', price: '69.99', type: 'subscription', planId: 'P-DEF456PREMIUM' },
  unlimited: { name: 'Unlimited Plan', price: '119.99', type: 'subscription', planId: 'P-GHI789UNLIMITED' }
};
```

## 4. Add Environment Variables on Render

Add these to your Render service environment:
- `PAYPAL_CLIENT_ID` = Your PayPal Client ID
- `PAYPAL_SECRET` = Your PayPal Secret

## 5. Test the Integration

1. Navigate to `/pricing.html` after registration
2. Select a plan and complete payment
3. Check that billing status appears in main interface

## Current Status

The payment system is fully implemented with:
- ✅ Pricing page with PayPal buttons
- ✅ Database schema for subscriptions and credits
- ✅ Payment service for managing billing
- ✅ Usage tracking and charging
- ✅ Billing status display in UI
- ✅ Webhook handler for subscription events

## What's Left

1. Add your PayPal Client ID to pricing.html
2. Create subscription plans in PayPal
3. Update plan IDs in pricing.html
4. Test the payment flow