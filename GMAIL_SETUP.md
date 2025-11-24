# Gmail Email Setup Guide

This guide will help you configure Gmail to send email notifications for order status updates.

## Prerequisites

- A Gmail account
- 2-Step Verification enabled on your Google Account

## Setup Steps

### 1. Enable 2-Step Verification

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Under "Signing in to Google", click **2-Step Verification**
3. Follow the prompts to enable 2-Step Verification

### 2. Generate an App Password

1. Go to [App Passwords](https://myaccount.google.com/apppasswords)
   - If you don't see this option, make sure 2-Step Verification is enabled
2. Select "Mail" as the app
3. Select "Other (Custom name)" as the device
4. Enter "NectarV Restaurant" as the name
5. Click **Generate**
6. Copy the 16-character password (it will look like: `abcd efgh ijkl mnop`)

### 3. Configure Environment Variables

Add the following to your `.env` file:

```env
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=your-16-character-app-password
```

**Important Notes:**
- Use your full Gmail address (e.g., `restaurant@gmail.com`)
- Use the App Password (not your regular Gmail password)
- Remove spaces from the App Password if any
- Keep these credentials secure and never commit them to version control

### 4. Test the Configuration

After setting up, test by:
1. Creating an order with a customer email
2. Updating the order status to "preparing"
3. Checking the customer's email inbox

## Email Notifications

The system sends emails at the following stages:

1. **Order Confirmation** - When an order is first created
2. **Preparing** - When order status changes to "preparing"
3. **Ready** - When order status changes to "ready"
4. **Completed** - When order status changes to "completed"

## Troubleshooting

### "Invalid login" error
- Make sure you're using the App Password, not your regular password
- Verify 2-Step Verification is enabled
- Check that the email address is correct

### "Connection timeout" error
- Check your internet connection
- Verify firewall settings allow SMTP connections
- Try again after a few minutes (Gmail may temporarily block too many requests)

### Emails not being sent
- Check server logs for error messages
- Verify environment variables are set correctly
- Ensure the customer email address is valid
- Check spam/junk folder

## Security Best Practices

1. **Never commit credentials** - Always use environment variables
2. **Use App Passwords** - Never use your main Gmail password
3. **Rotate passwords** - Regenerate App Passwords periodically
4. **Monitor usage** - Check Google Account activity regularly
5. **Use separate account** - Consider creating a dedicated Gmail account for the restaurant

## Alternative: Using a Different Email Service

If you prefer not to use Gmail, you can modify `backend/utils/emailService.js` to use:
- SendGrid
- Mailgun
- AWS SES
- Other SMTP providers

Just update the `createTransporter()` function with the appropriate configuration.

