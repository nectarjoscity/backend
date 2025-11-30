/**
 * Payment Service
 * Handles integration with Baya payment API for virtual account creation
 */

const BAYA_API_BASE_URL = 'https://baya.lemu.africa/api/v1';

const errorWithStatus = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

/**
 * Create a virtual account for payment
 * @param {number} amount - The amount to be paid
 * @returns {Promise<Object>} Payment response with virtual account details
 */
export const createVirtualAccount = async (amount) => {
  try {
    const apiKey = process.env.BAYA_API_KEY;
    const apiSecret = process.env.BAYA_API_SECRET;

    if (!apiKey || !apiSecret) {
      throw errorWithStatus(500, 'Payment API credentials not configured');
    }

    if (!amount || amount <= 0) {
      throw errorWithStatus(400, 'Invalid amount. Amount must be greater than 0');
    }

    const response = await fetch(`${BAYA_API_BASE_URL}/developer/payments/create-virtual-account`, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'X-API-Secret': apiSecret,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amount,
      }),
    });

    const responseData = await response.json();

    // Check if response indicates an error
    if (!response.ok || (responseData.statusCode && responseData.statusCode >= 400)) {
      throw errorWithStatus(
        response.status || responseData.statusCode || 500,
        responseData.message || `Payment API error: ${response.statusText}`
      );
    }

    // Return the data object from the response (the API returns { statusCode, message, data })
    return responseData.data || responseData;
  } catch (error) {
    console.error('[PaymentService] Error creating virtual account:', error);
    if (error.status) {
      throw error;
    }
    throw errorWithStatus(500, `Failed to create virtual account: ${error.message}`);
  }
};

/**
 * Verify payment status
 * @param {string} externalReference - The external reference to verify
 * @returns {Promise<Object>} Payment verification response
 */
export const verifyPayment = async (externalReference) => {
  try {
    const apiKey = process.env.BAYA_API_KEY;
    const apiSecret = process.env.BAYA_API_SECRET;

    if (!apiKey || !apiSecret) {
      throw errorWithStatus(500, 'Payment API credentials not configured');
    }

    if (!externalReference) {
      throw errorWithStatus(400, 'External reference is required');
    }

    const response = await fetch(`${BAYA_API_BASE_URL}/developer/payments/check-payment-status`, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'X-API-Secret': apiSecret,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        externalReference: externalReference,
      }),
    });

    const responseData = await response.json();

    // Check if response indicates an error
    if (!response.ok || (responseData.statusCode && responseData.statusCode >= 400)) {
      throw errorWithStatus(
        response.status || responseData.statusCode || 500,
        responseData.message || `Payment verification error: ${response.statusText}`
      );
    }

    // Return the data object from the response
    return responseData.data || responseData;
  } catch (error) {
    console.error('[PaymentService] Error verifying payment:', error);
    if (error.status) {
      throw error;
    }
    throw errorWithStatus(500, `Failed to verify payment: ${error.message}`);
  }
};

/**
 * Process webhook from Baya payment API
 * @param {Object} webhookData - Webhook payload
 * @returns {Promise<Object>} Webhook processing response
 */
export const processWebhook = async (webhookData) => {
  try {
    const apiKey = process.env.BAYA_API_KEY;
    const apiSecret = process.env.BAYA_API_SECRET;

    if (!apiKey || !apiSecret) {
      throw errorWithStatus(500, 'Payment API credentials not configured');
    }

    // Forward webhook to Baya API for processing
    const response = await fetch(`${BAYA_API_BASE_URL}/payments/webhook`, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'X-API-Secret': apiSecret,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(webhookData),
    });

    const responseData = await response.json();

    // Check if response indicates an error
    if (!response.ok || (responseData.statusCode && responseData.statusCode >= 400)) {
      throw errorWithStatus(
        response.status || responseData.statusCode || 500,
        responseData.message || `Webhook processing error: ${response.statusText}`
      );
    }

    // Return the response
    return responseData;
  } catch (error) {
    console.error('[PaymentService] Error processing webhook:', error);
    if (error.status) {
      throw error;
    }
    throw errorWithStatus(500, `Failed to process webhook: ${error.message}`);
  }
};

