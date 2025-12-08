import express from 'express';
import * as PaymentController from '../controllers/paymentController.js';

const router = express.Router();

/**
 * @route   POST /api/payments/create-virtual-account
 * @desc    Create a virtual account for payment
 * @access  Public (or Private if you want to add auth)
 */
router.post('/create-virtual-account', PaymentController.createVirtualAccount);

/**
 * @route   POST /api/payments/verify
 * @desc    Verify payment status by external reference
 * @access  Public (or Private if you want to add auth)
 */
router.post('/verify', PaymentController.verifyPayment);

/**
 * @route   POST /api/payments/webhook
 * @desc    Process payment webhook from Baya
 * @access  Public (webhook endpoint)
 */
router.post('/webhook', PaymentController.processWebhook);

/**
 * @route   GET /api/payments/transactions
 * @desc    Get transaction history with pagination and filters
 * @access  Private (admin)
 */
router.get('/transactions', PaymentController.getTransactions);

/**
 * @route   GET /api/payments/stats
 * @desc    Get transaction statistics for dashboard
 * @access  Private (admin)
 */
router.get('/stats', PaymentController.getTransactionStats);

export default router;
