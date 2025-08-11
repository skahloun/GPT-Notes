# Test Account Documentation

## Overview

Test accounts allow you to bypass the payment system for development and testing purposes. These accounts have unlimited access to all features without requiring PayPal integration.

## Creating Test Accounts

Test accounts are automatically created when registering with specific email patterns:

1. **Email starts with `test@`**
   - Example: `test@example.com`
   - Example: `test123@gmail.com`

2. **Email ends with `@test.com`**
   - Example: `john@test.com`
   - Example: `demo@test.com`

## Test Account Features

- ✅ **Unlimited transcription hours** (9999 hours)
- ✅ **Unlimited credits** (9999 credits)
- ✅ **No payment required**
- ✅ **Automatic bypass of pricing page**
- ✅ **Full access to all features**
- ✅ **Special badge in UI**: "🧪 Test Account - Unlimited"

## How It Works

1. **Registration**: When you register with a test email pattern, the system automatically:
   - Sets `is_test_account = 1` in the database
   - Assigns unlimited plan with 9999 hours
   - Sets subscription status to active
   - Adds 9999 credits balance

2. **Pricing Page**: Test accounts visiting `/pricing.html` will:
   - See a success message
   - Be automatically redirected to the main app after 3 seconds
   - Skip all payment flows

3. **Main App**: Test accounts will see:
   - "🧪 Test Account - Unlimited" in the billing status
   - No usage limits or warnings
   - Full access to all features

## Example Test Credentials

```
Email: test@example.com
Password: test123
```

or

```
Email: demo@test.com
Password: demo123
```

## Technical Implementation

The test account check happens in multiple places:

1. **Registration** (`/api/register`):
   ```javascript
   const isTestAccount = email.toLowerCase().startsWith('test@') || 
                        email.toLowerCase().endsWith('@test.com');
   ```

2. **Database Schema**:
   - Added `is_test_account INTEGER DEFAULT 0` column
   - Test accounts have this set to 1

3. **Billing Status** (`/api/billing-status`):
   - Returns special status for test accounts
   - Shows unlimited hours and credits

4. **Pricing Page**:
   - Checks account status on load
   - Bypasses payment for test accounts

## Security Notes

- Test accounts should only be used in development
- In production, consider disabling test account creation
- Test accounts are clearly marked in the database
- Admin panel can identify and manage test accounts

## Limitations

- Test accounts are for testing only
- They should not be used for production data
- Consider adding expiration dates for test accounts in production