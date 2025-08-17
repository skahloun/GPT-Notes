# Local PayPal Testing Steps

1. Set up environment variables:
   ```bash
   export PAYPAL_CLIENT_ID="your-sandbox-client-id"
   export PAYPAL_SECRET="your-sandbox-secret"
   export PAYPAL_ENVIRONMENT="sandbox"
   export APP_URL="http://localhost:6001"
   ```

2. Start the server:
   ```bash
   npm run dev
   ```

3. Access the sandbox pricing page:
   ```
   http://localhost:6001/pricing-sandbox.html
   ```

4. Test with sandbox credentials:
   - Email: sb-zuxhm45215481@personal.example.com
   - Password: testpass123
