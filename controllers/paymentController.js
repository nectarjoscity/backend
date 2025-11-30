import * as PaymentService from '../services/paymentService.js';

/**
 * Create a virtual account for payment
 * POST /api/payments/create-virtual-account
 */
export const createVirtualAccount = async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required and must be greater than 0',
      });
    }

    const paymentData = await PaymentService.createVirtualAccount(amount);

    return res.status(200).json({
      success: true,
      message: 'Virtual account created successfully',
      data: paymentData,
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({
      success: false,
      message: error.message || 'Failed to create virtual account',
    });
  }
};

/**
 * Verify payment status
 * POST /api/payments/verify
 */
export const verifyPayment = async (req, res) => {
  try {
    const { externalReference } = req.body;

    if (!externalReference) {
      return res.status(400).json({
        success: false,
        message: 'External reference is required',
      });
    }

    const verificationData = await PaymentService.verifyPayment(externalReference);

    return res.status(200).json({
      success: true,
      message: 'Payment verification completed',
      data: verificationData,
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({
      success: false,
      message: error.message || 'Failed to verify payment',
    });
  }
};

/**
 * Process payment webhook
 * POST /api/payments/webhook
 */
export const processWebhook = async (req, res) => {
  try {
    const webhookData = req.body;

    // Process webhook through payment service
    const result = await PaymentService.processWebhook(webhookData);

    // If webhook indicates successful payment, update the order
    if (webhookData.status === 'success' && webhookData.externalReference) {
      try {
        // Import Order model and order service dynamically to avoid circular dependencies
        const Order = (await import('../models/Order.js')).default;
        const OrderService = (await import('../services/orderService.js')).default;
        
        // Find order by payment reference
        const order = await Order.findOne({
          paymentReference: webhookData.externalReference,
        }).populate('orderItems');

        if (order && !order.paymentConfirmed) {
          // Update order payment status
          order.paymentConfirmed = true;
          order.status = order.status === 'pending' ? 'confirmed' : order.status;
          await order.save();
          
          // Deduct inventory now that payment is confirmed
          try {
            await OrderService.deductInventoryForOrder(order);
            console.log(`[PaymentWebhook] Inventory deducted for order ${order._id}`);
          } catch (inventoryError) {
            console.error(`[PaymentWebhook] Failed to deduct inventory for order ${order._id}:`, inventoryError);
            // Don't fail the webhook if inventory deduction fails
          }
          
          console.log(`[PaymentWebhook] Order ${order._id} payment confirmed via webhook`);
        }
      } catch (orderError) {
        console.error('[PaymentWebhook] Error updating order:', orderError);
        // Don't fail the webhook if order update fails
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
      data: result,
    });
  } catch (error) {
    const status = error.status || 500;
    console.error('[PaymentWebhook] Error processing webhook:', error);
    return res.status(status).json({
      success: false,
      message: error.message || 'Failed to process webhook',
    });
  }
};

