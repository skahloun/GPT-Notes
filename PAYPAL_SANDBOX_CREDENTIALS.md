# PayPal Sandbox Credentials for Class Notes

## Application Details
- **App Name**: Class Notes
- **Environment**: Sandbox

## API Credentials
- **Client ID**: `Abqc63iR5d0zwnB5KJskUNru9nxkVXiWo6OZwAgna7nZFTc6ffuTylhHMYd3g_hJlpMY-R6NKHrXtii1`
- **Secret Key**: `EDaYyc2r4lEKAcxIreeVcwF6EKjYblrpnn2HaMtOGmVXbz1nDAIWYMfYXFdCYFKulVgo50ERqPzzI6ER`

## Test Accounts

### Buyer Account (Personal)
- **Email**: `sb-3za1d45220243@personal.example.com`
- **Password**: `z2Tx_6!d`
- **Sandbox URL**: https://sandbox.paypal.com

### Business Account
- **Email**: `sb-oxdnm45215491@business.example.com`
- **Password**: `$$j<3JRr`
- **Sandbox URL**: https://sandbox.paypal.com

## Environment Variables (.env)
```bash
# PayPal Sandbox Configuration
PAYPAL_CLIENT_ID=Abqc63iR5d0zwnB5KJskUNru9nxkVXiWo6OZwAgna7nZFTc6ffuTylhHMYd3g_hJlpMY-R6NKHrXtii1
PAYPAL_SECRET=EDaYyc2r4lEKAcxIreeVcwF6EKjYblrpnn2HaMtOGmVXbz1nDAIWYMfYXFdCYFKulVgo50ERqPzzI6ER
PAYPAL_ENVIRONMENT=sandbox

# App URL for PayPal redirects
APP_URL=http://localhost:6001
```

## Testing Instructions

1. Add the environment variables above to your `.env` file
2. Restart your server
3. Navigate to `/pricing-sandbox-fixed.html`
4. Use the buyer account credentials when prompted by PayPal
5. Complete a test transaction

## Important Notes
- These are SANDBOX credentials only - no real money will be charged
- The buyer account has a balance of $5,000 USD for testing
- Always use these exact credentials for sandbox testing