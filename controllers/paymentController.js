import * as PaymentService from '../services/paymentService.js';
import Transaction from '../models/Transaction.js';

/**
 * Create a virtual account for payment
 * POST /api/payments/create-virtual-account
 */
export const createVirtualAccount = async (req, res) => {
  try {
    const { amount, orderId, customerName, customerEmail, customerPhone, deliveryFee = 0, description } = req.body;

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required and must be greater than 0',
      });
    }

    const paymentData = await PaymentService.createVirtualAccount(amount);

    // Create a pending transaction record
    try {
      const transaction = new Transaction({
        order: orderId || null,
        type: 'payment',
        status: 'pending',
        amount: amount - deliveryFee,
        deliveryFee: deliveryFee,
        totalAmount: amount,
        paymentMethod: 'online',
        externalReference: paymentData.externalReference,
        virtualAccountNumber: paymentData.accountNumber,
        virtualAccountName: paymentData.accountName,
        virtualAccountBank: paymentData.bankName,
        customerName,
        customerEmail,
        customerPhone,
        description: description || 'Virtual account payment',
        metadata: paymentData,
      });
      await transaction.save();
      console.log(`[Payment] Transaction created: ${transaction._id}`);
    } catch (txError) {
      console.error('[Payment] Error creating transaction record:', txError);
      // Don't fail the request if transaction creation fails
    }

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

    // Update transaction status if payment is successful
    if (verificationData.status === 'success' || verificationData.status === 'completed') {
      try {
        const transaction = await Transaction.findOne({ externalReference });
        if (transaction && transaction.status === 'pending') {
          transaction.status = 'success';
          transaction.paidAt = new Date();
          transaction.verifiedAt = new Date();
          await transaction.save();
          console.log(`[Payment] Transaction ${transaction._id} marked as success`);
        }
      } catch (txError) {
        console.error('[Payment] Error updating transaction record:', txError);
      }
    }

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

    // If webhook indicates successful payment, update the order and transaction
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

        // Update transaction status
        const transaction = await Transaction.findOne({ externalReference: webhookData.externalReference });
        if (transaction && transaction.status === 'pending') {
          transaction.status = 'success';
          transaction.paidAt = new Date();
          transaction.verifiedAt = new Date();
          if (order) {
            transaction.order = order._id;
          }
          await transaction.save();
          console.log(`[PaymentWebhook] Transaction ${transaction._id} marked as success`);
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

/**
 * Get transaction history
 * GET /api/payments/transactions
 */
export const getTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, type, startDate, endDate } = req.query;

    const query = {};

    if (status) query.status = status;
    if (type) query.type = type;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('order', 'customerName status totalAmount')
        .populate('user', 'name email'),
      Transaction.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: transactions,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('[Payment] Error fetching transactions:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch transactions',
    });
  }
};

/**
 * Get transaction stats (for admin dashboard)
 * GET /api/payments/stats
 */
export const getTransactionStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const matchQuery = { status: 'success' };

    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
      if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
    }

    const stats = await Transaction.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totalAmount' },
          totalTransactions: { $sum: 1 },
          totalDeliveryFees: { $sum: '$deliveryFee' },
          avgTransactionAmount: { $avg: '$totalAmount' },
        },
      },
    ]);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayStats = await Transaction.aggregate([
      { $match: { status: 'success', createdAt: { $gte: todayStart } } },
      {
        $group: {
          _id: null,
          todayRevenue: { $sum: '$totalAmount' },
          todayTransactions: { $sum: 1 },
        },
      },
    ]);

    return res.status(200).json({
      success: true,
      data: {
        totalRevenue: stats[0]?.totalRevenue || 0,
        totalTransactions: stats[0]?.totalTransactions || 0,
        totalDeliveryFees: stats[0]?.totalDeliveryFees || 0,
        avgTransactionAmount: stats[0]?.avgTransactionAmount || 0,
        todayRevenue: todayStats[0]?.todayRevenue || 0,
        todayTransactions: todayStats[0]?.todayTransactions || 0,
      },
    });
  } catch (error) {
    console.error('[Payment] Error fetching transaction stats:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch transaction stats',
    });
  }
};
