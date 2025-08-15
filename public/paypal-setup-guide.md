# PayPal Integration Setup Guide

## Current Issue Analysis

Your login loop issue is happening because of one of these reasons:

1. **Client ID Ownership**: The client ID `AU0fYruw5CfR0SEeMTOB1yTqE1C8EQyiYGper0H2_S4UA1xTbCA1VjodXGqrH4tv3Ge85fDw4XA7lVa1` belongs to a different PayPal account than the one you're trying to log into.

2. **Region Mismatch**: The client ID was created in a different country/region than your PayPal account.

## How to Fix

### Step 1: Get Your Own Client ID

1. Go to [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/)
2. Log in with YOUR PayPal account (the one you want to receive payments)
3. Click "Apps & Credentials"
4. Click "Create App"
5. Give it a name (e.g., "Class Notes PWA")
6. Select "Merchant" as the account type
7. Click "Create App"

### Step 2: Get the Correct Credentials

1. Once created, you'll see two sets of credentials:
   - **Sandbox**: For testing (starts with "sb")
   - **Live**: For real payments

2. Click on "Live" tab
3. Copy the "Client ID" (not the secret)

### Step 3: Update Your Code

Replace the client ID in your `pricing.html`:

```javascript
// Replace this line:
<script src="https://www.paypal.com/sdk/js?client-id=AU0fYruw5CfR0SEeMTOB1yTqE1C8EQyiYGper0H2_S4UA1xTbCA1VjodXGqrH4tv3Ge85fDw4XA7lVa1&currency=USD"></script>

// With:
<script src="https://www.paypal.com/sdk/js?client-id=YOUR_NEW_CLIENT_ID&currency=USD"></script>
```

### Step 4: Configure Your App Settings

In the PayPal Developer Dashboard:

1. Click on your app
2. Go to "Live" settings
3. Under "Live App Settings":
   - Add your website URL to "Return URLs"
   - Enable "Accept payments"
   - Enable "PayPal Checkout"

### Step 5: Test with Sandbox First

1. Get your Sandbox Client ID
2. Create test accounts at [Sandbox Accounts](https://developer.paypal.com/dashboard/accounts)
3. Create both a business and personal test account
4. Test the integration with sandbox credentials

## Best Practices

### 1. Use Environment Variables
```javascript
const PAYPAL_CLIENT_ID = process.env.NODE_ENV === 'production' 
  ? 'YOUR_LIVE_CLIENT_ID' 
  : 'YOUR_SANDBOX_CLIENT_ID';
```

### 2. Handle Errors Properly
```javascript
paypal.Buttons({
    onError: function(err) {
        console.error('PayPal Error:', err);
        // Show user-friendly error message
        if (err.message.includes('popup_blocked')) {
            alert('Please allow popups for PayPal checkout');
        }
    }
}).render('#paypal-button-container');
```

### 3. Add Proper Application Context
```javascript
createOrder: function(data, actions) {
    return actions.order.create({
        purchase_units: [{
            amount: {
                value: '10.00'
            }
        }],
        application_context: {
            brand_name: "Class Notes PWA",
            landing_page: "LOGIN", // Forces login page
            shipping_preference: "NO_SHIPPING",
            user_action: "PAY_NOW"
        }
    });
}
```

### 4. Use PayPal's Smart Payment Buttons
```javascript
paypal.Buttons({
    style: {
        layout: 'vertical',
        color: 'blue',
        shape: 'rect',
        label: 'paypal'
    },
    funding: {
        allowed: [paypal.FUNDING.PAYPAL],
        disallowed: [paypal.FUNDING.CREDIT]
    }
}).render('#paypal-button-container');
```

## Alternative Solutions

If you continue to have issues:

1. **PayPal.me**: Create a PayPal.me link at https://paypal.me
2. **Invoice API**: Send invoices programmatically
3. **Payment Links**: Create payment links in PayPal dashboard
4. **Stripe**: Consider Stripe as an alternative (generally easier to integrate)

## Debugging Tips

1. **Check Browser Console**: Look for specific PayPal errors
2. **Network Tab**: Check if requests are failing
3. **PayPal Debug Mode**: Add `&debug=true` to SDK URL
4. **Test Different Browsers**: Some browsers block PayPal popups

## Common Error Messages

- **"Popup blocked"**: Browser blocking PayPal window
- **"Invalid client id"**: Client ID doesn't exist or wrong environment
- **"Access denied"**: CORS or authentication issue
- **"Account not found"**: Email doesn't match any PayPal account