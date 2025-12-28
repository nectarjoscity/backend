import mongoose from 'mongoose';

const TransactionSchema = new mongoose.Schema(
    {
        // Reference to order if applicable
        order: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Order',
            index: true,
        },
        // Reference to user if applicable
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            index: true,
        },
        // Transaction type
        type: {
            type: String,
            enum: ['payment', 'refund', 'adjustment', 'subscription'],
            default: 'payment',
            index: true,
        },
        // Transaction status
        status: {
            type: String,
            enum: ['pending', 'success', 'failed', 'cancelled'],
            default: 'pending',
            index: true,
        },
        // Amount in Naira
        amount: {
            type: Number,
            required: true,
            min: 0,
        },
        // Delivery fee if applicable
        deliveryFee: {
            type: Number,
            default: 0,
            min: 0,
        },
        // Total amount (amount + deliveryFee)
        totalAmount: {
            type: Number,
            required: true,
            min: 0,
        },
        // Payment method
        paymentMethod: {
            type: String,
            enum: ['cash', 'card', 'online', 'transfer'],
            default: 'online',
        },
        // External payment reference (from payment provider)
        externalReference: {
            type: String,
            trim: true,
            index: true,
        },
        // Virtual account details
        virtualAccountNumber: {
            type: String,
            trim: true,
        },
        virtualAccountName: {
            type: String,
            trim: true,
        },
        virtualAccountBank: {
            type: String,
            trim: true,
        },
        // Customer info
        customerName: {
            type: String,
            trim: true,
        },
        customerEmail: {
            type: String,
            trim: true,
        },
        customerPhone: {
            type: String,
            trim: true,
        },
        // Additional metadata
        description: {
            type: String,
            trim: true,
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
        },
        // Timestamps for payment lifecycle
        paidAt: {
            type: Date,
        },
        verifiedAt: {
            type: Date,
        },
    },
    { timestamps: true }
);

// Indexes for common queries
TransactionSchema.index({ createdAt: -1 });
TransactionSchema.index({ status: 1, createdAt: -1 });
TransactionSchema.index({ type: 1, status: 1 });

const Transaction = mongoose.model('Transaction', TransactionSchema);
export default Transaction;
