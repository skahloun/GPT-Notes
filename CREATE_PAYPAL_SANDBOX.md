# Create PayPal Sandbox App - Required Steps

## The Issue
The current client ID appears to be a production ID, which won't work for sandbox testing. You need to create a separate sandbox app.

## Steps to Create Sandbox App:

### 1. Go to PayPal Developer Dashboard
- Visit: https://developer.paypal.com/
- Log in with your PayPal account

### 2. Switch to Sandbox Mode
- In the top right, make sure "Sandbox" is selected (not "Live")

### 3. Create New App
1. Go to **Dashboard** → **My Apps & Credentials**
2. Click the **Sandbox** tab
3. Click **Create App**
4. Fill in:
   - **App Name**: Class Notes Sandbox
   - **App Type**: Select "Merchant"
5. Click **Create App**

### 4. Get Your Sandbox Credentials
After creation, you'll see:
- **Client ID**: (will look like: `AXxx...` - about 80 characters)
- **Secret**: (click "Show" to reveal)

### 5. Important: Sandbox vs Production
- **Sandbox Client IDs** are for testing with fake money
- **Production Client IDs** (like AU0fYruw5C...) are for real payments
- They CANNOT be mixed - sandbox client IDs only work with sandbox accounts

### 6. Create Test Accounts
1. Go to **Dashboard** → **Sandbox** → **Accounts**
2. You should see default test accounts:
   - Business account (seller)
   - Personal account (buyer)
3. Note the test buyer email and password

### 7. Update Your Code
Replace the client ID in your pricing pages with your new sandbox client ID.

## Quick Test
To verify if a client ID is sandbox or production:
- Sandbox IDs: Work with test accounts only
- Production IDs: Work with real PayPal accounts only

## Next Steps
1. Create the sandbox app as described above
2. Copy the sandbox client ID
3. I'll help you update the integration with the correct sandbox credentials